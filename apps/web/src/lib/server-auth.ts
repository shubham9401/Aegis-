import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAddress, verifyMessage, type Address } from "viem";
import { z } from "zod";

// Single-process deployment only: restarts invalidate sessions, never authenticate them.
const globals = globalThis as typeof globalThis & { __aegisAuth?: {
  challenges: Map<string, { address: Address; message: string; origin: string; expires: number }>;
  sessions: Map<string, { address: Address; expires: number }>;
  rates: Map<string, { count: number; expires: number }>;
} };
const state = globals.__aegisAuth ??= { challenges: new Map(), sessions: new Map(), rates: new Map() };
const SESSION = "aegis_owner";
const CHALLENGE = "aegis_challenge";
const TTL = 3600;
export const authError = (error: string, detail: string, status: number) =>
  NextResponse.json({ error, detail }, { status, headers: { "Cache-Control": "no-store" } });

function cookie(request: Request, name: string): string | undefined {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}
export function checkOrigin(request: Request, required = false): Response | null {
  const actual = request.headers.get("origin");
  const expected = process.env.AEGIS_APP_ORIGIN || new URL(request.url).origin;
  if ((required && !actual) || (actual && actual !== expected) || request.headers.get("sec-fetch-site") === "cross-site") {
    return authError("FORBIDDEN_ORIGIN", "Request must originate from the Aegis application.", 403);
  }
  return null;
}
function prune() {
  const now = Date.now();
  for (const map of [state.challenges, state.sessions, state.rates]) {
    for (const [key, value] of map) if (value.expires <= now) map.delete(key);
  }
}
export function authRateLimit(key: string, limit = 30): Response | null {
  prune();
  const record = state.rates.get(key) ?? { count: 0, expires: Date.now() + 60_000 };
  record.count++;
  state.rates.set(key, record);
  if (record.count > limit || state.rates.size > 10_000) return authError("RATE_LIMITED", "Too many requests. Try again in a minute.", 429);
  return null;
}
export async function requireUser(request: Request, expectedAddress?: string): Promise<Address | Response> {
  const origin = checkOrigin(request, !["GET", "HEAD"].includes(request.method));
  if (origin) return origin;
  prune();
  const session = state.sessions.get(cookie(request, SESSION) || "");
  if (!session) return authError("UNAUTHENTICATED", "Sign in with your passkey.", 401);
  if (expectedAddress && expectedAddress.toLowerCase() !== session.address.toLowerCase()) {
    return authError("FORBIDDEN", "The authenticated account does not own this resource.", 403);
  }
  return authRateLimit(`user:${session.address}`, 120) ?? session.address;
}
export async function requireAgent(request: Request): Promise<string | Response> {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const token = process.env.AEGIS_DEMO_AGENT_TOKEN;
  if (!token || token.length < 32) return authError("AGENT_AUTH_UNCONFIGURED", "Configure a random agent token of at least 32 characters.", 503);
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const a = Buffer.from(token), b = Buffer.from(supplied);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return authError("UNAUTHENTICATED_AGENT", "A valid agent bearer token is required.", 401);
  const agentId = process.env.AEGIS_AGENT_ID;
  if (!agentId) return authError("AGENT_AUTH_UNCONFIGURED", "Configure the agreed AEGIS_AGENT_ID.", 503);
  return authRateLimit(`agent:${agentId}`, 60) ?? agentId;
}
const addressSchema = z.object({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }).strict();
const proofSchema = addressSchema.extend({ signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/) }).strict();
async function authBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.length;
      if (length > 16384) { await reader.cancel(); return null; }
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return null; } finally { reader.releaseLock(); }
}
const options = (request: Request, maxAge: number) => ({ httpOnly: true, sameSite: "strict" as const, secure: new URL(request.url).protocol === "https:", path: "/", maxAge });
export async function createChallenge(request: Request): Promise<Response> {
  const origin = checkOrigin(request, true);
  if (origin) return origin;
  const rate = authRateLimit(`login:${request.headers.get("x-forwarded-for") || "local"}`, 20);
  if (rate) return rate;
  const body = addressSchema.safeParse(await authBody(request));
  if (!body.success) return authError("INVALID_REQUEST", "A valid account address is required.", 400);
  if (state.challenges.size >= 1000) return authError("RATE_LIMITED", "Login capacity reached. Try again shortly.", 429);
  const address = getAddress(body.data.address), id = randomBytes(32).toString("hex");
  const old = cookie(request, CHALLENGE);
  if (old) state.challenges.delete(old);
  const site = process.env.AEGIS_APP_ORIGIN || new URL(request.url).origin;
  const expires = Date.now() + 120_000;
  const message = `Aegis sign-in\nOrigin: ${site}\nAccount: ${address}\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nSign only to authenticate to Aegis. This grants no transaction permission.`;
  state.challenges.set(id, { address, message, origin: site, expires });
  const response = NextResponse.json({ message }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(CHALLENGE, id, options(request, 120));
  return response;
}
export async function verifyChallenge(request: Request): Promise<Response> {
  const origin = checkOrigin(request, true);
  if (origin) return origin;
  const id = cookie(request, CHALLENGE) || "";
  const challenge = state.challenges.get(id);
  state.challenges.delete(id); // Consume before await: a proof cannot race or replay.
  const body = proofSchema.safeParse(await authBody(request));
  if (!challenge || challenge.origin !== (process.env.AEGIS_APP_ORIGIN || new URL(request.url).origin) || challenge.expires <= Date.now() || !body.success || challenge.address.toLowerCase() !== body.data.address.toLowerCase()) {
    return authError("INVALID_PROOF", "Sign-in challenge is missing, expired, or invalid. Start sign-in again.", 401);
  }
  let valid = false;
  try { valid = await verifyMessage({ address: challenge.address, message: challenge.message, signature: body.data.signature as `0x${string}` }); } catch { /* Invalid proofs fail closed. */ }
  if (!valid) return authError("INVALID_PROOF", "Signature does not match this account.", 401);
  prune();
  if (state.sessions.size >= 10_000) return authError("RATE_LIMITED", "Session capacity reached.", 429);
  const old = cookie(request, SESSION);
  if (old) state.sessions.delete(old);
  const session = randomBytes(32).toString("hex");
  state.sessions.set(session, { address: challenge.address, expires: Date.now() + TTL * 1000 });
  const response = NextResponse.json({ address: challenge.address }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION, session, options(request, TTL));
  response.cookies.set(CHALLENGE, "", options(request, 0));
  return response;
}
export async function endSession(request: Request): Promise<Response> {
  const origin = checkOrigin(request, true);
  if (origin) return origin;
  state.sessions.delete(cookie(request, SESSION) || "");
  state.challenges.delete(cookie(request, CHALLENGE) || "");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION, "", options(request, 0));
  response.cookies.set(CHALLENGE, "", options(request, 0));
  return response;
}
