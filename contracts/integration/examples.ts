import { Contract, type ContractRunner, hexlify, randomBytes, parseUnits } from 'ethers';
import { aegisAbi } from './abi.js';
import { ACTION, STATUS, type GrantParams } from './constants.js';

/** Teammate 2 supplies the wallet signer (Mera/Privy/external) after user approval. */
export function connectAegis(address: string, runner: ContractRunner) {
  return new Contract(address, aegisAbi, runner);
}

export function travelGrant(agentId: bigint, merchant: `0x${string}`, decimals: number): GrantParams {
  return {
    agentId,
    scope: hexlify(randomBytes(32)) as `0x${string}`,
    actions: ACTION.READ_DIETARY | ACTION.READ_DESTINATION | ACTION.READ_ITINERARY | ACTION.PAY,
    spendingLimit: parseUnits('500', decimals),
    expiresAt: BigInt(Math.floor(Date.now() / 1000) + 86400),
    canDelegate: true,
    paymentRecipient: merchant,
  };
}

/** Read after receipt; avoid racing nextPermissionId() in a multi-user app. */
export async function grantFromUser(aegis: Contract, params: GrantParams): Promise<bigint> {
  const receipt = await (await aegis.grantPermission(params)).wait();
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== (await aegis.getAddress()).toLowerCase()) continue;
    const parsed = aegis.interface.parseLog(log);
    if (parsed?.name === 'PermissionGranted') return parsed.args.permissionId as bigint;
  }
  throw new Error('No PermissionGranted event');
}

/** A gateway preflight, NOT an authentication mechanism or implementation of decryption. */
export async function requireDietaryAccess(aegis: Contract, id: bigint, authenticatedActor: string, scope: string) {
  const status: bigint = await aegis.checkPermission(id, authenticatedActor, ACTION.READ_DIETARY, scope);
  if (status !== STATUS.Allowed) throw new Error(`Aegis denied request; status=${status}`);
  // Teammate 3 now retrieves the field mapped to BOTH grant.user and grant.scope.
  // Fail closed on RPC errors. Never return a profile key or unrelated fields.
}

/** Must be connected to the registered agent owner signer. Contract enforces all checks. */
export async function payFromAgent(aegis: Contract, id: bigint, merchant: string, amount: bigint, requestId: string) {
  return (await aegis.pay(id, merchant, amount, requestId)).wait();
}

/** Exact, EXTRA payment consent; submitted by the USER wallet, never an agent signer. */
export async function approveExtraPayment(aegis: Contract, id: bigint, requestId: string,
  merchant: string, amount: bigint, deadline: bigint) {
  return (await aegis.approvePayment(id, requestId, merchant, amount, deadline)).wait();
}
