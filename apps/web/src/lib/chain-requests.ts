import "server-only";
import { getAddress, verifyTypedData, type Address } from "viem";
import { PAYMENT_REQUEST_TYPES, type ChainPaymentRequest, CHAIN_STATUS } from "@aegis/sdk";
import { aegisAbi, livePermission } from "./chain";
import { readLocalStore, writeLocalStore } from "./local-store";
import { encrypt, decrypt } from "./vault";
export interface StoredChainRequest extends ChainPaymentRequest { user: Address; agentId: string; rootId: string; rejected: boolean; createdAt: number }
const binding = "aegis/chain-payment-queue/v1";
function readQueue(): StoredChainRequest[] {
  const data = readLocalStore<string | null>("chain-payments.json", null);
  return data ? JSON.parse(decrypt(data, binding)) : [];
}
function save(queue: StoredChainRequest[]) { writeLocalStore("chain-payments.json", encrypt(JSON.stringify(queue), binding)); }
export async function authenticatePayment(input: ChainPaymentRequest, audience: string) {
  const live = await livePermission(BigInt(input.permissionId));
  const { permission: p, status, config } = live;
  if (status !== 0) throw new Error(CHAIN_STATUS[status] || "Permission denied");
  if ((p.actions & 8n) === 0n || p.paymentRecipient.toLowerCase() !== input.recipient.toLowerCase()) throw new Error("Payment action or recipient is not permitted");
  const now = Math.floor(Date.now() / 1000);
  if (input.deadline <= now || input.deadline > now + 900 || BigInt(input.deadline) > p.expiresAt) throw new Error("Invalid payment deadline");
  if (!await verifyTypedData({ address: p.agent, domain: { name: "AegisPayments", version: "1", chainId: 10143, verifyingContract: config.address }, types: PAYMENT_REQUEST_TYPES, primaryType: "PaymentRequest", message: {
    permissionId: BigInt(input.permissionId), requestId: input.requestId,
    recipient: getAddress(input.recipient), amount: BigInt(input.amount), deadline: BigInt(input.deadline), audience,
  }, signature: input.signature })) throw new Error("Invalid agent payment signature");
  // permissionStatus checks current ownership of this agent and every ancestor.
  return live;
}
export function enqueuePayment(input: ChainPaymentRequest, user: Address, agentId: bigint, rootId: bigint) {
  const now = Math.floor(Date.now() / 1000);
  const queue = readQueue().filter((q) => q.deadline > now - 86400);
  const existing = queue.find((q) => q.rootId === String(rootId) && q.requestId.toLowerCase() === input.requestId.toLowerCase());
  if (existing) {
    for (const field of ["permissionId", "recipient", "amount", "deadline"] as const) {
      if (String(existing[field]).toLowerCase() !== String(input[field]).toLowerCase()) throw new Error("Request ID conflict");
    }
    return existing;
  }
  if (queue.length >= 500) throw new Error("Payment queue capacity reached");
  const entry = { ...input, user, agentId: String(agentId), rootId: String(rootId), rejected: false, createdAt: now };
  queue.push(entry); save(queue); return entry;
}
export function rejectPayment(user: Address, requestId: string) {
  const queue = readQueue();
  const entries = queue.filter((q) => q.user.toLowerCase() === user.toLowerCase() && q.requestId.toLowerCase() === requestId.toLowerCase());
  if (!entries.length) throw new Error("Request not found");
  for (const entry of entries) entry.rejected = true;
  save(queue);
}
export async function paymentState(entry: StoredChainRequest) {
  const { client, config, permission, status } = await livePermission(BigInt(entry.permissionId));
  const key = await client.readContract({ address: config.address, abi: aegisAbi, functionName: "requestKey", args: [permission.rootId, entry.requestId] });
  const [used, approved] = await Promise.all([
    client.readContract({ address: config.address, abi: aegisAbi, functionName: "usedRequests", args: [key] }),
    client.readContract({ address: config.address, abi: aegisAbi, functionName: "paymentApprovals", args: [key] }),
  ]);
  const now = Math.floor(Date.now() / 1000);
  const exact = approved[0] === BigInt(entry.permissionId) && approved[1].toLowerCase() === entry.recipient.toLowerCase() && approved[2] === BigInt(entry.amount) && approved[3] === BigInt(entry.deadline);
  // Rejection is advisory off-chain; cancelling a mined approval requires cancelPaymentApproval.
  const outcome = used ? "consumed" : status !== 0 ? CHAIN_STATUS[status] : entry.deadline <= now ? "expired" : exact ? "approved" : entry.rejected ? "rejected" : "pending";
  return { ...entry, outcome };
}
export async function listChainPayments(user: Address) {
  const entries = readQueue().filter((q) => q.user.toLowerCase() === user.toLowerCase()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
  // Bound concurrent RPC traffic on the public testnet endpoint.
  const result = [];
  for (const entry of entries) result.push(await paymentState(entry));
  return result;
}
