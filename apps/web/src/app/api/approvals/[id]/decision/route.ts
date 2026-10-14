// POST /api/approvals/:id/decision — User approves or rejects

import { NextRequest } from "next/server";
import { decideApproval, getApproval } from "@/lib/approval-store";
import { logActivityShared } from "@/lib/activity-log";
import { approvalDecisionSchema } from "@/lib/validation";
import { apiError, parseBody } from "@/lib/utils";
import type { Address } from "@aegis/sdk";
import { requireUser } from "@/lib/server-auth";
import { getAegisClient } from "@/lib/aegis";
import { verifyApprovalSignature } from "@/lib/approval-store";
import { confirmContractApproval, isContractAdapter } from "@/lib/contract-payments";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
  const { id } = await params;

  const existing = getApproval(id);
  if (!existing) {
    return apiError(404, "NOT_FOUND", "Approval not found");
  }
  const authorization = await requireUser(request, existing.request.user);
  if (authorization instanceof Response) return authorization;

  // Check if expired
  const now = Math.floor(Date.now() / 1000);
  if (existing.request.deadline <= now) {
    return apiError(410, "EXPIRED", "Approval request has expired");
  }

  // Check if already decided
  if (existing.result.outcome !== "pending") {
    return apiError(409, "ALREADY_DECIDED", `Approval already ${existing.result.outcome}`);
  }

  const parsed = await parseBody(request, approvalDecisionSchema);
  if (parsed instanceof Response) return parsed;

  if (parsed.outcome === "approved" && parsed.signer.toLowerCase() !== existing.request.user.toLowerCase()) {
    return apiError(403, "SIGNER_MISMATCH", "Only the permission owner may approve this request");
  }

  if (parsed.outcome === "approved") {
    const action = existing.request;
    if (isContractAdapter()) {
      if (!("transactionHash" in parsed)) {
        return apiError(400, "ONCHAIN_APPROVAL_REQUIRED", "Approve this exact payment on Monad with the passkey account");
      }
      try {
        await confirmContractApproval(action, parsed.transactionHash as `0x${string}`);
      } catch (error) {
        return apiError(403, error instanceof Error ? error.message : "INVALID_APPROVAL_TRANSACTION",
          "The transaction does not record this exact one-use payment approval");
      }
    } else {
      if (!("signature" in parsed)) {
        return apiError(400, "OFFCHAIN_SIGNATURE_REQUIRED", "Sign the structured approval with the passkey account");
      }
      const decision = await getAegisClient().check({
        ...action, kind: "action", requestedAt: now, amountMinor: BigInt(action.amountMinor),
      });
      if (decision.outcome === "deny") return apiError(403, decision.reason, "Permission no longer allows this action");
      if (decision.permissionId !== action.permissionId) return apiError(409, "PERMISSION_MISMATCH", "Permission changed since this request");
      if (!(await verifyApprovalSignature(action, parsed.signature as `0x${string}`, parsed.nonce as `0x${string}`))) {
        return apiError(403, "INVALID_SIGNATURE", "Signature does not match the owner and structured action");
      }
    }
  }

  const result =
    parsed.outcome === "approved"
      ? "transactionHash" in parsed ? {
          approvalId: id,
          outcome: "approved" as const,
          signer: parsed.signer as Address,
          transactionHash: parsed.transactionHash as `0x${string}`,
          signedAt: now,
        } : {
          approvalId: id,
          outcome: "approved" as const,
          signer: parsed.signer as Address,
          signature: parsed.signature as `0x${string}`,
          nonce: parsed.nonce as `0x${string}`,
          signedAt: now,
        }
      : {
          approvalId: id,
          outcome: "rejected" as const,
          signedAt: now,
        };

  const updated = decideApproval(id, result);
  if (!updated) {
    return apiError(409, "DECIDE_FAILED", "Could not process decision");
  }

  await logActivityShared({
    user: existing.request.user,
    agentId: existing.request.agentId,
    type: parsed.outcome === "approved" ? "approval_approved" : "approval_rejected",
    detail: `Approval ${parsed.outcome} for ${existing.request.action}: ${existing.request.amountMinor} ${existing.request.currency}`,
    permissionId: existing.request.permissionId,
    action: existing.request.action,
    amountMinor: existing.request.amountMinor,
  });

  return Response.json(updated, { headers: { "Cache-Control": "no-store" } });
  } catch { return apiError(503, "PERMISSION_STATE_UNAVAILABLE", "Permission state is unavailable"); }
}
