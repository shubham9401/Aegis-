// POST /api/approvals — Agent creates an approval request
// GET  /api/approvals?user= — User lists their approvals

import { NextRequest } from "next/server";
import { createApproval, listApprovals, type ApprovalRequest } from "@/lib/approval-store";
import { getAegisClient } from "@/lib/aegis";
import { logActivityShared } from "@/lib/activity-log";
import { createApprovalSchema, addressSchema } from "@/lib/validation";
import { apiError, parseBody } from "@/lib/utils";
import type { Address, AgentAction } from "@aegis/sdk";
import { requireAgent, requireUser } from "@/lib/server-auth";
import { getPermissionStore } from "@/lib/permission-admin";
import {
  CONTRACT_STATUS,
  contractPermissionLimitMinor,
  contractStatusReason,
  inspectContractPayment,
  isContractAdapter,
} from "@/lib/contract-payments";

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

  const approvalId = crypto.randomUUID();
  const approvalRequest: ApprovalRequest = {
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
  };

  if (isContractAdapter()) {
    try {
      const inspection = await inspectContractPayment(approvalRequest);
      if (inspection.paymentStatus === CONTRACT_STATUS.ALLOWED) {
        return apiError(409, "APPROVAL_NOT_REQUIRED", "This payment is within the live on-chain budget and can execute directly");
      }
      if (inspection.paymentStatus !== CONTRACT_STATUS.BUDGET_EXCEEDED) {
        const reason = contractStatusReason(inspection.paymentStatus);
        return apiError(reason === "VAULT_BALANCE_REQUIRED" ? 409 : 403, reason,
          reason === "VAULT_BALANCE_REQUIRED" ? "Deposit test aUSD into the Aegis vault before paying" : "The live Monad permission does not allow this payment");
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "CONTRACT_DENIED";
      return apiError(403, reason, "The approval request does not match the live Monad permission");
    }
  } else {
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
      await logActivityShared({ user: parsed.user, agentId: parsed.agentId, type: "action_denied",
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
  }

  let stored;
  try {
    stored = createApproval(approvalRequest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const reason = message === "REQUEST_ID_CONFLICT" || message === "APPROVAL_CAPACITY" ? message : "APPROVAL_UNAVAILABLE";
    return apiError(reason === "REQUEST_ID_CONFLICT" ? 409 : 503, reason, "Could not create approval request");
  }

  await logActivityShared({
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

  const user = userResult.data as Address;
  const approvals = await Promise.all(listApprovals(user).map(async (approval) => {
    if (isContractAdapter()) {
      const maxAmountMinor = await contractPermissionLimitMinor(approval.request).catch(() => undefined);
      return { ...approval, maxAmountMinor };
    }
    const permission = await getPermissionStore().getPermission(approval.request.user, approval.request.agentId);
    const rule = permission?.permissionId === approval.request.permissionId
      ? permission.actionRules.find((candidate) => candidate.action === approval.request.action) : undefined;
    return { ...approval, maxAmountMinor: rule?.maxAmountMinor?.toString() };
  }));

  // Serialize: convert to JSON-safe format
  return Response.json(approvals, { headers: { "Cache-Control": "no-store" } });
  } catch { return apiError(503, "PERMISSION_STATE_UNAVAILABLE", "Permission state is unavailable"); }
}
