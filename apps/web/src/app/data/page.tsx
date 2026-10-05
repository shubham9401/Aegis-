"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const DATA_SCOPES = [
  { scope: "profile:dietary-preference", label: "Dietary Preference", placeholder: "e.g., vegetarian, vegan, halal" },
  { scope: "profile:travel-budget", label: "Travel Budget", placeholder: "e.g., USD 500" },
  { scope: "profile:passport-validity", label: "Passport Validity", placeholder: "e.g., valid, expires 2027-03" },
] as const;

export default function DataVaultPage() {
  const { isConnected, address } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [stored, setStored] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadVaultStatus = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/vault?user=${address}`);
      const data = await res.json();
      const s: Record<string, boolean> = {};
      for (const entry of data.entries ?? []) {
        s[entry.scope] = true;
      }
      setStored(s);
    } catch {
      // ignore
    }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      loadVaultStatus();
    }
  }, [isConnected, address, loadVaultStatus]);

  const handleSave = async () => {
    if (!address) return;
    setSaving(true);
    setMessage(null);

    const entries = Object.entries(values)
      .filter(([, v]) => v.trim())
      .map(([scope, value]) => ({ scope, value: value.trim() }));

    if (entries.length === 0) {
      setMessage("Enter at least one value to save.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/vault", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Aegis-User": address,
        },
        body: JSON.stringify({ entries }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessage(`✅ ${data.message}`);
        setValues({});
        loadVaultStatus();
      } else {
        const err = await res.json();
        setMessage(`❌ ${err.error}: ${err.detail ?? ""}`);
      }
    } catch (e) {
      setMessage(`❌ Failed to save: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="page-container" style={{ textAlign: "center", paddingTop: 80 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Connect to manage your data</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Sign in with a passkey to store and manage your encrypted data.</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Data Vault</h1>
      <p className="page-subtitle">
        Store your sample facts encrypted. Plaintext never in Git, chain, or logs.{" "}
        <span style={{ color: "var(--aegis-accent)" }}>Demo vault, server-held key.</span>
      </p>

      {/* Vault Status */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "var(--text-secondary)" }}>
          📦 Stored Data
        </h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {DATA_SCOPES.map((d) => (
            <div
              key={d.scope}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                background: stored[d.scope] ? "rgba(16, 185, 129, 0.1)" : "var(--bg-secondary)",
                border: `1px solid ${stored[d.scope] ? "rgba(16, 185, 129, 0.3)" : "var(--border-color)"}`,
                color: stored[d.scope] ? "#34d399" : "var(--text-muted)",
              }}
            >
              {stored[d.scope] ? "✓" : "○"} {d.label}
            </div>
          ))}
        </div>
      </div>

      {/* Edit Form */}
      <div className="glass-card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 20, color: "var(--text-secondary)" }}>
          ✏️ Edit Sample Facts
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {DATA_SCOPES.map((d) => (
            <div key={d.scope}>
              <label className="label">{d.label}</label>
              <input
                className="input"
                placeholder={d.placeholder}
                value={values[d.scope] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [d.scope]: e.target.value }))}
              />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Scope: <code style={{ color: "var(--aegis-primary-light)" }}>{d.scope}</code>
                {stored[d.scope] && (
                  <span style={{ color: "#34d399", marginLeft: 8 }}>● Currently stored</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {message && (
          <div style={{
            marginTop: 16,
            padding: "10px 14px",
            borderRadius: 8,
            fontSize: 13,
            background: message.startsWith("✅") ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
            border: `1px solid ${message.startsWith("✅") ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
            color: message.startsWith("✅") ? "#34d399" : "#f87171",
          }}>
            {message}
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{ marginTop: 20, width: "100%" }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <span className="animate-pulse">Encrypting & Saving…</span> : "🔐 Encrypt & Save"}
        </button>

        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12, textAlign: "center" }}>
          Values are encrypted with AES-256-GCM before storage. Plaintext is only released to agents after a passing permission check.
        </p>
      </div>
    </div>
  );
}
