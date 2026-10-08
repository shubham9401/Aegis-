// POST /api/approvals — Agent creates an approval request
// GET  /api/approvals?user= — User lists their approvals

import { NextRequest } from "next/server";
import { createApproval, listApprovals } from "@/lib/approval-store";
import { getAegisClient } from "@/lib/aegis";
import { logActivity } from "@/lib/activity-log";
import { createApprovalSchema, addressSchema } from "@/lib/validation";
import { apiError, parseBody } from "@/lib/utils";
import type { Address, AgentAction } from "@aegis/sdk";
import { requireAgent, requireUser } from "@/lib/server-auth";
import { getPermissionStore } from "@/lib/permission-admin";

export async function POST(request: NextRequest) {
  try {
  const identity = await requireAgent(request);
  if (identity instanceof Response) return identity;

  const parsed = await parseBody(request, createApprovalSchema);
  if (parsed instanceof Response) return parsed;
  if (parsed.agentId !== identity) return apiError(403, "AGENT_MISMATCH", "Token is not bound to this agent");

  const now = Math.floor(Date.now() / 1000);
  if (parsed.deadline <= now || parsed.deadline > now + 900) {
    return apiError(400, "INVALID_DEADLINE", "Approval deadline must be within the next 15 minutes");
  }

  const decision = await getAegisClient().check({
    requestId: parsed.requestId,
    kind: "action",
    user: parsed.user as Address,
    agentId: parsed.agentId,
    requestedAt: now,
    action: parsed.action as AgentAction,
    amountMinor: BigInt(parsed.amountMinor),
    currency: parsed.currency,
    service: parsed.service,
  });

  if (decision.outcome === "deny") {
    logActivity({ user: parsed.user, agentId: parsed.agentId, type: "action_denied",
      detail: `Action denied: ${decision.reason}`, reason: decision.reason, permissionId: decision.permissionId,
      action: parsed.action, amountMinor: parsed.amountMinor });
    return apiError(403, decision.reason, "The current permission does not allow this action");
  }
  if (decision.outcome === "allow") {
    return apiError(409, "APPROVAL_NOT_REQUIRED", "This action is already allowed without approval");
  }
  if (parsed.permissionId !== decision.permissionId) {
    return apiError(409, "PERMISSION_MISMATCH", "Approval request does not match the active permission");
  }

  const approvalId = crypto.randomUUID();

  let stored;
  try {
    stored = createApproval({
    approvalId,
    permissionId: parsed.permissionId,
    requestId: parsed.requestId,
    user: parsed.user as Address,
    agentId: parsed.agentId,
    action: parsed.action as AgentAction,
    amountMinor: parsed.amountMinor,
    currency: parsed.currency,
    service: parsed.service,
    requestedAt: now,
    deadline: parsed.deadline,
    agentNote: parsed.agentNote,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const reason = message === "REQUEST_ID_CONFLICT" || message === "APPROVAL_CAPACITY" ? message : "APPROVAL_UNAVAILABLE";
    return apiError(reason === "REQUEST_ID_CONFLICT" ? 409 : 503, reason, "Could not create approval request");
  }

  logActivity({
    user: parsed.user as Address,
    agentId: parsed.agentId,
    type: "action_approval_required",
    detail: `Approval requested for ${parsed.action}: ${parsed.amountMinor} ${parsed.currency} at ${parsed.service}`,
    permissionId: parsed.permissionId,
    action: parsed.action,
    amountMinor: parsed.amountMinor,
  });

  return Response.json(stored, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return apiError(503, "PERMISSION_STATE_UNAVAILABLE", "Permission state is unavailable"); }
}

export async function GET(request: NextRequest) {
  try {
  const url = new URL(request.url);
  const userRaw = url.searchParams.get("user");
  const userResult = addressSchema.safeParse(userRaw);
  if (!userResult.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid user address");
  }
  const authorization = await requireUser(request, userResult.data);
  if (authorization instanceof Response) return authorization;

  const approvals = await Promise.all(listApprovals(userResult.data as Address).map(async (approval) => {
    const permission = await getPermissionStore().getPermission(approval.request.user, approval.request.agentId);
    const rule = permission?.permissionId === approval.request.permissionId
      ? permission.actionRules.find((rule) => rule.action === approval.request.action) : undefined;
    return { ...approval, maxAmountMinor: rule?.maxAmountMinor?.toString() };
  }));

  // Serialize: convert to JSON-safe format
  return Response.json(approvals, { headers: { "Cache-Control": "no-store" } });
  } catch { return apiError(503, "PERMISSION_STATE_UNAVAILABLE", "Permission state is unavailable"); }
}
