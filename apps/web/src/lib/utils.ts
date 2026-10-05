// Formatting & conversion utilities
// bigint is NOT JSON-serializable: all HTTP boundaries use strings

import type { Address } from "@aegis/sdk";

/** Format minor units (cents) as a dollar string. */
export function formatCurrency(minorUnits: string | bigint, currency = "USD"): string {
  const cents = typeof minorUnits === "bigint" ? Number(minorUnits) : Number(minorUnits);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
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
  return Response.json({ error: reason, detail }, { status });
}

/** Parse an incoming JSON body safely. */
export async function parseBody<T>(request: Request, schema: { parse: (v: unknown) => T }): Promise<T | Response> {
  try {
    const body = await request.json();
    return schema.parse(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request body";
    return apiError(400, "VALIDATION_ERROR", msg);
  }
}
