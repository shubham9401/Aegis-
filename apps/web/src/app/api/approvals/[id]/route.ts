// GET /api/approvals/:id — Get approval by ID (agent polls this)

import { NextRequest } from "next/server";
import { getApproval } from "@/lib/approval-store";
import { apiError } from "@/lib/utils";
import { requireAgent } from "@/lib/server-auth";
import { getAegisClient } from "@/lib/aegis";
import { confirmContractApproval, isContractAdapter } from "@/lib/contract-payments";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
  const identity = await requireAgent(request);
  if (identity instanceof Response) return identity;
  const { id } = await params;
  const approval = getApproval(id);
  if (!approval) {
    return apiError(404, "NOT_FOUND", "Approval not found");
  }
  if (approval.request.agentId !== identity) return apiError(403, "AGENT_MISMATCH", "Token is not bound to this agent");
  if (approval.result.outcome === "approved") {
    const action = approval.request;
    if (action.deadline <= Math.floor(Date.now() / 1000)) return apiError(410, "EXPIRED", "Approval expired");
    if (isContractAdapter()) {
      if (!("transactionHash" in approval.result)) return apiError(409, "ONCHAIN_APPROVAL_REQUIRED", "Approval is not recorded on Monad");
      try {
        await confirmContractApproval(action, approval.result.transactionHash);
      } catch (error) {
        return apiError(403, error instanceof Error ? error.message : "INVALID_APPROVAL_TRANSACTION",
          "The live one-use payment approval could not be confirmed");
      }
    } else {
      const decision = await getAegisClient().check({
        ...action, kind: "action", requestedAt: Math.floor(Date.now() / 1000), amountMinor: BigInt(action.amountMinor),
      });
      if (decision.outcome === "deny") return apiError(403, decision.reason, "Permission no longer allows this action");
      if (decision.permissionId !== action.permissionId) return apiError(409, "PERMISSION_MISMATCH", "Permission changed since this approval");
    }
  }
  return Response.json(approval, { headers: { "Cache-Control": "no-store" } });
  } catch { return apiError(503, "PERMISSION_STATE_UNAVAILABLE", "Permission state is unavailable"); }
}
