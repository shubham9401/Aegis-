// GET /api/context/:scope?user=&agentId=
// Gated data release: checks permission via SDK, decrypts and returns value only on "allow"

import { NextRequest } from "next/server";
import { getAegisClient } from "@/lib/aegis";
import { vaultDecrypt } from "@/lib/vault";
import { logActivity } from "@/lib/activity-log";
import { contextQuerySchema, dataScopeSchema } from "@/lib/validation";
import { apiError } from "@/lib/utils";
import type { Address, DataScope } from "@aegis/sdk";
import { requireAgent } from "@/lib/server-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scope: string }> },
) {
  try {
  const identity = await requireAgent(request);
  if (identity instanceof Response) return identity;

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
  });
  if (!queryResult.success) {
    return apiError(400, "VALIDATION_ERROR", queryResult.error.message);
  }
  const { user, agentId } = queryResult.data;
  if (agentId !== identity) return apiError(403, "AGENT_MISMATCH", "Token is not bound to this agent");

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
    async (approvedScope) => vaultDecrypt(user, approvedScope),
  );
  const { decision } = result;

  if (decision.outcome !== "allow") {
    logActivity({
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

  logActivity({
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
