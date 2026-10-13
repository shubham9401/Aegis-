import "server-only";

import type { Address } from "@aegis/sdk";
import type { ActivityEntry } from "./activity-log";
import { tokenToMinorUnits } from "./aegis-contract";

interface EnvioPermission { id: string }
interface EnvioActivity {
  id: string;
  kind: string;
  permissionId: string;
  user?: string | null;
  agent?: string | null;
  actor?: string | null;
  recipient?: string | null;
  action?: string | null;
  amount?: string | null;
  manuallyApproved?: boolean | null;
  timestamp: number;
}

const PERMISSIONS_QUERY = `query AegisPermissions($user: String!) {
  Permission(where: {user: {_ilike: $user}}) { id }
}`;
const ACTIVITY_QUERY = `query AegisActivity($permissionIds: [numeric!]!, $limit: Int!) {
  AegisActivity(
    where: {permissionId: {_in: $permissionIds}}
    order_by: {timestamp: desc}
    limit: $limit
  ) {
    id kind permissionId user agent actor recipient action amount manuallyApproved timestamp
  }
}`;

/** Read public chain history from Envio. It is display-only and never authorizes a request. */
export async function getEnvioActivity(user: Address, limit: number): Promise<ActivityEntry[]> {
  const endpoint = process.env.ENVIO_GRAPHQL_URL?.trim();
  if (!endpoint) return [];
  const permissions = await query<{ Permission: EnvioPermission[] }>(endpoint, PERMISSIONS_QUERY, { user });
  const permissionIds = permissions.Permission.map(({ id }) => id);
  if (permissionIds.length === 0) return [];
  const result = await query<{ AegisActivity: EnvioActivity[] }>(endpoint, ACTIVITY_QUERY, { permissionIds, limit });
  return result.AegisActivity.map((entry) => mapActivity(entry, user));
}

async function query<T>(endpoint: string, queryText: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: queryText, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Envio returned HTTP ${response.status}`);
  const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
  if (!payload.data || payload.errors?.length) throw new Error(payload.errors?.[0]?.message || "Envio returned no data");
  return payload.data;
}

function mapActivity(entry: EnvioActivity, user: Address): ActivityEntry {
  const amountMinor = entry.amount ? tokenToMinorUnits(BigInt(entry.amount)).toString() : undefined;
  const type = entry.kind === "permission_granted" ? "permission_created"
    : entry.kind === "permission_revoked" ? "permission_revoked"
      : entry.kind === "payment_approved" ? "approval_approved"
        : entry.action === "8" ? "action_allowed" : "data_released";
  const details: Record<string, string> = {
    permission_granted: `Permission ${entry.permissionId} recorded on Monad`,
    permission_revoked: `Permission ${entry.permissionId} revoked on Monad`,
    payment_approved: `One-use payment approved on Monad${amountMinor ? ` for ${amountMinor} minor units` : ""}`,
    permission_used: entry.action === "8"
      ? `Vault payment executed${amountMinor ? ` for ${amountMinor} minor units` : ""}${entry.manuallyApproved ? " with one-use approval" : ""}`
      : "Scoped permission used on Monad",
  };
  return {
    id: `envio:${entry.id}`,
    timestamp: entry.timestamp,
    user,
    agentId: entry.agent || entry.actor || "onchain",
    type,
    detail: details[entry.kind] ?? `Aegis contract event: ${entry.kind}`,
    permissionId: entry.permissionId,
    action: entry.action === "8" ? "travel:book" : undefined,
    amountMinor,
  };
}
