export const CURRENCIES = ["USD", "EUR", "GBP", "INR"] as const;
export const DIETARY_OPTIONS = ["No preference", "Vegetarian", "Vegan", "Halal", "Kosher", "Gluten-free", "Dairy-free"] as const;

export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Calendar expiry only; this does not authenticate a passport or establish entry eligibility. */
export function passportExpiryStatus(value: string, today: string): string {
  if (!validCalendarDate(value)) return "Select a valid expiry date.";
  if (value < today) return "Expired";
  if (value === today) return "Expires today";
  const days = Math.round((Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return `Not expired · ${days} day${days === 1 ? "" : "s"} remaining`;
}

export function validProfileValue(scope: string, value: string): boolean {
  if (scope === "profile:passport-validity") return validCalendarDate(value);
  if (scope === "profile:travel-budget") {
    const match = /^(USD|EUR|GBP|INR) (\d{1,30})(?:\.(\d{1,2}))?$/.exec(value);
    return !!match && BigInt(match[2]) * 100n + BigInt((match[3] ?? "").padEnd(2, "0")) > 0n;
  }
  if (scope === "profile:dietary-preference") return DIETARY_OPTIONS.some(option => option.toLowerCase() === value.toLowerCase());
  return false;
}
