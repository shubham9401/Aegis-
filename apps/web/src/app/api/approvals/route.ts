// POST /api/approvals — Agent creates an approval request
// GET  /api/approvals?user= — User lists their approvals

import { NextRequest } from "next/server";
import { createApproval, listApprovals } from "@/lib/approval-store";
import { getAegisClient } from "@/lib/aegis";
import { logActivity } from "@/lib/activity-log";
import { createApprovalSchema, addressSchema } from "@/lib/validation";
import { apiError, parseBody } from "@/lib/utils";
import type { Address, AgentAction } from "@aegis/sdk";

export async function POST(request: NextRequest) {
  // Auth: demo agent token
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.AEGIS_DEMO_AGENT_TOKEN;
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return apiError(401, "UNAUTHORIZED", "Invalid or missing demo agent token");
  }

  const parsed = await parseBody(request, createApprovalSchema);
  if (parsed instanceof Response) return parsed;

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
    return apiError(403, decision.reason, "The current permission does not allow this action");
  }
  if (decision.outcome === "allow") {
    return apiError(409, "APPROVAL_NOT_REQUIRED", "This action is already allowed without approval");
  }
  if (parsed.permissionId !== decision.permissionId) {
    return apiError(409, "PERMISSION_MISMATCH", "Approval request does not match the active permission");
  }

  const approvalId = crypto.randomUUID();

  const stored = createApproval({
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

  logActivity({
    user: parsed.user as Address,
    agentId: parsed.agentId,
    type: "action_approval_required",
    detail: `Approval requested for ${parsed.action}: ${parsed.amountMinor} ${parsed.currency} at ${parsed.service}`,
    permissionId: parsed.permissionId,
    action: parsed.action,
    amountMinor: parsed.amountMinor,
  });

  return Response.json(stored, { status: 201 });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userRaw = url.searchParams.get("user");
  const userResult = addressSchema.safeParse(userRaw);
  if (!userResult.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid user address");
  }

  const approvals = listApprovals(userResult.data as Address);

  // Serialize: convert to JSON-safe format
  return Response.json(approvals);
}
