"use client";

import { useAuth } from "@/contexts/AuthContext";

export default function HomePage() {
  const { isConnected, address, balance, isLoading, error, connect, disconnect, refreshBalance } = useAuth();

  return (
    <div className="page-container">
      {/* Hero Section */}
      <div className="hero-gradient" style={{ padding: "48px 40px", marginBottom: 40, textAlign: "center" }}>
        <div className="shield-icon" style={{ margin: "0 auto 24px" }}>
          🛡️
        </div>
        <h1 style={{
          fontSize: 42,
          fontWeight: 800,
          marginBottom: 12,
          background: "linear-gradient(135deg, #f1f5f9, #818cf8)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          Aegis
        </h1>
        <p style={{ fontSize: 18, color: "var(--text-secondary)", maxWidth: 600, margin: "0 auto 8px" }}>
          User-controlled trust and permission layer for AI agents on Monad
        </p>
        <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 500, margin: "0 auto" }}>
          Grant narrow, revocable permissions for data access and actions. Your private context stays encrypted off-chain.
        </p>
      </div>

      {/* Connect Card */}
      <div className="glass-card" style={{ maxWidth: 480, margin: "0 auto", padding: 32 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
          {isConnected ? "Connected" : "Connect with Passkey"}
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
          {isConnected
            ? "Your session is active. Manage permissions and data."
            : "Sign in with a passkey — no seed phrase needed."}
        </p>

        {error && (
          <div style={{
            padding: "12px 16px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 13,
            color: "#f87171",
          }}>
            ⚠️ {error}
          </div>
        )}

        {isConnected && address ? (
          <div>
            {/* Address */}
            <div style={{
              padding: "16px 20px",
              background: "var(--bg-secondary)",
              borderRadius: 12,
              marginBottom: 16,
              border: "1px solid var(--border-color)",
            }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                Address
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 14, color: "var(--aegis-primary-light)", wordBreak: "break-all" }}>
                {address}
              </div>
            </div>

            {/* Balance */}
            <div style={{
              padding: "16px 20px",
              background: "var(--bg-secondary)",
              borderRadius: 12,
              marginBottom: 16,
              border: "1px solid var(--border-color)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                  MON Balance
                </div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>
                  {balance ?? <span className="animate-pulse">Loading…</span>}
                  <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 6 }}>MON</span>
                </div>
              </div>
              <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={refreshBalance}>
                ↻ Refresh
              </button>
            </div>

            {/* No balance warning */}
            {balance !== null && parseFloat(balance) === 0 && (
              <div style={{
                padding: "12px 16px",
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.2)",
                borderRadius: 10,
                marginBottom: 16,
                fontSize: 13,
                color: "#fbbf24",
              }}>
                ⚡ You need MON for gas.{" "}
                <a
                  href="https://faucet.monad.xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--aegis-accent-light)", textDecoration: "underline" }}
                >
                  Get testnet MON from the faucet →
                </a>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={disconnect}>
                Sign Out
              </button>
            </div>

            {/* Demo Notice */}
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16, textAlign: "center" }}>
              Demo mode: simulated passkey. Real Mera passkey integration requires HTTPS + PRF-capable browser.
            </p>
          </div>
        ) : (
          <div>
            <button
              className="btn btn-primary"
              style={{ width: "100%", padding: "14px 20px", fontSize: 16 }}
              onClick={connect}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="animate-pulse">Connecting…</span>
              ) : (
                <>🔐 Create Passkey / Sign In</>
              )}
            </button>

            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 16, textAlign: "center" }}>
              Requires HTTPS or localhost. Desktop Chrome with Google Password Manager recommended for WebAuthn PRF support.
            </p>
          </div>
        )}
      </div>

      {/* Feature Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginTop: 48 }}>
        {[
          { icon: "🔒", title: "Encrypted Vault", desc: "Your data stays encrypted at rest. Plaintext only released after permission check." },
          { icon: "🛡️", title: "Granular Permissions", desc: "Control which data and actions each agent can access, with spending limits." },
          { icon: "✍️", title: "Passkey Approvals", desc: "Sensitive actions require your explicit approval with a passkey signature." },
          { icon: "🔍", title: "Full Audit Trail", desc: "Every access, denial, and revocation is logged for transparency." },
        ].map((f) => (
          <div key={f.title} className="glass-card" style={{ padding: 24 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{f.title}</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
