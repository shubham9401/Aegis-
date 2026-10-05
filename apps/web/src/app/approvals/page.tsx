"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency, formatExpiry, timeRemaining } from "@/lib/utils";

interface ApprovalRequest {
  approvalId: string;
  permissionId: string;
  requestId: string;
  user: string;
  agentId: string;
  action: string;
  amountMinor: string;
  currency: string;
  service: string;
  requestedAt: number;
  deadline: number;
  agentNote?: string;
}

interface StoredApproval {
  request: ApprovalRequest;
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
  const { isConnected, address } = useAuth();
  const [approvals, setApprovals] = useState<StoredApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<StoredApproval | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadApprovals = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/approvals?user=${address}`);
      const data = await res.json();
      setApprovals(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      loadApprovals();
      // Poll every 5s for new approvals
      const interval = setInterval(loadApprovals, 5000);
      return () => clearInterval(interval);
    }
  }, [isConnected, address, loadApprovals]);

  const handleDecision = async (approvalId: string, outcome: "approved" | "rejected") => {
    if (!address) return;
    setProcessing(approvalId);
    setMessage(null);

    try {
      // For demo: generate a mock signature
      // TODO: Real flow: run a fresh passkey ceremony, sign EIP-712 typed data
      const nonce = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
      const signedAt = Math.floor(Date.now() / 1000);

      const body =
        outcome === "approved"
          ? {
              outcome: "approved",
              signer: address,
              signature: `0x${"ab".repeat(65)}`, // Demo signature placeholder
              nonce,
              signedAt,
            }
          : { outcome: "rejected", signedAt };

      const res = await fetch(`/api/approvals/${approvalId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMessage(outcome === "approved" ? "✅ Approved with passkey" : "✅ Request rejected");
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

  const isExpired = (deadline: number) => deadline <= Math.floor(Date.now() / 1000);

  if (!isConnected) {
    return (
      <div className="page-container" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Connect to view approvals</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Sign in to see and decide on agent approval requests.</p>
      </div>
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
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Approval Requests</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Auto-refreshing every 5s</span>
            <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={loadApprovals}>
              ↻
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
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
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
                      {a.request.action === "travel:book" ? "✈️" : "🔍"} {a.request.action}
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
        <div className="modal-overlay" onClick={() => setSelectedApproval(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>⚡ Action Approval</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
              Review the details below carefully. Approve triggers a passkey signature.
            </p>

            {/* Structured fields only */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
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
                disabled={processing === selectedApproval.request.approvalId}
              >
                {processing === selectedApproval.request.approvalId ? (
                  <span className="animate-pulse">Signing…</span>
                ) : (
                  "🔐 Approve with Passkey"
                )}
              </button>
              <button
                className="btn btn-danger"
                style={{ flex: 1 }}
                onClick={() => handleDecision(selectedApproval.request.approvalId, "rejected")}
                disabled={processing === selectedApproval.request.approvalId}
              >
                ✕ Reject
              </button>
            </div>

            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12, textAlign: "center" }}>
              Only structured values are shown above. The approval is signed with EIP-712 typed data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
