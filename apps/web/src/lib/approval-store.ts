// In-memory approval queue for the demo
// Agent creates approvals, user decides them.

import type { Address, AgentAction } from "@aegis/sdk";

export interface ApprovalRequest {
  approvalId: string;
  permissionId: string;
  requestId: string;
  user: Address;
  agentId: string;
  action: AgentAction;
  amountMinor: string;
  currency: string;
  service: string;
  requestedAt: number;
  deadline: number;
  agentNote?: string;
}

export type ApprovalResult =
  | {
      approvalId: string;
      outcome: "approved";
      signer: Address;
      signature: `0x${string}`;
      nonce: `0x${string}`;
      signedAt: number;
    }
  | {
      approvalId: string;
      outcome: "rejected";
      signedAt: number;
    }
  | {
      approvalId: string;
      outcome: "pending";
    };

export interface StoredApproval {
  request: ApprovalRequest;
  result: ApprovalResult;
}

// ─── globalThis singleton ───

const globalApprovals = globalThis as unknown as {
  __aegis_approvals?: Map<string, StoredApproval>;
};

function getApprovalStore(): Map<string, StoredApproval> {
  if (!globalApprovals.__aegis_approvals) {
    globalApprovals.__aegis_approvals = new Map();
  }
  return globalApprovals.__aegis_approvals;
}

/** Agent creates an approval request. */
export function createApproval(req: ApprovalRequest): StoredApproval {
  const store = getApprovalStore();
  const stored: StoredApproval = {
    request: req,
    result: { approvalId: req.approvalId, outcome: "pending" },
  };
  store.set(req.approvalId, stored);
  return stored;
}

/** Get an approval by ID. */
export function getApproval(approvalId: string): StoredApproval | null {
  return getApprovalStore().get(approvalId) ?? null;
}

/** List pending approvals for a user. */
export function listApprovals(user: Address): StoredApproval[] {
  const store = getApprovalStore();
  const results: StoredApproval[] = [];
  for (const approval of store.values()) {
    if (approval.request.user.toLowerCase() === user.toLowerCase()) {
      results.push(approval);
    }
  }
  // Newest first
  return results.sort((a, b) => b.request.requestedAt - a.request.requestedAt);
}

/** User decides on an approval (approve or reject). */
export function decideApproval(
  approvalId: string,
  result: ApprovalResult,
): StoredApproval | null {
  const store = getApprovalStore();
  const existing = store.get(approvalId);
  if (!existing) return null;

  // Cannot re-decide
  if (existing.result.outcome !== "pending") return null;

  // Cannot approve expired requests
  const now = Math.floor(Date.now() / 1000);
  if (existing.request.deadline <= now) return null;

  const updated: StoredApproval = { ...existing, result };
  store.set(approvalId, updated);
  return updated;
}
