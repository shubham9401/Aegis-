// Activity / denial log
// Tracks permissions created, used, revoked, and denied requests

import type { Address, DecisionReason } from "@aegis/sdk";

export type ActivityType =
  | "permission_created"
  | "permission_revoked"
  | "data_released"
  | "data_denied"
  | "action_allowed"
  | "action_denied"
  | "action_approval_required"
  | "approval_approved"
  | "approval_rejected";

export interface ActivityEntry {
  id: string;
  timestamp: number; // unix seconds
  user: Address;
  agentId: string;
  type: ActivityType;
  detail: string;
  reason?: DecisionReason;
  permissionId?: string;
  scope?: string;
  action?: string;
  amountMinor?: string;
}

// ─── globalThis singleton ───

const globalLog = globalThis as unknown as {
  __aegis_activity?: ActivityEntry[];
};

function getLog(): ActivityEntry[] {
  if (!globalLog.__aegis_activity) {
    globalLog.__aegis_activity = [];
  }
  return globalLog.__aegis_activity;
}

export function logActivity(entry: Omit<ActivityEntry, "id" | "timestamp">): void {
  const log = getLog();
  log.push({
    ...entry,
    id: crypto.randomUUID(),
    timestamp: Math.floor(Date.now() / 1000),
  });
}

export function getActivity(user: Address, limit = 50): ActivityEntry[] {
  const log = getLog();
  return log
    .filter((e) => e.user.toLowerCase() === user.toLowerCase())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}
