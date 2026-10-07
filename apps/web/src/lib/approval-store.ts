// Durable local approval queue (single-process filesystem backend).
// Agent creates approvals, user decides them.

import type { Address, AgentAction } from "@aegis/sdk";
import { verifyTypedData } from "viem";
import { AEGIS_EIP712_DOMAIN, ACTION_APPROVAL_TYPES } from "./eip712";
import { readLocalStore, writeLocalStore } from "./local-store";
import { encrypt, decrypt } from "./vault";

/** Verify against the stored request, never agent-supplied signing fields. */
export async function verifyApprovalSignature(request: ApprovalRequest, signature: `0x${string}`, nonce: `0x${string}`): Promise<boolean> {
  try {
    return await verifyTypedData({
      address: request.user, domain: AEGIS_EIP712_DOMAIN, types: ACTION_APPROVAL_TYPES,
      primaryType: "ActionApproval",
      message: { permissionId: request.permissionId, requestId: request.requestId,
        action: request.action, amountMinor: BigInt(request.amountMinor), currency: request.currency,
        service: request.service, nonce, deadline: BigInt(request.deadline) },
      signature,
    });
  } catch { return false; }
}

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
  maxAmountMinor?: string;
}

function getApprovalStore(): Map<string, StoredApproval> {
  const ciphertext = readLocalStore<string | null>("approvals.json", null);
  if (ciphertext === null) return new Map();
  return new Map(JSON.parse(decrypt(ciphertext, "aegis/approval-queue/v1")) as [string, StoredApproval][]);
}

function persistApprovals(store: Map<string, StoredApproval>): void {
  writeLocalStore("approvals.json", encrypt(JSON.stringify([...store]), "aegis/approval-queue/v1"));
}

/** Agent creates an approval request. */
export function createApproval(req: ApprovalRequest): StoredApproval {
  const store = getApprovalStore();
  // Retry transport is idempotent; a request ID cannot describe two actions.
  for (const existing of store.values()) {
    if (existing.request.user.toLowerCase() === req.user.toLowerCase() && existing.request.agentId === req.agentId && existing.request.requestId === req.requestId) {
      const fields = ["permissionId", "action", "amountMinor", "currency", "service", "deadline", "agentNote"] as const;
      if (fields.some((field) => existing.request[field] !== req[field])) throw new Error("REQUEST_ID_CONFLICT");
      return existing;
    }
  }
  if (store.size >= 10000) {
    const now = Math.floor(Date.now() / 1000);
    for (const [id, entry] of store) if (entry.request.deadline < now - 86400) store.delete(id);
    if (store.size >= 10000) throw new Error("APPROVAL_CAPACITY");
  }
  const stored: StoredApproval = {
    request: req,
    result: { approvalId: req.approvalId, outcome: "pending" },
  };
  store.set(req.approvalId, stored);
  persistApprovals(store);
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
  if (result.approvalId !== approvalId || result.outcome === "pending") return null;

  // Cannot re-decide
  if (existing.result.outcome !== "pending") return null;

  // Cannot approve expired requests
  const now = Math.floor(Date.now() / 1000);
  if (existing.request.deadline <= now) return null;

  const updated: StoredApproval = { ...existing, result };
  store.set(approvalId, updated);
  persistApprovals(store);
  return updated;
}
