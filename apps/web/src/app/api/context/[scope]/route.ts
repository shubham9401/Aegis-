// GET /api/context/:scope?user=&agentId=
// Gated data release: checks permission via SDK, decrypts and returns value only on "allow"

import { NextRequest } from "next/server";
import { getAegisClient } from "@/lib/aegis";
import { vaultDecrypt } from "@/lib/vault";
import { logActivity } from "@/lib/activity-log";
import { contextQuerySchema, dataScopeSchema } from "@/lib/validation";
import { apiError } from "@/lib/utils";
import type { Address, DataScope } from "@aegis/sdk";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scope: string }> },
) {
  // Auth: demo agent token
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.AEGIS_DEMO_AGENT_TOKEN;
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return apiError(401, "UNAUTHORIZED", "Invalid or missing demo agent token");
  }

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

  // Run the SDK check
  const aegis = getAegisClient();
  const decision = await aegis.check({
    requestId: crypto.randomUUID(),
    kind: "data",
    user: user as Address,
    agentId,
    requestedAt: Math.floor(Date.now() / 1000),
    scope,
  });

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

  // Decrypt and return the value
  const plaintext = vaultDecrypt(user, scope);
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
  return Response.json({ scope, value: plaintext });
}
