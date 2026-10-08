// Formatting & conversion utilities
// bigint is NOT JSON-serializable: all HTTP boundaries use strings

import type { Address } from "@aegis/sdk";

/** Format minor units (cents) as a dollar string. */
export function formatCurrency(minorUnits: string | bigint, currency = "USD"): string {
  const cents = BigInt(minorUnits);
  const major = cents / 100n;
  const fraction = ((cents < 0n ? -cents : cents) % 100n).toString().padStart(2, "0");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(cents < 0n && major === 0n ? -0 : major)
    .map((part) => part.type === "fraction" ? fraction : part.value).join("");
}

/** Convert a nonnegative decimal amount to cents without floating-point rounding. */
export function decimalToMinorUnits(value: string): string {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Enter a nonnegative amount with at most two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))).toString();
}

/** Format a unix timestamp (seconds) as a human-readable date. */
export function formatExpiry(unixSeconds: number): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(unixSeconds * 1000));
}

/** Truncate an address for display. */
export function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Time remaining as a human-readable string. */
export function timeRemaining(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = unixSeconds - now;
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Decision reason codes → human-readable messages. */
export function reasonMessage(reason: string): string {
  const messages: Record<string, string> = {
    PERMISSION_NOT_FOUND: "No permission found for this agent",
    PERMISSION_REVOKED: "Permission has been revoked",
    PERMISSION_EXPIRED: "Permission has expired",
    PARENT_PERMISSION_NOT_FOUND: "The delegated permission's parent no longer exists",
    PARENT_PERMISSION_REVOKED: "The parent permission has been revoked",
    PARENT_PERMISSION_EXPIRED: "The parent permission has expired",
    DELEGATION_EXCEEDS_PARENT: "The delegated permission exceeds its parent",
    PERMISSION_CHAIN_INVALID: "The delegated permission chain is invalid",
    DATA_SCOPE_NOT_GRANTED: "Data scope not granted to this agent",
    ACTION_NOT_GRANTED: "Action not granted to this agent",
    SERVICE_NOT_ALLOWED: "Service not in the allowed list",
    CURRENCY_MISMATCH: "Currency does not match the permission",
    AMOUNT_EXCEEDS_LIMIT: "Amount exceeds the permitted limit",
    SENSITIVE_ACTION_REQUIRES_APPROVAL: "This action requires user approval",
    REQUEST_ALLOWED: "Request allowed",
  };
  return messages[reason] ?? reason;
}

/** Standard error response shape for all API routes. */
export function apiError(status: number, reason: string, detail?: string) {
  return Response.json({ error: reason, detail }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Parse an incoming JSON body safely. */
export async function parseBody<T>(request: Request, schema: { parse: (v: unknown) => T }): Promise<T | Response> {
  try {
    const reader = request.body?.getReader();
    if (!reader) return apiError(400, "VALIDATION_ERROR", "A JSON request body is required.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        return apiError(413, "BODY_TOO_LARGE", "Request body exceeds 16 KB.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    return schema.parse(body);
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Request body does not match the required schema.");
  }
}
