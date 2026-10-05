// Tier 0 vault: AES-GCM encryption with a server-held key
// Label: "demo vault, server-held key"
// The data is sample data, not real personal data.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { DataScope } from "@aegis/sdk";

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

export function encrypt(plaintext: string): string {
  const key = getServerKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  const key = getServerKey();
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = data.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

// ─── In-memory encrypted vault store (globalThis singleton) ───

interface VaultEntry {
  scope: DataScope;
  ciphertext: string; // always stored encrypted
  updatedAt: number;
}

const globalVault = globalThis as unknown as {
  __aegis_vault?: Map<string, VaultEntry>;
};

function getVaultStore(): Map<string, VaultEntry> {
  if (!globalVault.__aegis_vault) {
    globalVault.__aegis_vault = new Map();
  }
  return globalVault.__aegis_vault;
}

function vaultKey(user: string, scope: DataScope): string {
  return `${user.toLowerCase()}:${scope}`;
}

/** Store a fact encrypted. Plaintext never persisted. */
export function vaultWrite(user: string, scope: DataScope, plaintext: string): void {
  const store = getVaultStore();
  store.set(vaultKey(user, scope), {
    scope,
    ciphertext: encrypt(plaintext),
    updatedAt: Math.floor(Date.now() / 1000),
  });
}

/** Read an encrypted value. Returns null if not stored. */
export function vaultReadCiphertext(user: string, scope: DataScope): string | null {
  const entry = getVaultStore().get(vaultKey(user, scope));
  return entry?.ciphertext ?? null;
}

/** Decrypt and return a fact. Only call after a passing Aegis check. */
export function vaultDecrypt(user: string, scope: DataScope): string | null {
  const ciphertext = vaultReadCiphertext(user, scope);
  if (!ciphertext) return null;
  return decrypt(ciphertext);
}

/** List all vault entries for a user (scopes only, no plaintext). */
export function vaultList(user: string): { scope: DataScope; updatedAt: number }[] {
  const store = getVaultStore();
  const results: { scope: DataScope; updatedAt: number }[] = [];
  const prefix = user.toLowerCase();
  for (const [key, entry] of store) {
    if (key.startsWith(prefix + ":")) {
      results.push({ scope: entry.scope, updatedAt: entry.updatedAt });
    }
  }
  return results;
}
