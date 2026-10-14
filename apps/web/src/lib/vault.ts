// Tier 0 vault: AES-GCM encryption with a server-held key
// Label: "demo vault, server-held key"
// The data is sample data, not real personal data.

import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { DataScope } from "@aegis/sdk";
import { readLocalStore, writeLocalStore } from "./local-store";
import { sharedStore, sharedStoreEnabled, storeKey } from "./shared-store";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getServerKey(): Buffer {
  const keyB64 = process.env.VAULT_SERVER_KEY;
  if (!keyB64) {
    throw new Error("VAULT_SERVER_KEY not set. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"");
  }
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) {
    throw new Error("VAULT_SERVER_KEY must be 32 bytes (base64 encoded)");
  }
  return key;
}

export function encrypt(plaintext: string, binding = ""): string {
  const key = getServerKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(Buffer.from(binding, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(ciphertext: string, binding = ""): string {
  const key = getServerKey();
  const data = Buffer.from(ciphertext, "base64");
  if (data.length < IV_LEN + TAG_LEN) throw new Error("Invalid vault ciphertext");
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = data.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAAD(Buffer.from(binding, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// Encrypted fields in a local persistent store.

interface VaultEntry {
  scope: DataScope;
  resourceScope?: string;
  ciphertext: string; // always stored encrypted
  updatedAt: number;
}

// Durable local backend for a single server process. Multi-instance deployments
// must use a shared transactional store rather than an ephemeral filesystem.
function getVaultStore(): Map<string, VaultEntry> {
  const entries = readLocalStore<[string, VaultEntry][]>("vault.json", []);
  if (!Array.isArray(entries)) throw new Error("Invalid vault storage");
  return new Map(entries);
}

function persistVault(store: Map<string, VaultEntry>): void {
  writeLocalStore("vault.json", [...store]);
}

function vaultKey(user: string, scope: DataScope, resourceScope?: string): string {
  const prefix = user.toLowerCase();
  return resourceScope ? `${prefix}:${resourceScope.toLowerCase()}:${scope}` : `${prefix}:${scope}`;
}

/** Opaque on-chain scope used as part of the encryption binding in contract mode. */
export function configuredVaultResourceScope(): string | undefined {
  if ((process.env.NEXT_PUBLIC_ADAPTER ?? "demo") !== "contract") return undefined;
  const value = process.env.AEGIS_RESOURCE_SCOPE?.trim();
  if (!value || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("AEGIS_RESOURCE_SCOPE must be configured as bytes32 in contract mode");
  }
  return value.toLowerCase();
}

/** Store a fact encrypted. Plaintext never persisted. */
export function vaultWrite(user: string, scope: DataScope, plaintext: string, resourceScope?: string): void {
  vaultWriteBatch(user, [{ scope, value: plaintext }], resourceScope);
}

/** Encrypt every entry before one atomic commit, so failed batches change nothing. */
export function vaultWriteBatch(
  user: string,
  entries: readonly { scope: DataScope; value: string }[],
  resourceScope?: string,
): void {
  const store = getVaultStore();
  for (const { scope, value } of entries) {
    const key = vaultKey(user, scope, resourceScope);
    store.set(key, {
      scope,
      resourceScope,
      ciphertext: encrypt(value, key),
      updatedAt: Math.floor(Date.now() / 1000),
    });
  }
  persistVault(store);
}

/** Read an encrypted value. Returns null if not stored. */
export function vaultReadCiphertext(user: string, scope: DataScope, resourceScope?: string): string | null {
  const entry = getVaultStore().get(vaultKey(user, scope, resourceScope));
  return entry?.ciphertext ?? null;
}

/** Decrypt and return a fact. Only call after a passing Aegis check. */
export function vaultDecrypt(user: string, scope: DataScope, resourceScope?: string): string | null {
  const ciphertext = vaultReadCiphertext(user, scope, resourceScope);
  if (!ciphertext) return null;
  return decrypt(ciphertext, vaultKey(user, scope, resourceScope));
}

/** List all vault entries for a user (scopes only, no plaintext). */
export function vaultList(user: string, resourceScope?: string): { scope: DataScope; updatedAt: number }[] {
  const store = getVaultStore();
  const results: { scope: DataScope; updatedAt: number }[] = [];
  const prefix = resourceScope
    ? `${user.toLowerCase()}:${resourceScope.toLowerCase()}:`
    : `${user.toLowerCase()}:`;
  for (const [key, entry] of store) {
    if (key.startsWith(prefix) && entry.resourceScope === resourceScope) {
      results.push({ scope: entry.scope, updatedAt: entry.updatedAt });
    }
  }
  return results;
}

const sharedVaultKey = (user: string, resourceScope?: string) =>
  storeKey(`vault:${user.toLowerCase()}:${resourceScope?.toLowerCase() ?? "demo"}`);

/** Serverless-safe equivalents. Each encrypted field has an independent Redis hash slot. */
export async function vaultWriteBatchShared(user: string, entries: readonly { scope: DataScope; value: string }[], resourceScope?: string): Promise<void> {
  if (!sharedStoreEnabled()) return vaultWriteBatch(user, entries, resourceScope);
  const fields: Record<string, VaultEntry> = {};
  for (const { scope, value } of entries) {
    fields[scope] = { scope, resourceScope, ciphertext: encrypt(value, vaultKey(user, scope, resourceScope)), updatedAt: Math.floor(Date.now() / 1000) };
  }
  if (Object.keys(fields).length) await sharedStore().hset(sharedVaultKey(user, resourceScope), fields);
}

export async function vaultReadCiphertextShared(user: string, scope: DataScope, resourceScope?: string): Promise<string | null> {
  if (!sharedStoreEnabled()) return vaultReadCiphertext(user, scope, resourceScope);
  const entry = await sharedStore().hget<VaultEntry>(sharedVaultKey(user, resourceScope), scope);
  return entry?.ciphertext ?? null;
}

export async function vaultDecryptShared(user: string, scope: DataScope, resourceScope?: string): Promise<string | null> {
  const ciphertext = await vaultReadCiphertextShared(user, scope, resourceScope);
  return ciphertext ? decrypt(ciphertext, vaultKey(user, scope, resourceScope)) : null;
}

export async function vaultListShared(user: string, resourceScope?: string): Promise<{ scope: DataScope; updatedAt: number }[]> {
  if (!sharedStoreEnabled()) return vaultList(user, resourceScope);
  const entries = await sharedStore().hgetall<Record<string, VaultEntry>>(sharedVaultKey(user, resourceScope));
  return Object.values(entries ?? {}).map(({ scope, updatedAt }) => ({ scope, updatedAt }));
}
