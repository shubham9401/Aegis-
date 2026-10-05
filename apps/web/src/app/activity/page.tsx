"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { formatExpiry, reasonMessage } from "@/lib/utils";

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

const typeConfig: Record<string, { icon: string; label: string; css: string }> = {
  permission_created: { icon: "🛡️", label: "Permission Created", css: "created" },
  permission_revoked: { icon: "🚫", label: "Permission Revoked", css: "revoked" },
  data_released: { icon: "📤", label: "Data Released", css: "allowed" },
  data_denied: { icon: "🔒", label: "Data Denied", css: "denied" },
  action_allowed: { icon: "✅", label: "Action Allowed", css: "allowed" },
  action_denied: { icon: "❌", label: "Action Denied", css: "denied" },
  action_approval_required: { icon: "⏳", label: "Approval Required", css: "approval" },
  approval_approved: { icon: "✍️", label: "Approved", css: "allowed" },
  approval_rejected: { icon: "✕", label: "Rejected", css: "denied" },
};

export default function ActivityPage() {
  const { isConnected, address } = useAuth();
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadActivity = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/activity?user=${address}`);
      const data = await res.json();
      setActivity(data.activity ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      loadActivity();
      // Auto-refresh every 5 seconds so events appear quickly
      const interval = setInterval(loadActivity, 5000);
      return () => clearInterval(interval);
    }
  }, [isConnected, address, loadActivity]);

  if (!isConnected) {
    return (
      <div className="page-container" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Connect to view activity</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
          Sign in with a passkey to see your permission and access history.
        </p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Activity</h1>
      <p className="page-subtitle">
        Full audit trail — permissions created, data released, denials, and revocations. Newest first.
      </p>

      <div className="glass-card" style={{ overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border-color)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>
            {activity.length} event{activity.length !== 1 ? "s" : ""}
          </h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Auto-refreshing</span>
            <button
              className="btn btn-ghost"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={loadActivity}
            >
              ↻
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
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
            <p style={{ fontSize: 14 }}>No activity yet</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              Grant a permission, store some data, or trigger an agent request to see events here.
            </p>
          </div>
        ) : (
          <div>
            {activity.map((entry) => {
              const config = typeConfig[entry.type] ?? {
                icon: "•",
                label: entry.type,
                css: "created",
              };
              return (
                <div key={entry.id} className="activity-item">
                  <div className={`activity-icon ${config.css}`}>{config.icon}</div>
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
                      {entry.reason && entry.reason !== "REQUEST_ALLOWED" && (
                        <span
                          style={{
                            fontSize: 11,
                            padding: "1px 8px",
                            borderRadius: 4,
                            background: "rgba(239, 68, 68, 0.1)",
                            color: "#f87171",
                          }}
                        >
                          {reasonMessage(entry.reason)}
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
