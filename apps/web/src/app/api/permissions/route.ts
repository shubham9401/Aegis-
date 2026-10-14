// POST /api/permissions — Grant a permission
// GET  /api/permissions?user= — List permissions
// DELETE /api/permissions?user=&agentId= — Revoke a permission

import { NextRequest } from "next/server";
import { getPermissionAdmin } from "@/lib/permission-admin";
import { logActivityShared } from "@/lib/activity-log";
import { grantPermissionSchema, addressSchema } from "@/lib/validation";
import { apiError, parseBody } from "@/lib/utils";
import type { Address, AgentPermission, ActionRule } from "@aegis/sdk";
import { requireUser } from "@/lib/server-auth";
import { getServerContractConfig } from "@/lib/aegis-contract";

async function grant(request: NextRequest) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const parsed = await parseBody(request, grantPermissionSchema);
  if (parsed instanceof Response) return parsed;

  const configuredAgent = process.env.AEGIS_AGENT_ID?.trim();
  if (!configuredAgent) return apiError(503, "AGENT_UNCONFIGURED", "Configure the supported agent before granting permissions");
  if (parsed.agentId !== configuredAgent) return apiError(400, "UNKNOWN_AGENT", "Select the configured agent; arbitrary agent labels cannot authenticate");

  const now = Math.floor(Date.now() / 1000);
  const permissionId = `perm-${crypto.randomUUID()}`;

  const actionRules: ActionRule[] = parsed.actionRules.map((r) => ({
    action: r.action,
    maxAmountMinor: r.maxAmountMinor ? BigInt(r.maxAmountMinor) : undefined,
    currency: r.currency,
    allowedServices: r.allowedServices,
    requireApprovalAboveMinor: r.requireApprovalAboveMinor
      ? BigInt(r.requireApprovalAboveMinor)
      : undefined,
  }));

  const permission: AgentPermission = {
    permissionId,
    user,
    agentId: parsed.agentId,
    dataScopes: parsed.dataScopes,
    actionRules,
    expiresAt: now + parsed.expiresInSeconds,
  };

  const admin = getPermissionAdmin();
  const result = await admin.grant(permission);

  await logActivityShared({
    user,
    agentId: parsed.agentId,
    type: "permission_created",
    detail: `Permission granted: ${parsed.dataScopes.join(", ")}; actions: ${parsed.actionRules.map((r) => r.action).join(", ")}`,
    permissionId,
  });

  return Response.json({
    permissionId,
    txHash: result.txHash,
    expiresAt: permission.expiresAt,
  }, { status: 201 });
}

async function list(request: NextRequest) {
  const url = new URL(request.url);
  const userRaw = url.searchParams.get("user");
  const userResult = addressSchema.safeParse(userRaw);
  if (!userResult.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid user address");
  }
  const user = userResult.data as Address;
  const authenticated = await requireUser(request, user);
  if (authenticated instanceof Response) return authenticated;

  const admin = getPermissionAdmin();
  const permissions = await admin.list(user);

  // Serialize bigint fields as strings for JSON
  const serialized = permissions.map(serializePermission);

  const adapter = process.env.NEXT_PUBLIC_ADAPTER ?? "demo";
  return Response.json({
    permissions: serialized,
    adapter,
    configuredAgentId: process.env.AEGIS_AGENT_ID?.trim() || null,
    contract: adapter === "contract" ? getServerContractConfig() : undefined,
  });
}

async function revoke(request: NextRequest) {
  const url = new URL(request.url);
  const userRaw = url.searchParams.get("user");
  const agentId = url.searchParams.get("agentId");

  const userResult = addressSchema.safeParse(userRaw);
  if (!userResult.success || !agentId) {
    return apiError(400, "VALIDATION_ERROR", "Missing user or agentId");
  }
  const user = userResult.data as Address;
  const authenticated = await requireUser(request, user);
  if (authenticated instanceof Response) return authenticated;

  const admin = getPermissionAdmin();
  const existing = await admin.list(user);
  if (!existing.some((p) => p.agentId === agentId)) {
    return apiError(404, "PERMISSION_NOT_FOUND");
  }
  const result = await admin.revoke(user, agentId);

  await logActivityShared({
    user,
    agentId,
    type: "permission_revoked",
    detail: `Permission revoked for agent ${agentId}`,
  });

  return Response.json({ revoked: true, txHash: result.txHash });
}

// bigint → string for JSON serialization
function serializePermission(p: AgentPermission) {
  return {
    ...p,
    actionRules: p.actionRules.map((r) => ({
      ...r,
      maxAmountMinor: r.maxAmountMinor?.toString(),
      requireApprovalAboveMinor: r.requireApprovalAboveMinor?.toString(),
    })),
  };
}

function handle(handler: (request: NextRequest) => Promise<Response>) {
  return async (request: NextRequest) => {
    try {
      if ((process.env.NEXT_PUBLIC_ADAPTER ?? "demo") === "contract" && request.method !== "GET") {
        return apiError(405, "USER_SIGNATURE_REQUIRED", "Grant and revoke transactions must be signed with the user's passkey in the browser.");
      }
      const response = await handler(request);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch {
      return apiError(503, "PERMISSION_STORE_UNAVAILABLE", "Permission state could not be read or saved. No success has been confirmed.");
    }
  };
}

export const POST = handle(grant);
export const GET = handle(list);
export const DELETE = handle(revoke);
