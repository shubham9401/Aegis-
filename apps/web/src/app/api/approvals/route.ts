// POST /api/approvals — Agent creates an approval request
// GET  /api/approvals?user= — User lists their approvals

import { NextRequest } from "next/server";
import { createApproval, listApprovals } from "@/lib/approval-store";
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

  const approvalId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

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
