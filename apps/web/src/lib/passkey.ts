"use client";
import { createPasskeyWithPrfOutput, getPasskeyPrfOutput, createSecp256k1SigningSession, type PasskeyCredentialMetadata } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
const KEY = "aegis_passkey_v1";
export function storedPasskey(): PasskeyCredentialMetadata | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "null");
    if (stored?.rpId === location.hostname && typeof stored.credentialId === "string") return { credentialId: stored.credentialId, transports: stored.transports };
  } catch { /* Recover using a discoverable assertion. */ }
}
function signingSession(entropy: Uint8Array) {
  let seed: Uint8Array | undefined, root: HDKey | undefined, derived: HDKey | undefined;
  try {
    seed = mnemonicToSeedSync(entropyToMnemonic(entropy, wordlist));
    root = HDKey.fromMasterSeed(seed); derived = root;
    // Wipe each intermediate HD node rather than leaving path intermediates to GC.
    for (const index of [0x8000002c, 0x8000003c, 0x80000000, 0, 0]) {
      const parent: HDKey = derived!;
      derived = parent.deriveChild(index);
      parent.wipePrivateData();
    }
    const privateKey = derived!.privateKey;
    if (!privateKey) throw new Error("Passkey account derivation failed.");
    try { const session = createSecp256k1SigningSession({ privateKey }); return { session, account: toViemAccount(session) }; }
    finally { privateKey.fill(0); }
  } finally { entropy.fill(0); seed?.fill(0); root?.wipePrivateData(); derived?.wipePrivateData(); }
}
export async function openPasskey(create = false) {
  if (!window.isSecureContext || !window.PublicKeyCredential) throw new Error("Passkeys require HTTPS or localhost and a WebAuthn-capable browser.");
  const rpId = location.hostname;
  const result = create
    ? await createPasskeyWithPrfOutput({ rp: { id: rpId, name: "Aegis" }, user: { name: "aegis-user", displayName: "Aegis User" } })
    : await getPasskeyPrfOutput({ rpId, credential: storedPasskey() });
  try {
    localStorage.setItem(KEY, JSON.stringify({ rpId, credentialId: result.credentialId, transports: "transports" in result ? result.transports : storedPasskey()?.transports }));
    return signingSession(result.prfOutput);
  } finally { result.prfOutput.fill(0); }
}
