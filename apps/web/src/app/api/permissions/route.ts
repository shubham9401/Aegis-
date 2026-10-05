// POST /api/permissions — Grant a permission
// GET  /api/permissions?user= — List permissions
// DELETE /api/permissions?user=&agentId= — Revoke a permission

import { NextRequest } from "next/server";
import { getPermissionAdmin } from "@/lib/permission-admin";
import { logActivity } from "@/lib/activity-log";
import { grantPermissionSchema, addressSchema } from "@/lib/validation";
import { apiError, parseBody } from "@/lib/utils";
import type { Address, AgentPermission, ActionRule } from "@aegis/sdk";

export async function POST(request: NextRequest) {
  const parsed = await parseBody(request, grantPermissionSchema);
  if (parsed instanceof Response) return parsed;

  // User address from header (in production, from the authenticated session)
  const userRaw = request.headers.get("x-aegis-user");
  const userResult = addressSchema.safeParse(userRaw);
  if (!userResult.success) {
    return apiError(400, "VALIDATION_ERROR", "Missing or invalid X-Aegis-User header");
  }
  const user = userResult.data as Address;

  const now = Math.floor(Date.now() / 1000);
  const permissionId = `perm-${crypto.randomUUID().slice(0, 8)}`;

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

  logActivity({
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

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const userRaw = url.searchParams.get("user");
  const userResult = addressSchema.safeParse(userRaw);
  if (!userResult.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid user address");
  }
  const user = userResult.data as Address;

  const admin = getPermissionAdmin();
  const permissions = await admin.list(user);

  // Serialize bigint fields as strings for JSON
  const serialized = permissions.map(serializePermission);

  return Response.json({ permissions: serialized });
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const userRaw = url.searchParams.get("user");
  const agentId = url.searchParams.get("agentId");

  const userResult = addressSchema.safeParse(userRaw);
  if (!userResult.success || !agentId) {
    return apiError(400, "VALIDATION_ERROR", "Missing user or agentId");
  }
  const user = userResult.data as Address;

  const admin = getPermissionAdmin();
  const result = await admin.revoke(user, agentId);

  logActivity({
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
