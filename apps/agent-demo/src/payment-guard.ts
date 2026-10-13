import type { ContextRelease } from "@aegis/sdk";

/** Explicit instruction, not an LLM interpretation or a supplier quote. */
export function paymentIntent(prompt: string): { amountMinor: string; recipient: string } {
  const matches = [...prompt.matchAll(/\bPayment:\s*USD\s+([1-9]\d{0,29}|0)(?:\.(\d{1,2}))?\s+to\s+(0x[\da-fA-F]{40})(?![\da-fA-F])/g)];
  if (matches.length !== 1 || [...prompt.matchAll(/\bPayment:/g)].length !== 1) throw new Error("Include exactly one explicit payment instruction: Payment: USD 120.00 to 0x<merchant address>. This is a test payment, not a supplier quote.");
  const [, whole, fraction = "", recipient] = matches[0]!;
  const amount = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount <= 0n || /^0x0{40}$/i.test(recipient!)) throw new Error("Payment requires a positive amount and nonzero recipient.");
  return { amountMinor: String(amount), recipient: recipient! };
}

/** Released facts constrain execution locally; they are never sent to Kimi here. */
export function checkReleasedContext(facts: ContextRelease[], amountMinor: string, currency: string, today = new Date().toISOString().slice(0, 10)): string[] {
  const checks: string[] = [];
  for (const fact of facts) {
    if (fact.scope === "profile:travel-budget") {
      const budget = /^(USD|EUR|GBP|INR) (\d{1,30})(?:\.(\d{1,2}))?$/.exec(fact.value);
      if (!budget) throw new Error("Released budget is invalid; update your vault before paying.");
      if (budget[1] !== currency) throw new Error("Released budget currency differs from the payment. No exchange rate is assumed.");
      const limit = BigInt(budget[2]!) * 100n + BigInt((budget[3] ?? "").padEnd(2, "0"));
      if (limit <= 0n || BigInt(amountMinor) > limit) throw new Error("Payment exceeds your released travel budget.");
      checks.push("Released travel budget checked locally.");
    } else if (fact.scope === "profile:passport-validity") {
      const date = new Date(`${fact.value}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fact.value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== fact.value) throw new Error("Released passport expiry is invalid.");
      if (fact.value <= today) throw new Error("Passport has expired or expires today. Update the vault before paying.");
      checks.push("Passport calendar expiry checked locally; document authenticity and entry rules are not verified.");
    } else if (fact.scope === "profile:dietary-preference") {
      checks.push("Dietary preference retained as a trip requirement; this token transfer cannot request a meal from an airline.");
    }
  }
  return checks;
}
