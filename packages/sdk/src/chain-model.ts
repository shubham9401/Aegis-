/** Contract mode uses raw six-decimal aUSD-TEST units, never floating point. */
export const PAYMENT_REQUEST_TYPES = {
  PaymentRequest: [
    { name: "permissionId", type: "uint256" },
    { name: "requestId", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "deadline", type: "uint64" },
    { name: "audience", type: "string" },
  ],
} as const;
export interface ChainPaymentRequest {
  permissionId: string;
  requestId: `0x${string}`;
  recipient: `0x${string}`;
  amount: string;
  deadline: number;
  signature: `0x${string}`;
}
export const CHAIN_STATUS = ["Allowed", "NotFound", "Revoked", "Expired", "IdentityChanged", "WrongAgent", "InvalidAction", "ActionNotAllowed", "WrongScope", "WrongRecipient", "BudgetExceeded", "InsufficientBalance", "InvalidAmount"] as const;
export function parseTestAmount(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) throw new Error("Use a nonnegative amount with at most six decimals.");
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole!) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (amount >= 2n ** 256n) throw new Error("Amount exceeds uint256.");
  return amount;
}
export function centsToTestUnits(cents: string): bigint {
  if (!/^(0|[1-9]\d*)$/.test(cents)) throw new Error("Expected integer cents.");
  const amount = BigInt(cents) * 10_000n;
  if (amount >= 2n ** 256n) throw new Error("Amount exceeds uint256.");
  return amount;
}
