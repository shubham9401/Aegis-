"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { formatExpiry, reasonMessage } from "@/lib/utils";
import { ConnectionGate } from "@/components/ConnectionGate";
import { Icon, type IconName } from "@/components/Icon";

interface ActivityEntry {
  id: string;
  timestamp: number;
  user: string;
  agentId: string;
  type: string;
  detail: string;
  reason?: string;
  permissionId?: string;
  scope?: string;
  action?: string;
  amountMinor?: string;
}

const typeConfig: Record<string, { icon: IconName; label: string; css: string }> = {
  permission_created: { icon: "shield", label: "Permission Created", css: "created" },
  permission_revoked: { icon: "lock", label: "Permission Revoked", css: "revoked" },
  data_released: { icon: "database", label: "Data Released", css: "allowed" },
  data_denied: { icon: "lock", label: "Data Denied", css: "denied" },
  action_allowed: { icon: "check", label: "Action Allowed", css: "allowed" },
  action_denied: { icon: "lock", label: "Action Denied", css: "denied" },
  action_approval_required: { icon: "key", label: "Approval Required", css: "approval" },
  approval_approved: { icon: "check", label: "Approved", css: "allowed" },
  approval_rejected: { icon: "lock", label: "Rejected", css: "denied" },
};

export default function ActivityPage() {
  const { isConnected, address, authenticatedFetch } = useAuth();
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/activity?user=${address}`);
      const data = await res.json();
      if (!res.ok) throw new Error(`${data.error ?? "Unable to load activity"}${data.detail ? `: ${data.detail}` : ""}`);
      if (!Array.isArray(data.activity)) throw new Error("Invalid activity response");
      setActivity(data.activity);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to load activity");
    } finally {
      setLoading(false);
    }
  }, [address, authenticatedFetch]);

  useEffect(() => {
    if (isConnected && address) {
      const initial = window.setTimeout(() => void loadActivity(), 0);
      // Auto-refresh every 5 seconds so events appear quickly
      const interval = window.setInterval(() => void loadActivity(), 5000);
      return () => {
        window.clearTimeout(initial);
        window.clearInterval(interval);
      };
    }
  }, [isConnected, address, loadActivity]);

  if (!isConnected) {
    return (
      <ConnectionGate
        icon="activity"
        title="Inspect the decision history"
        description="Connect a passkey session to review permission changes, releases, denials, and revocations."
      />
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Activity</h1>
      <p className="page-subtitle">
        Recorded permission changes and app decisions, newest first. This feed covers requests made through Aegis.
      </p>

      {error ? <div role="alert" className="alert-error">{error}</div> : null}
      <div className="glass-card" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border-color)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
            {activity.length} event{activity.length !== 1 ? "s" : ""}
          </h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Auto-refreshing</span>
            <button
              aria-label="Refresh activity"
              className="btn btn-ghost"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={loadActivity}
            >
              <Icon name="refresh" size={14} />
            </button>
          </div>
        </div>

        {loading && activity.length === 0 ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="loading-shimmer" style={{ height: 60, borderRadius: 8 }} />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <div className="empty-state roomy">
            <div className="empty-state-icon"><Icon name="activity" size={21} /></div>
            <p style={{ fontSize: 14 }}>No activity yet</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              Grant a permission, store some data, or trigger an agent request to see events here.
            </p>
          </div>
        ) : (
          <div>
            {activity.map((entry) => {
              const config = typeConfig[entry.type] ?? {
                icon: "activity" as IconName,
                label: entry.type,
                css: "created",
              };
              return (
                <div key={entry.id} className="activity-item">
                  <div className={`activity-icon ${config.css}`}><Icon name={config.icon} size={17} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{config.label}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                        {formatExpiry(entry.timestamp)}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>
                      {entry.detail}
                    </p>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Agent: <span style={{ color: "var(--aegis-primary-light)" }}>{entry.agentId.split(":").pop()}</span>
                      </span>
                      {entry.permissionId && (
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                          {entry.permissionId}
                        </span>
                      )}
                      {entry.reason && (
                        <span
                          style={{
                            fontSize: 11,
                            padding: "1px 8px",
                            borderRadius: 4,
                            background: "rgba(239, 68, 68, 0.1)",
                            color: "#f87171",
                          }}
                        >
                          {entry.reason}: {reasonMessage(entry.reason)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
