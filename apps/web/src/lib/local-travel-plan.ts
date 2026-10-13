import { getAddress } from "viem";

/** Explicit, scripted fallback for a testnet demonstration without an AI API key. */
export function localTravelPlan(request: string) {
  const instructions = [...request.matchAll(/\bPayment:\s*USD\s+([1-9]\d{0,11}|0)(?:\.(\d{1,2}))?\s+to\s+(0x[\da-fA-F]{40})(?![\da-fA-F])/g)];
  if (instructions.length !== 1 || [...request.matchAll(/\bPayment:/g)].length !== 1) return null;
  const [, whole, fraction = "", merchant] = instructions[0];
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  if (cents <= 0n) return null;
  let service: `0x${string}`;
  try { service = getAddress(merchant); } catch { return null; }

  return {
    summary: `Scripted local trip proposal for USD ${whole}${fraction ? `.${fraction}` : ""} with test merchant ${service}. No ticket has been booked.`,
    requestedDataScopes: ["profile:dietary-preference", "profile:travel-budget"],
    proposedAction: { action: "travel:book", amountMinor: cents.toString(), currency: "USD", service },
  };
}
