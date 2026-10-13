import "server-only";

import type { Address } from "@aegis/sdk";
import { getAddress, parseEventLogs, type Hex } from "viem";
import type { ApprovalRequest } from "./approval-store";
import {
  aegisContractAbi,
  CONTRACT_ACTIONS,
  getContractPublicClient,
  getServerContractConfig,
  minorToTokenUnits,
  tokenToMinorUnits,
} from "./aegis-contract";

export const CONTRACT_STATUS = {
  ALLOWED: 0,
  NOT_FOUND: 1,
  REVOKED: 2,
  EXPIRED: 3,
  IDENTITY_CHANGED: 4,
  WRONG_AGENT: 5,
  INVALID_ACTION: 6,
  ACTION_NOT_ALLOWED: 7,
  WRONG_SCOPE: 8,
  WRONG_RECIPIENT: 9,
  BUDGET_EXCEEDED: 10,
  INSUFFICIENT_BALANCE: 11,
  INVALID_AMOUNT: 12,
} as const;

const STATUS_REASON = [
  "REQUEST_ALLOWED",
  "PERMISSION_NOT_FOUND",
  "PERMISSION_REVOKED",
  "PERMISSION_EXPIRED",
  "AGENT_IDENTITY_CHANGED",
  "AGENT_ADDRESS_MISMATCH",
  "INVALID_ACTION",
  "ACTION_NOT_GRANTED",
  "RESOURCE_SCOPE_MISMATCH",
  "SERVICE_NOT_ALLOWED",
  "AMOUNT_EXCEEDS_LIMIT",
  "VAULT_BALANCE_REQUIRED",
  "AMOUNT_REQUIRED",
] as const;

export interface ContractPermissionRecord {
  user: Address;
  issuer: Address;
  agent: Address;
  paymentRecipient: Address;
  agentId: bigint;
  parentId: bigint;
  rootId: bigint;
  scope: Hex;
  actions: bigint;
  spendingLimit: bigint;
  spent: bigint;
  approvedSpent: bigint;
  expiresAt: bigint;
  depth: number;
  canDelegate: boolean;
  revoked: boolean;
}

export interface ContractPaymentInspection {
  permission: ContractPermissionRecord;
  amount: bigint;
  requestId: Hex;
  requestKey: Hex;
  paymentStatus: number;
}

export function isContractAdapter(): boolean {
  return (process.env.NEXT_PUBLIC_ADAPTER ?? "demo") === "contract";
}

export function contractStatusReason(status: number): string {
  return STATUS_REASON[status] ?? "CONTRACT_DENIED";
}

/** Validate every agent-supplied payment field against the live Monad grant. */
export async function inspectContractPayment(request: ApprovalRequest): Promise<ContractPaymentInspection> {
  if (!/^[1-9]\d*$/.test(request.permissionId)) throw new Error("INVALID_PERMISSION_ID");
  if (!/^0x[a-fA-F0-9]{64}$/.test(request.requestId)) throw new Error("INVALID_REQUEST_ID");
  if (request.action !== "travel:book") throw new Error("INVALID_ACTION");
  if (request.currency !== "USD") throw new Error("CURRENCY_MISMATCH");

  let service: Address;
  try { service = getAddress(request.service) as Address; } catch { throw new Error("SERVICE_NOT_ALLOWED"); }
  let requestedAgentId: bigint;
  try { requestedAgentId = BigInt(request.agentId); } catch { throw new Error("AGENT_ID_MISMATCH"); }

  const client = getContractPublicClient();
  const { address } = getServerContractConfig();
  const permissionId = BigInt(request.permissionId);
  const record = await client.readContract({
    address,
    abi: aegisContractAbi,
    functionName: "getPermission",
    args: [permissionId],
  }) as unknown as ContractPermissionRecord;

  if (record.user.toLowerCase() !== request.user.toLowerCase()) throw new Error("USER_MISMATCH");
  if (record.agentId !== requestedAgentId) throw new Error("AGENT_ID_MISMATCH");
  if ((record.actions & CONTRACT_ACTIONS.PAY) === 0n) throw new Error("ACTION_NOT_GRANTED");
  if (record.paymentRecipient.toLowerCase() !== service.toLowerCase()) throw new Error("SERVICE_NOT_ALLOWED");

  const configuredAgent = process.env.AEGIS_AGENT_ADDRESS?.trim();
  if (!configuredAgent || getAddress(configuredAgent).toLowerCase() !== record.agent.toLowerCase()) {
    throw new Error("AGENT_ADDRESS_MISMATCH");
  }

  const amount = minorToTokenUnits(BigInt(request.amountMinor));
  const requestId = request.requestId as Hex;
  const [permissionStatus, paymentStatus, requestKey] = await Promise.all([
    client.readContract({ address, abi: aegisContractAbi, functionName: "permissionStatus", args: [permissionId] }),
    client.readContract({ address, abi: aegisContractAbi, functionName: "checkPayment", args: [permissionId, record.agent, service, amount] }),
    client.readContract({ address, abi: aegisContractAbi, functionName: "requestKey", args: [record.rootId, requestId] }),
  ]);
  if (Number(permissionStatus) !== CONTRACT_STATUS.ALLOWED) throw new Error(contractStatusReason(Number(permissionStatus)));
  if (await client.readContract({ address, abi: aegisContractAbi, functionName: "usedRequests", args: [requestKey] })) {
    throw new Error("REQUEST_ALREADY_USED");
  }

  return { permission: record, amount, requestId, requestKey, paymentStatus: Number(paymentStatus) };
}

/** Confirm that the passkey account recorded the exact one-use consent on Monad. */
export async function confirmContractApproval(request: ApprovalRequest, transactionHash: Hex): Promise<void> {
  const inspection = await inspectContractPayment(request);
  const client = getContractPublicClient();
  const { address } = getServerContractConfig();
  const receipt = await client.getTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success" || receipt.to?.toLowerCase() !== address.toLowerCase()) {
    throw new Error("INVALID_APPROVAL_TRANSACTION");
  }
  const events = parseEventLogs({ abi: aegisContractAbi, logs: receipt.logs, eventName: "PaymentApproved" });
  const event = events.find(({ args }) =>
    args.permissionId === BigInt(request.permissionId)
    && args.requestId.toLowerCase() === inspection.requestId.toLowerCase()
    && args.user.toLowerCase() === request.user.toLowerCase()
    && args.recipient.toLowerCase() === inspection.permission.paymentRecipient.toLowerCase()
    && args.amount === inspection.amount
    && args.deadline === BigInt(request.deadline));
  if (!event) throw new Error("APPROVAL_EVENT_MISMATCH");

  const approval = await client.readContract({
    address,
    abi: aegisContractAbi,
    functionName: "paymentApprovals",
    args: [inspection.requestKey],
  });
  const [permissionId, recipient, amount, deadline] = approval;
  if (permissionId !== BigInt(request.permissionId)
      || recipient.toLowerCase() !== inspection.permission.paymentRecipient.toLowerCase()
      || amount !== inspection.amount
      || deadline !== BigInt(request.deadline)) {
    throw new Error("APPROVAL_STATE_MISMATCH");
  }
}

export async function contractPermissionLimitMinor(request: ApprovalRequest): Promise<string> {
  if (!/^[1-9]\d*$/.test(request.permissionId)) throw new Error("INVALID_PERMISSION_ID");
  const client = getContractPublicClient();
  const { address } = getServerContractConfig();
  const record = await client.readContract({
    address,
    abi: aegisContractAbi,
    functionName: "getPermission",
    args: [BigInt(request.permissionId)],
  }) as unknown as ContractPermissionRecord;
  if (record.user.toLowerCase() !== request.user.toLowerCase()) throw new Error("USER_MISMATCH");
  return tokenToMinorUnits(record.spendingLimit).toString();
}
