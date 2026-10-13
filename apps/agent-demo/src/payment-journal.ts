import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { DataScope } from "@aegis/sdk";

export interface PaymentJournal {
  version: 1;
  fingerprint: string;
  requestId: `0x${string}`;
  amountMinor: string;
  recipient: string;
  requestedDataScopes: DataScope[];
  deadline?: number;
  transactionHash?: string;
  confirmed?: boolean;
}
export function paymentFingerprint(contract: string, permission: string, signer: string, prompt: string): string {
  return createHash("sha256").update(JSON.stringify([10143, contract.toLowerCase(), permission, signer.toLowerCase(), prompt])).digest("hex");
}

/** One persistent operator host. The contract remains the atomic payment/replay boundary. */
export function openPaymentJournal(fingerprint: string, suppliedId?: string) {
  if (!/^[\da-f]{64}$/.test(fingerprint)) throw new Error("Invalid payment instruction fingerprint.");
  let requestId = (suppliedId || `0x${randomBytes(32).toString("hex")}`) as `0x${string}`;
  if (!/^0x[\da-fA-F]{64}$/.test(requestId) || BigInt(requestId) === 0n) throw new Error("AEGIS_PAYMENT_REQUEST_ID must be a nonzero bytes32.");
  const keystore = process.env.AEGIS_AGENT_KEYSTORE_PATH;
  if (!keystore) throw new Error("AEGIS_AGENT_KEYSTORE_PATH is required for durable payment state.");
  const directory = path.resolve(process.env.AEGIS_AGENT_STATE_DIR || path.join(path.dirname(path.resolve(keystore)), "aegis-payment-journal"));
  const checkout = fileURLToPath(new URL("../../..", import.meta.url));
  const relative = path.relative(checkout, directory);
  if (!(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))) throw new Error("Keep AEGIS_AGENT_STATE_DIR outside the Git checkout.");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Keep prompt fingerprints private; on-chain request IDs are random, not prompt hashes.
  const filename = path.join(directory, `${suppliedId ? `request-${requestId.toLowerCase()}` : `intent-${fingerprint}`}.json`);
  const lock = `${filename}.lock`;
  let descriptor: number;
  try { descriptor = fs.openSync(lock, "wx", 0o600); }
  catch { throw new Error(`Payment is locked by another run, or an interrupted run needs reconciliation. Inspect ${lock} and the contract before removing a stale lock.`); }
  fs.writeFileSync(descriptor, String(process.pid)); fs.closeSync(descriptor);
  let closed = false;
  const close = () => { if (!closed) { fs.unlinkSync(lock); closed = true; } };
  try {
    let record: PaymentJournal | undefined;
    if (fs.existsSync(filename)) {
      record = JSON.parse(fs.readFileSync(filename, "utf8")) as PaymentJournal;
      if (!suppliedId && typeof record?.requestId === "string") requestId = record.requestId;
      if (record.version !== 1 || record.fingerprint !== fingerprint || !/^0x[\da-fA-F]{64}$/.test(requestId) || BigInt(requestId) === 0n || record.requestId.toLowerCase() !== requestId.toLowerCase() ||
        !/^[1-9]\d*$/.test(record.amountMinor) || !/^0x[\da-fA-F]{40}$/.test(record.recipient) ||
        !Array.isArray(record.requestedDataScopes) || record.requestedDataScopes.some(scope => !["profile:dietary-preference", "profile:travel-budget", "profile:passport-validity"].includes(scope)) ||
        (record.deadline !== undefined && (!Number.isSafeInteger(record.deadline) || record.deadline <= 0)) ||
        (record.transactionHash !== undefined && !/^0x[\da-fA-F]{64}$/.test(record.transactionHash)) ||
        (record.confirmed !== undefined && typeof record.confirmed !== "boolean")) throw new Error("Payment journal is corrupt or this request ID belongs to a different instruction. Refusing to replace it.");
    }
    return { requestId, record, filename, close, save(next: PaymentJournal) {
      if (closed || next.fingerprint !== fingerprint || next.requestId.toLowerCase() !== requestId.toLowerCase()) throw new Error("Invalid journal write.");
      const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
      const fd = fs.openSync(temporary, "wx", 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(next)); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      fs.renameSync(temporary, filename);
    } };
  } catch (error) { close(); throw error; }
}
