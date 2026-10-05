"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency, formatExpiry, timeRemaining } from "@/lib/utils";
import { ConnectionGate } from "@/components/ConnectionGate";
import { Icon } from "@/components/Icon";

const AVAILABLE_SCOPES = [
  "profile:dietary-preference",
  "profile:travel-budget",
  "profile:passport-validity",
] as const;

const AVAILABLE_ACTIONS = ["travel:search", "travel:book"] as const;

interface SerializedPermission {
  permissionId: string;
  user: string;
  agentId: string;
  dataScopes: string[];
  actionRules: Array<{
    action: string;
    maxAmountMinor?: string;
    currency?: string;
    allowedServices?: string[];
    requireApprovalAboveMinor?: string;
  }>;
  expiresAt: number;
  revokedAt?: number;
}

export default function PermissionsPage() {
  const { isConnected, address } = useAuth();
  const [permissions, setPermissions] = useState<SerializedPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Form state
  const [agentId, setAgentId] = useState("erc8004:monad:travel-agent-001");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["profile:dietary-preference", "profile:travel-budget"]);
  const [action, setAction] = useState<string>("travel:book");
  const [maxAmount, setMaxAmount] = useState("500.00");
  const [approvalThreshold, setApprovalThreshold] = useState("300.00");
  const [currency, setCurrency] = useState("USD");
  const [allowedServices, setAllowedServices] = useState("demo-airline");
  const [expiryHours, setExpiryHours] = useState("24");
  const [granting, setGranting] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  const loadPermissions = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/permissions?user=${address}`);
      const data = await res.json();
      setPermissions(data.permissions ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      const initial = window.setTimeout(() => void loadPermissions(), 0);
      return () => window.clearTimeout(initial);
    }
  }, [isConnected, address, loadPermissions]);

  useEffect(() => {
    const updateNow = () => setNow(Math.floor(Date.now() / 1000));
    const initial = window.setTimeout(updateNow, 0);
    const interval = window.setInterval(updateNow, 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);

  const handleGrant = async () => {
    if (!address) return;
    setGranting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Aegis-User": address,
        },
        body: JSON.stringify({
          agentId,
          dataScopes: selectedScopes,
          actionRules: [
            {
              action,
              maxAmountMinor: Math.round(parseFloat(maxAmount) * 100).toString(),
              currency,
              allowedServices: allowedServices.split(",").map((s) => s.trim()).filter(Boolean),
              requireApprovalAboveMinor: Math.round(parseFloat(approvalThreshold) * 100).toString(),
            },
          ],
          expiresInSeconds: Math.round(parseFloat(expiryHours) * 3600),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessage(`✅ Permission granted: ${data.permissionId}`);
        loadPermissions();
      } else {
        const err = await res.json();
        setMessage(`❌ ${err.error}: ${err.detail ?? ""}`);
      }
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : "Failed to grant"}`);
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (agentIdToRevoke: string) => {
    if (!address) return;
    if (!confirm(`Revoke all permissions for agent ${agentIdToRevoke}? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/permissions?user=${address}&agentId=${encodeURIComponent(agentIdToRevoke)}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setMessage("✅ Permission revoked");
        loadPermissions();
      } else {
        const err = await res.json();
        setMessage(`❌ ${err.error}`);
      }
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : "Failed to revoke"}`);
    }
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const getStatus = (p: SerializedPermission) => {
    if (p.revokedAt) return "revoked";
    if (now !== null && p.expiresAt <= now) return "expired";
    return "active";
  };

  if (!isConnected) {
    return (
      <ConnectionGate
        icon="sliders"
        title="Open your policy workspace"
        description="Connect a passkey session to grant, inspect, and revoke bounded permissions for registered agents."
      />
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Permissions</h1>
      <p className="page-subtitle">Grant, view, and revoke agent permissions. The SDK checks every request deterministically.</p>

      {message && (
        <div style={{
          marginBottom: 20,
          padding: "12px 16px",
          borderRadius: 10,
          fontSize: 13,
          background: message.startsWith("✅") ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
          border: `1px solid ${message.startsWith("✅") ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
          color: message.startsWith("✅") ? "#34d399" : "#f87171",
        }}>
          {message}
        </div>
      )}

      <div className="workspace-grid">
        {/* Grant Form */}
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 className="panel-title"><Icon name="shield" size={17} /> Grant permission</h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="label">Agent ID</label>
              <input className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="erc8004:monad:agent-id" />
            </div>

            <div>
              <label className="label">Data Scopes</label>
              <div className="checkbox-group">
                {AVAILABLE_SCOPES.map((scope) => (
                  <button
                    type="button"
                    key={scope}
                    className={`checkbox-label ${selectedScopes.includes(scope) ? "checked" : ""}`}
                    onClick={() => toggleScope(scope)}
                    aria-pressed={selectedScopes.includes(scope)}
                  >
                    <span className="check-box">{selectedScopes.includes(scope) ? <Icon name="check" size={12} /> : null}</span>
                    {scope.split(":")[1]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Action</label>
              <select className="select" value={action} onChange={(e) => setAction(e.target.value)}>
                {AVAILABLE_ACTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div className="form-grid-2">
              <div>
                <label className="label">Max Amount ($)</label>
                <input className="input" type="number" step="0.01" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
              </div>
              <div>
                <label className="label">Approval Above ($)</label>
                <input className="input" type="number" step="0.01" value={approvalThreshold} onChange={(e) => setApprovalThreshold(e.target.value)} />
              </div>
            </div>

            <div className="form-grid-2">
              <div>
                <label className="label">Currency</label>
                <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </div>
              <div>
                <label className="label">Expiry (hours)</label>
                <input className="input" type="number" value={expiryHours} onChange={(e) => setExpiryHours(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">Allowed Services (comma-separated)</label>
              <input className="input" value={allowedServices} onChange={(e) => setAllowedServices(e.target.value)} placeholder="demo-airline" />
            </div>

            <button className="btn btn-primary" onClick={handleGrant} disabled={granting || selectedScopes.length === 0}>
              {granting ? <span className="animate-pulse">Granting…</span> : <><Icon name="shield" size={16} /> Grant Permission</>}
            </button>
          </div>
        </div>

        {/* Permission List */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 className="panel-title no-margin"><Icon name="sliders" size={17} /> Active permissions</h3>
            <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={loadPermissions}>
              <Icon name="refresh" size={14} /> Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[1, 2].map((i) => (
                <div key={i} className="loading-shimmer" style={{ height: 100, borderRadius: 12 }} />
              ))}
            </div>
          ) : permissions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Icon name="sliders" size={21} /></div>
              <p>No permissions granted yet</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {permissions.map((p) => {
                const status = getStatus(p);
                return (
                  <div
                    key={p.permissionId}
                    style={{
                      padding: 16,
                      background: "var(--bg-secondary)",
                      borderRadius: 12,
                      border: `1px solid ${status === "revoked" ? "rgba(239, 68, 68, 0.2)" : "var(--border-color)"}`,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-muted)" }}>
                        {p.permissionId}
                      </span>
                      <span className={`badge badge-${status}`}>
                        {status === "active" ? "● Active" : status === "expired" ? "⏱ Expired" : "✕ Revoked"}
                      </span>
                    </div>

                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
                      Agent: <span style={{ color: "var(--aegis-primary-light)" }}>{p.agentId}</span>
                    </div>

                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                      Scopes: {p.dataScopes.map((s) => s.split(":")[1]).join(", ")}
                    </div>

                    {p.actionRules.map((r, i) => (
                      <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
                        Action: {r.action}
                        {r.maxAmountMinor && ` · Limit: ${formatCurrency(r.maxAmountMinor, r.currency)}`}
                        {r.requireApprovalAboveMinor && ` · Approval above: ${formatCurrency(r.requireApprovalAboveMinor, r.currency)}`}
                        {r.allowedServices && ` · Services: ${r.allowedServices.join(", ")}`}
                      </div>
                    ))}

                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                      {status === "active"
                        ? `Expires: ${formatExpiry(p.expiresAt)} (${timeRemaining(p.expiresAt)})`
                        : status === "revoked"
                          ? `Revoked at: ${formatExpiry(p.revokedAt!)}`
                          : `Expired at: ${formatExpiry(p.expiresAt)}`}
                    </div>

                    {status === "active" && (
                      <button
                        className="btn btn-danger"
                        style={{ marginTop: 10, padding: "6px 14px", fontSize: 12 }}
                        onClick={() => handleRevoke(p.agentId)}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
