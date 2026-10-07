// PUT /api/vault — Store encrypted data
// GET /api/vault?user=&scope= — Read ciphertext (or list scopes)

import { NextRequest } from "next/server";
import { vaultWriteBatch, vaultList, vaultReadCiphertext } from "@/lib/vault";
import { vaultBatchWriteSchema, addressSchema, dataScopeSchema } from "@/lib/validation";
import { apiError, parseBody } from "@/lib/utils";
import type { DataScope } from "@aegis/sdk";
import { requireUser } from "@/lib/server-auth";

export async function PUT(request: NextRequest) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const parsed = await parseBody(request, vaultBatchWriteSchema);
  if (parsed instanceof Response) return parsed;

  try { vaultWriteBatch(user, parsed.entries); }
  catch { return apiError(503, "VAULT_UNAVAILABLE", "Encrypted storage is unavailable; no changes were saved"); }

  return Response.json({
    stored: parsed.entries.map((e) => e.scope),
    message: "Values encrypted and stored (demo vault, server-held key)",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  try {
  const url = new URL(request.url);
  const userRaw = url.searchParams.get("user");
  const userResult = addressSchema.safeParse(userRaw);
  if (!userResult.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid user address");
  }
  const user = userResult.data;
  const authorization = await requireUser(request, user);
  if (authorization instanceof Response) return authorization;

  const scopeRaw = url.searchParams.get("scope");
  if (scopeRaw) {
    const scopeResult = dataScopeSchema.safeParse(scopeRaw);
    if (!scopeResult.success) {
      return apiError(400, "INVALID_SCOPE", `Unknown scope: ${scopeRaw}`);
    }
    // Return whether the scope has stored data (no plaintext!)
    const ciphertext = vaultReadCiphertext(user, scopeResult.data as DataScope);
    return Response.json({
      scope: scopeResult.data,
      hasData: ciphertext !== null,
      note: "Ciphertext is stored encrypted; plaintext is never returned via this route",
    }, { headers: { "Cache-Control": "no-store" } });
  }

  // List all scopes for the user
  const entries = vaultList(user);
  return Response.json({ entries }, { headers: { "Cache-Control": "no-store" } });
  } catch { return apiError(503, "VAULT_UNAVAILABLE", "Encrypted storage is unavailable"); }
}
