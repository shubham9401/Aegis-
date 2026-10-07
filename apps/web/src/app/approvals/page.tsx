"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency, formatExpiry, timeRemaining } from "@/lib/utils";
import { ConnectionGate } from "@/components/ConnectionGate";
import { Icon } from "@/components/Icon";
import type { ApprovalRequest } from "@/lib/approval-store";

interface StoredApproval {
  request: ApprovalRequest;
  maxAmountMinor?: string;
  result: {
    approvalId: string;
    outcome: "pending" | "approved" | "rejected";
    signer?: string;
    signature?: string;
    nonce?: string;
    signedAt?: number;
  };
}

export default function ApprovalsPage() {
  const { isConnected, address, signApproval, authenticatedFetch } = useAuth();
  const [approvals, setApprovals] = useState<StoredApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<StoredApproval | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const loadApprovals = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/approvals?user=${address}`);
      const data = await res.json();
      if (!res.ok) throw new Error(`${data.error ?? "Unable to load approvals"}${data.detail ? `: ${data.detail}` : ""}`);
      if (!Array.isArray(data)) throw new Error("Invalid approvals response");
      setApprovals(data);
      setSelectedApproval((selected) => selected ? data.find((entry: StoredApproval) => entry.request.approvalId === selected.request.approvalId) ?? null : null);
    } catch (error) {
      setMessage(`❌ ${error instanceof Error ? error.message : "Unable to load approvals"}`);
    } finally {
      setLoading(false);
    }
  }, [address, authenticatedFetch]);

  useEffect(() => {
    if (isConnected && address) {
      const initial = window.setTimeout(() => void loadApprovals(), 0);
      // Poll every 5s for new approvals
      const interval = window.setInterval(() => void loadApprovals(), 5000);
      return () => {
        window.clearTimeout(initial);
        window.clearInterval(interval);
      };
    }
  }, [isConnected, address, loadApprovals]);

  useEffect(() => {
    const updateNow = () => setNow(Math.floor(Date.now() / 1000));
    const initial = window.setTimeout(updateNow, 0);
    const interval = window.setInterval(updateNow, 1_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, []);

  const handleDecision = async (approvalId: string, outcome: "approved" | "rejected") => {
    if (!address) return;
    setProcessing(approvalId);
    setMessage(null);

    try {
      const request = selectedApproval?.request;
      if (!request || request.approvalId !== approvalId) throw new Error("Select the request again.");
      if (request.deadline <= Math.floor(Date.now() / 1000)) throw new Error("This request has expired.");
      const body =
        outcome === "approved"
          ? {
              outcome: "approved",
              ...await signApproval(request),
              signedAt: Math.floor(Date.now() / 1000),
            }
          : { outcome: "rejected", signedAt: Math.floor(Date.now() / 1000) };

      const res = await authenticatedFetch(`/api/approvals/${approvalId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage(outcome === "approved" ? "✅ Passkey approval verified" : "✅ Request rejected");
        setSelectedApproval(null);
        loadApprovals();
      } else {
        const err = await res.json();
        setMessage(`❌ ${err.error}: ${err.detail ?? ""}`);
      }
    } catch (e) {
      setMessage(`❌ ${e instanceof Error ? e.message : "Failed"}`);
    } finally {
      setProcessing(null);
    }
  };

  const isExpired = (deadline: number) => now !== null && deadline <= now;

  if (!isConnected) {
    return (
      <ConnectionGate
        icon="check"
        title="Review step-up approvals"
        description="Connect a passkey session to inspect sensitive agent requests and make an explicit decision."
      />
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Approvals</h1>
      <p className="page-subtitle">Review and decide on agent action requests that exceed your approval threshold.</p>

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

      <div className="glass-card" style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 className="panel-title no-margin"><Icon name="check" size={17} /> Approval requests</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Auto-refreshing every 5s</span>
            <button aria-label="Refresh approvals" className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={loadApprovals}>
              <Icon name="refresh" size={14} />
            </button>
          </div>
        </div>

        {loading && approvals.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2].map((i) => (
              <div key={i} className="loading-shimmer" style={{ height: 80, borderRadius: 12 }} />
            ))}
          </div>
        ) : approvals.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Icon name="check" size={21} /></div>
            <p>No approval requests yet</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>When an agent requests an action that exceeds your approval threshold, it will appear here.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {approvals.map((a) => {
              const expired = isExpired(a.request.deadline);
              return (
                <div
                  key={a.request.approvalId}
                  role={a.result.outcome === "pending" && !expired ? "button" : undefined}
                  tabIndex={a.result.outcome === "pending" && !expired ? 0 : undefined}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && a.result.outcome === "pending" && !expired) {
                      event.preventDefault();
                      setSelectedApproval(a);
                    }
                  }}
                  style={{
                    padding: 16,
                    background: "var(--bg-secondary)",
                    borderRadius: 12,
                    border: `1px solid ${a.result.outcome === "pending" && !expired ? "var(--border-active)" : "var(--border-color)"}`,
                    cursor: a.result.outcome === "pending" && !expired ? "pointer" : "default",
                    transition: "all 0.2s ease",
                  }}
                  onClick={() => {
                    if (a.result.outcome === "pending" && !expired) setSelectedApproval(a);
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>
                      {a.request.action}
                    </span>
                    <span className={`badge badge-${a.result.outcome === "pending" ? (expired ? "expired" : "pending") : a.result.outcome}`}>
                      {a.result.outcome === "pending"
                        ? expired
                          ? "⏱ Expired"
                          : "⏳ Pending"
                        : a.result.outcome === "approved"
                          ? "✓ Approved"
                          : "✕ Rejected"}
                    </span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Amount: <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {formatCurrency(a.request.amountMinor, a.request.currency)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Service: <span style={{ fontWeight: 500 }}>{a.request.service}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Agent: <span style={{ color: "var(--aegis-primary-light)" }}>{a.request.agentId.split(":").pop()}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Deadline: {expired ? <span style={{ color: "#f87171" }}>Expired</span> : timeRemaining(a.request.deadline)}
                    </div>
                  </div>

                  {a.request.agentNote && (
                    <div style={{
                      fontSize: 12,
                      padding: "8px 12px",
                      background: "rgba(245, 158, 11, 0.05)",
                      border: "1px solid rgba(245, 158, 11, 0.15)",
                      borderRadius: 6,
                      color: "var(--text-muted)",
                      fontStyle: "italic",
                    }}>
                      ⚠️ Agent note (untrusted): {a.request.agentNote}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Approval Modal */}
      {selectedApproval && (
        <div className="modal-overlay" onClick={() => { if (!processing) setSelectedApproval(null); }}>
          <div className="modal-content" role="dialog" aria-modal="true" aria-label="Action approval" onClick={(e) => e.stopPropagation()}>
            <h3 className="panel-title"><Icon name="key" size={18} /> Action approval</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
              Review these structured request fields. Approve opens a fresh passkey prompt and signs EIP-712 typed data.
            </p>

            {/* Structured fields only */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
              <div style={{ overflowWrap: "anywhere" }}>Request ID: <code>{selectedApproval.request.requestId}</code></div>
              <div style={{ overflowWrap: "anywhere" }}>User: <code>{selectedApproval.request.user}</code></div>
              <div>Currency: <code>{selectedApproval.request.currency}</code>; amount in minor units: <code>{selectedApproval.request.amountMinor}</code></div>
              <div>Current permission limit: {selectedApproval.maxAmountMinor !== undefined ? formatCurrency(selectedApproval.maxAmountMinor, selectedApproval.request.currency) : "Unavailable"}</div>
              <div>Deadline (Unix seconds): <code>{selectedApproval.request.deadline}</code></div>
              <div style={{ padding: "12px 16px", background: "var(--bg-secondary)", borderRadius: 10, border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>ACTION</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{selectedApproval.request.action}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ padding: "12px 16px", background: "var(--bg-secondary)", borderRadius: 10, border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>AMOUNT</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: "var(--aegis-primary-light)" }}>
                    {formatCurrency(selectedApproval.request.amountMinor, selectedApproval.request.currency)}
                  </div>
                </div>

                <div style={{ padding: "12px 16px", background: "var(--bg-secondary)", borderRadius: 10, border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>SERVICE</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{selectedApproval.request.service}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ padding: "12px 16px", background: "var(--bg-secondary)", borderRadius: 10, border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>AGENT</div>
                  <div style={{ fontSize: 13, fontFamily: "monospace" }}>{selectedApproval.request.agentId}</div>
                </div>

                <div style={{ padding: "12px 16px", background: "var(--bg-secondary)", borderRadius: 10, border: "1px solid var(--border-color)" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>DEADLINE</div>
                  <div style={{ fontSize: 13 }}>{formatExpiry(selectedApproval.request.deadline)}</div>
                </div>
              </div>

              <div style={{ padding: "12px 16px", background: "var(--bg-secondary)", borderRadius: 10, border: "1px solid var(--border-color)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>PERMISSION</div>
                <div style={{ fontSize: 13, fontFamily: "monospace" }}>{selectedApproval.request.permissionId}</div>
              </div>
            </div>

            {selectedApproval.request.agentNote && (
              <div style={{
                marginBottom: 20,
                padding: "10px 14px",
                background: "rgba(245, 158, 11, 0.05)",
                border: "1px solid rgba(245, 158, 11, 0.15)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--text-muted)",
              }}>
                ⚠️ <strong>Agent note (untrusted):</strong> {selectedApproval.request.agentNote}
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button
                className="btn btn-success"
                style={{ flex: 1 }}
                onClick={() => handleDecision(selectedApproval.request.approvalId, "approved")}
                disabled={processing !== null || selectedApproval.result.outcome !== "pending" || now === null || isExpired(selectedApproval.request.deadline)}
              >
                {processing === selectedApproval.request.approvalId ? (
                  <span className="animate-pulse">Signing…</span>
                ) : (
                  isExpired(selectedApproval.request.deadline) ? "Request expired" : "Approve with passkey"
                )}
              </button>
              <button
                className="btn btn-danger"
                style={{ flex: 1 }}
                onClick={() => handleDecision(selectedApproval.request.approvalId, "rejected")}
                disabled={processing !== null || selectedApproval.result.outcome !== "pending" || isExpired(selectedApproval.request.deadline)}
              >
                ✕ Reject
              </button>
            </div>
            {message?.startsWith("❌") ? <p role="alert" className="alert-error">{message}</p> : null}
            <button className="btn btn-ghost" disabled={processing !== null} onClick={() => setSelectedApproval(null)}>Close</button>

            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12, textAlign: "center" }}>
              Only structured values are shown above. The approval is signed with EIP-712 typed data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
