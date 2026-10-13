"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { decimalToMinorUnits, formatCurrency, formatExpiry, timeRemaining } from "@/lib/utils";
import { ConnectionGate } from "@/components/ConnectionGate";
import { Icon } from "@/components/Icon";
import { actionsForGrant, minorToTokenUnits, type ContractConfig } from "@/lib/aegis-contract";
import { getAddress, isAddress, zeroAddress } from "viem";
import type { DataScope } from "@aegis/sdk";
import { CURRENCIES } from "@/lib/profile-fields";
import { grantPermissionSchema, amountMinorSchema } from "@/lib/validation";

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
  contractStatus?: number;
  agentAddress?: string;
  canDelegate?: boolean;
  paymentRecipient?: string;
}

function PermissionsPageContent() {
  const { isConnected, address, authenticatedFetch, grantContractPermission, revokeContractPermission } = useAuth();
  const [permissions, setPermissions] = useState<SerializedPermission[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [adapter, setAdapter] = useState(process.env.NEXT_PUBLIC_ADAPTER ?? "demo");
  const [contractConfig, setContractConfig] = useState<ContractConfig | null>(null);

  // Form state
  const [agentId, setAgentId] = useState("");
  const [configuredAgentId, setConfiguredAgentId] = useState<string | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(["profile:dietary-preference", "profile:travel-budget"]);
  const [action, setAction] = useState<string>("travel:book");
  const [maxAmount, setMaxAmount] = useState("500.00");
  const [approvalThreshold, setApprovalThreshold] = useState("300.00");
  const [currency, setCurrency] = useState("USD");
  const [allowedServices, setAllowedServices] = useState("");
  const [expiryHours, setExpiryHours] = useState("24");
  const [canDelegate, setCanDelegate] = useState(false);
  const [granting, setGranting] = useState(false);
  const [now, setNow] = useState<number | null>(null);

  const loadPermissions = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/permissions?user=${address}`);
      const data = await res.json();
      if (!res.ok) throw new Error(`${data.error}: ${data.detail ?? "Unable to load permissions"}`);
      setPermissions(data.permissions ?? []);
      setAdapter(data.adapter ?? "demo");
      setConfiguredAgentId(data.configuredAgentId ?? null);
      if (data.adapter !== "contract") setAgentId(data.configuredAgentId ?? "");
      setContractConfig(data.contract ?? null);
    } catch (error) {
      setMessage(`❌ ${error instanceof Error ? error.message : "Unable to load permissions"}`);
    } finally {
      setLoading(false);
    }
  }, [address, authenticatedFetch]);

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
      const maxAmountMinor = action === "travel:book" ? decimalToMinorUnits(maxAmount) : "0";
      const requireApprovalAboveMinor = action === "travel:book" ? decimalToMinorUnits(approvalThreshold) : "0";
      amountMinorSchema.parse(maxAmountMinor);
      amountMinorSchema.parse(requireApprovalAboveMinor);
      if (adapter === "demo" && BigInt(requireApprovalAboveMinor) > BigInt(maxAmountMinor)) throw new Error("Approval threshold cannot exceed the spending limit.");
      const hours = Number(expiryHours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 168 || !Number.isInteger(hours * 3600)) throw new Error("Expiry must be greater than zero and at most 168 hours.");
      if (adapter === "contract") {
        if (!contractConfig) throw new Error("Monad contract configuration is unavailable.");
        if (!/^(0|[1-9]\d*)$/.test(agentId)) throw new Error("Agent ID must be the numeric ERC-8004 token ID, for example 2088.");
        amountMinorSchema.parse(agentId);
        const isPayment = action === "travel:book";
        const recipient = allowedServices.trim();
        if (isPayment && (!isAddress(recipient) || recipient.toLowerCase() === zeroAddress)) throw new Error("Enter a valid, nonzero Monad payment address.");
        if (isPayment && BigInt(maxAmountMinor) === 0n) throw new Error("Set a positive spending limit.");
        const result = await grantContractPermission({
          contractAddress: contractConfig.address,
          resourceScope: contractConfig.resourceScope,
          agentId,
          actions: actionsForGrant(selectedScopes as DataScope[], action as "travel:search" | "travel:book").toString(),
          spendingLimit: isPayment ? minorToTokenUnits(BigInt(maxAmountMinor)).toString() : "0",
          expiresAt: Math.floor(Date.now() / 1000) + hours * 3600,
          canDelegate,
          paymentRecipient: isPayment ? getAddress(recipient) : zeroAddress,
        });
        setMessage(`✅ Permission ${result.permissionId} recorded on Monad · ${result.txHash.slice(0, 10)}…`);
        await loadPermissions();
        return;
      }
      const payload = {
        agentId, dataScopes: selectedScopes,
        actionRules: [{ action, maxAmountMinor, currency, allowedServices: allowedServices.split(",").map(s => s.trim()).filter(Boolean), requireApprovalAboveMinor }],
        expiresInSeconds: hours * 3600,
      };
      if (agentId !== configuredAgentId) throw new Error("Choose the configured agent.");
      const validated = grantPermissionSchema.safeParse(payload);
      if (!validated.success) throw new Error(validated.error.issues.map(issue => issue.message).join(". "));
      const res = await authenticatedFetch("/api/permissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(validated.data),
      });

      if (res.ok) {
        const data = await res.json();
        setMessage(`✅ Permission granted: ${data.permissionId}`);
        await loadPermissions();
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

  const handleRevoke = async (permission: SerializedPermission) => {
    if (!address) return;
    if (!confirm(`Revoke permission ${permission.permissionId} for agent ${permission.agentId}? This cannot be undone.`)) return;

    try {
      if (adapter === "contract") {
        if (!contractConfig) throw new Error("Monad contract configuration is unavailable.");
        const result = await revokeContractPermission(contractConfig.address, permission.permissionId);
        setMessage(`✅ Permission revoked on Monad · ${result.txHash.slice(0, 10)}…`);
        await loadPermissions();
        return;
      }
      const res = await authenticatedFetch(`/api/permissions?user=${address}&agentId=${encodeURIComponent(permission.agentId)}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setMessage("✅ Permission revoked");
        await loadPermissions();
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
    if (p.contractStatus !== undefined && ![0, 2, 3].includes(p.contractStatus)) return "invalid";
    if (p.revokedAt !== undefined) return "revoked";
    if (now !== null && p.expiresAt <= now) return "expired";
    return "active";
  };

  if (!isConnected) {
    return (
      <ConnectionGate
        icon="sliders"
        title="Open your policy workspace"
        description="Connect a passkey session to grant, inspect, and revoke bounded permissions."
      />
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Permissions</h1>
      <p className="page-subtitle">Grant, view, and revoke agent permissions. The SDK checks every request deterministically.</p>
      <p className="page-subtitle">{adapter === "contract"
        ? "Live Monad mode. Grants and revocations are user-signed with your Mera passkey and agents are resolved through ERC-8004. Private profile values remain encrypted off-chain."
        : "Local demo mode. Permissions are stored locally and are not recorded on Monad."}</p>

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
        <form className="glass-card" style={{ padding: 24 }} onSubmit={event => { event.preventDefault(); if (!granting) void handleGrant(); }}>
          <h3 className="panel-title"><Icon name="shield" size={17} /> Grant permission</h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="label" htmlFor="policy-agent">Agent</label>
              {adapter === "contract" ? <input id="policy-agent" className="input" inputMode="numeric" pattern="[0-9]+" required value={agentId} onChange={e => setAgentId(e.target.value)} placeholder="ERC-8004 token ID, e.g. 2088" /> : <select id="policy-agent" className="select" required value={agentId} onChange={e => setAgentId(e.target.value)}><option value="">{configuredAgentId ? "Choose an agent" : "No agent configured"}</option>{configuredAgentId ? <option value={configuredAgentId}>{configuredAgentId}</option> : null}</select>}
              <p className="field-help">{adapter === "contract" ? "The contract resolves the registered ERC-8004 owner when you grant." : "Only the agent configured for this gateway can use local permissions."}</p>
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
                    {scope === "profile:dietary-preference" ? "Dietary preference" : scope === "profile:travel-budget" ? "Travel budget" : "Passport expiry"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label" htmlFor="policy-action">Action</label>
              <select id="policy-action" className="select" value={action} onChange={(e) => setAction(e.target.value)}>
                {AVAILABLE_ACTIONS.map((a) => (
                  <option key={a} value={a}>{a === "travel:book" ? "Book travel" : "Search travel"}</option>
                ))}
              </select>
            </div>

            <div className="form-grid-2">
              <div>
              <label className="label" htmlFor="policy-limit">Spending limit</label>
                <input id="policy-limit" className="input" type="number" min={action === "travel:book" ? "0.01" : "0"} required step="0.01" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
              </div>
              {adapter === "demo" ? <div>
                  <label className="label" htmlFor="policy-threshold">Require approval above</label>
                  <input id="policy-threshold" className="input" type="number" min="0" max={maxAmount || undefined} required step="0.01" value={approvalThreshold} onChange={(e) => setApprovalThreshold(e.target.value)} />
                </div> : <div>
                  <label className="label">Over-limit payments</label>
                  <div className="input" style={{ display: "flex", alignItems: "center", color: "var(--text-secondary)" }}>Require an explicit passkey approval</div>
                </div>}
            </div>

            <div className="form-grid-2">
              <div>
                <label className="label" htmlFor="policy-currency">Currency</label>
                <select id="policy-currency" className="select" aria-label="Policy currency" value={adapter === "contract" ? "USD" : currency} onChange={e => setCurrency(e.target.value)}>{(adapter === "contract" ? ["USD"] : CURRENCIES).map(code => <option key={code}>{code}</option>)}</select>
                {adapter === "contract" ? <p className="field-help">Limits use the contract&apos;s test aUSD token.</p> : null}
              </div>
              <div>
                <label className="label" htmlFor="policy-expiry">Expiry (hours, up to 7 days)</label>
                <input id="policy-expiry" className="input" aria-label="Expiry in hours" type="number" min="0.0002777778" max="168" step="any" required value={expiryHours} onChange={(e) => setExpiryHours(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="policy-services">{adapter === "contract" ? "Allowed service payment address" : "Allowed services (comma-separated)"}</label>
              <input id="policy-services" className="input" required={action === "travel:book"} maxLength={1024} value={allowedServices} onChange={(e) => setAllowedServices(e.target.value)} placeholder={adapter === "contract" ? "0x…" : "Service identifier agreed with the agent"} disabled={adapter === "contract" && action !== "travel:book"} />
            </div>

            {adapter === "contract" && <button
              type="button"
              className={`checkbox-label ${canDelegate ? "checked" : ""}`}
              onClick={() => setCanDelegate((value) => !value)}
              aria-pressed={canDelegate}
            >
              <span className="check-box">{canDelegate ? <Icon name="check" size={12} /> : null}</span>
              Allow limited agent-to-agent delegation
            </button>}

            <button type="submit" className="btn btn-primary" disabled={granting || loading || !agentId.trim() || (adapter === "contract" && !contractConfig) || (action === "travel:book" && !allowedServices.trim())}>
              {granting ? <span className="animate-pulse">{adapter === "contract" ? "Waiting for Monad…" : "Saving permission…"}</span> : <><Icon name="shield" size={16} /> {adapter === "contract" ? "Sign & Grant on Monad" : "Grant Permission"}</>}
            </button>
          </div>
        </form>

        {/* Permission List */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 className="panel-title no-margin"><Icon name="sliders" size={17} /> Permission history</h3>
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
                      <span className={`badge badge-${status === "invalid" ? "revoked" : status}`}>
                        {status === "active" ? "● Active" : status === "expired" ? "⏱ Expired" : status === "invalid" ? "⚠ Invalid on-chain" : "✕ Revoked"}
                      </span>
                    </div>

                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
                      Agent: <span style={{ color: "var(--aegis-primary-light)" }}>{p.agentId}</span>
                    </div>

                    {p.agentAddress && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, overflowWrap: "anywhere" }}>
                      ERC-8004 owner: {p.agentAddress}
                    </div>}

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
                          ? p.contractStatus === 2 ? "Revoked permanently on Monad" : `Revoked at: ${formatExpiry(p.revokedAt!)}`
                          : `Expired at: ${formatExpiry(p.expiresAt)}`}
                    </div>

                    {status === "active" && (
                      <button
                        className="btn btn-danger"
                        style={{ marginTop: 10, padding: "6px 14px", fontSize: 12 }}
                        onClick={() => handleRevoke(p)}
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

export default function PermissionsPage() {
  const { address } = useAuth();
  return <PermissionsPageContent key={address ?? "signed-out"} />;
}
