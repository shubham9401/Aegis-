// PUT /api/vault — Store encrypted data
// GET /api/vault?user=&scope= — Read ciphertext (or list scopes)

import { NextRequest } from "next/server";
import { vaultWrite, vaultList, vaultReadCiphertext } from "@/lib/vault";
import { vaultBatchWriteSchema, addressSchema, dataScopeSchema } from "@/lib/validation";
import { apiError, parseBody } from "@/lib/utils";
import type { DataScope } from "@aegis/sdk";

export async function PUT(request: NextRequest) {
  const parsed = await parseBody(request, vaultBatchWriteSchema);
  if (parsed instanceof Response) return parsed;

  // The user address comes from the request body or a session.
  // For the demo, we accept it in a header (X-Aegis-User).
  const userRaw = request.headers.get("x-aegis-user");
  const userResult = addressSchema.safeParse(userRaw);
  if (!userResult.success) {
    return apiError(400, "VALIDATION_ERROR", "Missing or invalid X-Aegis-User header");
  }
  const user = userResult.data;

  for (const entry of parsed.entries) {
    vaultWrite(user, entry.scope as DataScope, entry.value);
  }

  return Response.json({
    stored: parsed.entries.map((e) => e.scope),
    message: "Values encrypted and stored (demo vault, server-held key)",
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userRaw = url.searchParams.get("user");
  const userResult = addressSchema.safeParse(userRaw);
  if (!userResult.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid user address");
  }
  const user = userResult.data;

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
    });
  }

  // List all scopes for the user
  const entries = vaultList(user);
  return Response.json({ entries });
}
