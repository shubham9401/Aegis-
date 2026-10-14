// GET /api/context/:scope?user=&agentId=
// Gated data release: checks permission via SDK, decrypts and returns value only on "allow"

import { NextRequest } from "next/server";
import { getAegisClient } from "@/lib/aegis";
import { vaultDecryptShared } from "@/lib/vault";
import { logActivityShared } from "@/lib/activity-log";
import { contextQuerySchema, dataScopeSchema } from "@/lib/validation";
import { apiError } from "@/lib/utils";
import { CONTRACT_DATA_ACTION, type Address, type DataScope } from "@aegis/sdk";
import { requireAgent, requireContractAgent } from "@/lib/server-auth";
import { checkContractContext } from "@/lib/contract-permission";
import { livePermission } from "@/lib/chain";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scope: string }> },
) {
  try {
  const { scope: rawScope } = await params;
  const scopeResult = dataScopeSchema.safeParse(rawScope);
  if (!scopeResult.success) {
    return apiError(400, "INVALID_SCOPE", `Unknown scope: ${rawScope}`);
  }
  const scope: DataScope = scopeResult.data;

  const url = new URL(request.url);
  const queryResult = contextQuerySchema.safeParse({
    user: url.searchParams.get("user"),
    agentId: url.searchParams.get("agentId"),
    permissionId: url.searchParams.get("permissionId") ?? undefined,
  });
  if (!queryResult.success) {
    return apiError(400, "VALIDATION_ERROR", queryResult.error.message);
  }
  const { user, agentId, permissionId } = queryResult.data;
  const contractMode = (process.env.NEXT_PUBLIC_ADAPTER ?? "demo") === "contract";
  if (contractMode && !permissionId) {
    return apiError(400, "INVALID_PERMISSION_ID", "permissionId is required in contract mode");
  }
  // Resolve authority from the grant so delegated agents are authenticated too.
  const live = contractMode ? await livePermission(BigInt(permissionId!)) : undefined;
  if (live && live.status !== 0) return apiError(403, "CONTRACT_DENIED", "Permission or an ancestor is inactive.");
  const identity = contractMode
    ? await requireContractAgent(request, {
        agentId,
        permissionId: permissionId!,
        action: CONTRACT_DATA_ACTION[scope],
      }, { agentId: live!.permission.agentId.toString(), actor: live!.permission.agent })
    : await requireAgent(request);
  if (identity instanceof Response) return identity;
  if (agentId !== identity) return apiError(403, "AGENT_MISMATCH", "Authentication is not bound to this agent");

  if (contractMode) {
    const chainDecision = await checkContractContext({
      permissionId: permissionId!,
      user: user as Address,
      agentId,
      dataScope: scope,
      authenticatedActor: live!.permission.agent,
    });
    if (chainDecision.outcome !== "allow") {
      const status = chainDecision.contractStatus === undefined
        ? ""
        : ` (contract status ${chainDecision.contractStatus})`;
      await logActivityShared({
        user: user as Address,
        agentId,
        type: "data_denied",
        detail: `On-chain data request for ${scope} denied: ${chainDecision.reason}${status}`,
        reason: chainDecision.reason,
        permissionId,
        scope,
      });
      return apiError(403, chainDecision.reason, `Live Monad permission check failed${status}`);
    }

    // The encrypted record is bound to the exact opaque scope read from the
    // live grant. Decryption happens only after the final on-chain check.
    const plaintext = await vaultDecryptShared(user, scope, chainDecision.resourceScope);
    if (plaintext === null) {
      return apiError(404, "DATA_NOT_FOUND", `No data stored for scope "${scope}"`);
    }
    await logActivityShared({
      user: user as Address,
      agentId,
      type: "data_released",
      detail: `Data released after live Monad check for ${scope}`,
      permissionId,
      scope,
    });
    return Response.json(
      { scope, value: plaintext },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Keep the authorization check and plaintext release behind one SDK gate.
  // The callback is never invoked for denied requests.
  const aegis = getAegisClient();
  const result = await aegis.readData(
    {
      requestId: crypto.randomUUID(),
      kind: "data",
      user: user as Address,
      agentId,
      requestedAt: Math.floor(Date.now() / 1000),
      scope,
    },
    async (approvedScope) => vaultDecryptShared(user, approvedScope),
  );
  const { decision } = result;

  if (decision.outcome !== "allow") {
    await logActivityShared({
      user: user as Address,
      agentId,
      type: "data_denied",
      detail: `Data request for ${scope} denied: ${decision.reason}`,
      reason: decision.reason,
      permissionId: decision.permissionId,
      scope,
    });
    return apiError(403, decision.reason, `Data access denied for scope "${scope}"`);
  }

  const plaintext = result.data;
  if (plaintext === null) {
    return apiError(404, "DATA_NOT_FOUND", `No data stored for scope "${scope}"`);
  }

  await logActivityShared({
    user: user as Address,
    agentId,
    type: "data_released",
    detail: `Data released for scope ${scope}`,
    permissionId: decision.permissionId,
    scope,
  });

  // Return plaintext only on allow. Never log the plaintext.
  return Response.json({ scope, value: plaintext }, { headers: { "Cache-Control": "no-store" } });
  } catch { return apiError(503, "CONTEXT_UNAVAILABLE", "Permission state or encrypted storage is unavailable"); }
}
