import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAddress, verifyMessage, verifyTypedData, type Address } from "viem";
import { z } from "zod";
import { readLocalStore, writeLocalStore } from "./local-store";

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

const agentProofTypes = {
  DataRequest: [
    { name: "permissionId", type: "uint256" },
    { name: "scope", type: "bytes32" },
    { name: "action", type: "uint256" },
    { name: "requestId", type: "bytes32" },
    { name: "deadline", type: "uint64" },
    { name: "audience", type: "string" },
  ],
} as const;

interface ContractAgentRequest {
  agentId: string;
  permissionId: string;
  action: bigint;
}

/** Verify a fresh EIP-712 data request signed by the configured ERC-8004 owner. */
export async function requireContractAgent(
  request: Request,
  expected: ContractAgentRequest,
  verifiedIdentity?: { agentId: string; actor: Address },
): Promise<string | Response> {
  const origin = checkOrigin(request);
  if (origin) return origin;
  const configuredAgentId = verifiedIdentity?.agentId ?? process.env.AEGIS_AGENT_ID?.trim();
  const actorRaw = verifiedIdentity?.actor ?? process.env.AEGIS_AGENT_ADDRESS?.trim();
  const contractRaw = process.env.AEGIS_CONTRACT_ADDRESS?.trim();
  const resourceScope = process.env.AEGIS_RESOURCE_SCOPE?.trim();
  const audience = process.env.AEGIS_APP_ORIGIN?.trim() || new URL(request.url).origin;
  if (!configuredAgentId || !actorRaw || !contractRaw || !resourceScope) {
    return authError("AGENT_AUTH_UNCONFIGURED", "Configure the contract agent identity and resource scope.", 503);
  }
  if (configuredAgentId !== expected.agentId) {
    return authError("AGENT_MISMATCH", "Request does not use the configured ERC-8004 agent ID.", 403);
  }

  let actor: Address;
  let verifyingContract: Address;
  try {
    actor = getAddress(actorRaw);
    verifyingContract = getAddress(contractRaw);
  } catch {
    return authError("AGENT_AUTH_UNCONFIGURED", "Configured contract agent addresses are invalid.", 503);
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(resourceScope)) {
    return authError("AGENT_AUTH_UNCONFIGURED", "AEGIS_RESOURCE_SCOPE must be bytes32.", 503);
  }

  const requestId = request.headers.get("x-aegis-request-id") || "";
  const deadlineRaw = request.headers.get("x-aegis-deadline") || "";
  const signature = request.headers.get("x-aegis-signature") || "";
  if (!/^0x[a-fA-F0-9]{64}$/.test(requestId) || !/^[1-9]\d*$/.test(deadlineRaw)
      || !/^0x[a-fA-F0-9]{130}$/.test(signature)) {
    return authError("INVALID_AGENT_PROOF", "A signed agent request is required.", 401);
  }
  const deadline = BigInt(deadlineRaw);
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (deadline <= now || deadline > now + 120n) {
    return authError("INVALID_AGENT_PROOF", "Agent proof is expired or too far in the future.", 401);
  }

  let valid = false;
  try {
    valid = await verifyTypedData({
      address: actor,
      domain: {
        name: "AegisDataGateway",
        version: "1",
        chainId: 10143,
        verifyingContract,
      },
      types: agentProofTypes,
      primaryType: "DataRequest",
      message: {
        permissionId: BigInt(expected.permissionId),
        scope: resourceScope as `0x${string}`,
        action: expected.action,
        requestId: requestId as `0x${string}`,
        deadline,
        audience,
      },
      signature: signature as `0x${string}`,
    });
  } catch { /* Invalid typed data fails closed. */ }
  if (!valid) return authError("INVALID_AGENT_PROOF", "Agent signature does not match the ERC-8004 owner.", 401);

  const used = readLocalStore<Record<string, number>>("agent-request-nonces.json", {});
  const nowNumber = Number(now);
  for (const [id, expires] of Object.entries(used)) if (expires <= nowNumber) delete used[id];
  const replayKey = `${configuredAgentId}:${requestId.toLowerCase()}`;
  if (used[replayKey]) return authError("AGENT_PROOF_REPLAY", "Agent request ID has already been used.", 409);
  used[replayKey] = Number(deadline);
  if (Object.keys(used).length > 10_000) {
    return authError("RATE_LIMITED", "Agent proof capacity reached. Try again shortly.", 429);
  }
  writeLocalStore("agent-request-nonces.json", used);
  return authRateLimit(`agent:${configuredAgentId}`, 60) ?? configuredAgentId;
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
