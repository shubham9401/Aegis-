"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { useAuth } from "@/contexts/AuthContext";

const capabilities: Array<{
  icon: IconName;
  title: string;
  eyebrow: string;
  description: string;
}> = [
  {
    icon: "database",
    title: "Context vault",
    eyebrow: "Private by default",
    description: "Encrypted user context is released field by field only after a live policy check.",
  },
  {
    icon: "sliders",
    title: "Granular policies",
    eyebrow: "Least privilege",
    description: "Constrain data scopes, services, actions, limits, expiry, and delegated authority.",
  },
  {
    icon: "key",
    title: "Step-up approval",
    eyebrow: "Human in the loop",
    description: "Hold sensitive actions until the permission owner explicitly approves the request.",
  },
  {
    icon: "activity",
    title: "Auditable decisions",
    eyebrow: "Clear provenance",
    description: "Review grants, releases, denials, approvals, and revocations from one activity trail.",
  },
];

export default function HomePage() {
  const { isConnected, address, balance, isLoading, error, connect, createPasskey, hasPasskey, disconnect, refreshBalance } = useAuth();

  return (
    <div className="page-container home-page">
      <section className="home-hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" />Trust infrastructure for autonomous agents</div>
          <h1>Choose what agents access.<br /><span>Approve sensitive actions.</span></h1>
          <p className="hero-lead">
            Aegis checks agent requests at integration points against your permissions for context access, actions, limits, and expiry.
          </p>
          <div className="hero-actions">
            {isConnected ? (
              <Link href="/permissions" className="btn btn-primary">
                Manage policies <Icon name="arrow" size={16} />
              </Link>
            ) : (
              <button className="btn btn-primary" onClick={hasPasskey ? connect : createPasskey} disabled={isLoading}>
                <Icon name="key" size={17} />
                {isLoading ? "Waiting for passkey…" : hasPasskey ? "Sign in with passkey" : "Create passkey"}
              </button>
            )}
            <Link href="/activity" className="btn btn-ghost">View audit trail</Link>
          </div>
          <div className="hero-proof">
            <span className="proof-item"><Icon name="shield" size={15} /> Live policy checks</span>
            <span className="proof-item"><Icon name="lock" size={15} /> Encrypted off-chain context</span>
            <span className="proof-item"><Icon name="network" size={15} /> Delegation aware</span>
          </div>
        </div>

        <aside className="session-panel" aria-label="Current session">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Control plane</span>
              <h2>{isConnected ? "Session active" : "Start a session"}</h2>
            </div>
            <span className={`status-indicator ${isConnected ? "online" : "offline"}`}>
              <span className="status-dot" />{isConnected ? "Connected" : "Offline"}
            </span>
          </div>

          {error ? <div className="alert alert-error">{error}</div> : null}

          {isConnected && address ? (
            <div className="session-content">
              <div className="session-metric">
                <span>Account</span>
                <strong className="mono">{address.slice(0, 10)}…{address.slice(-8)}</strong>
              </div>
              <div className="session-metric balance-metric">
                <span>Monad testnet balance</span>
                <div>
                  <strong>{balance ?? "—"}</strong><small> MON</small>
                </div>
              </div>
              <div className="session-actions">
                <a className="btn btn-ghost" href="https://faucet.monad.xyz" target="_blank" rel="noopener noreferrer">Get testnet MON</a>
                <button className="btn btn-ghost" onClick={refreshBalance}>
                  <Icon name="refresh" size={15} /> Refresh
                </button>
                <button className="btn btn-danger-subtle" onClick={disconnect}>Disconnect</button>
              </div>
              <div className="session-note">
                <Icon name="shield" size={15} />
                <p>
                Mera derives your signing account from your passkey. Sensitive approvals require a fresh passkey prompt.
                </p>
              </div>
            </div>
          ) : (
            <div className="session-content">
              <div className="session-illustration">
                <span><Icon name="key" size={24} /></span>
                <div className="session-line" />
                <span><Icon name="shield" size={24} /></span>
                <div className="session-line" />
                <span><Icon name="check" size={24} /></span>
              </div>
              <p className="session-description">Create a passkey on this domain, or sign in using the passkey saved for this account.</p>
              <button className="btn btn-primary btn-block" onClick={hasPasskey ? connect : createPasskey} disabled={isLoading}>
                {isLoading ? "Waiting for passkey…" : hasPasskey ? "Sign in with passkey" : "Create passkey"}
              </button>
              {hasPasskey ? <button className="btn btn-ghost" onClick={createPasskey} disabled={isLoading}>Create another passkey</button> : null}
            </div>
          )}
        </aside>
      </section>

      <section className="decision-flow" aria-label="Aegis enforcement flow">
        <div className="flow-intro">
          <span className="section-label">Request lifecycle</span>
          <strong>One decision boundary.<br />Every agent request.</strong>
        </div>
        <div className="flow-step"><span>01</span><Icon name="network" /><div><small>Identify</small><strong>Authenticate the caller</strong></div></div>
        <div className="flow-step"><span>02</span><Icon name="sliders" /><div><small>Evaluate</small><strong>Check live policy</strong></div></div>
        <div className="flow-step"><span>03</span><Icon name="check" /><div><small>Enforce</small><strong>Release or block</strong></div></div>
      </section>

      <section className="capability-section">
        <div className="section-heading">
          <div>
            <span className="section-label">Built for enforceable trust</span>
            <h2>Permission records are not enough.<br />Aegis enforces the boundary.</h2>
          </div>
          <p>The server checks permissions before releasing context and accepting approval proofs. Revocation stops future access; agents retain data already disclosed. The vault uses a server-held encryption key.</p>
        </div>
        <div className="capability-grid">
          {capabilities.map((capability) => (
            <article key={capability.title} className="capability-card">
              <div className="capability-icon"><Icon name={capability.icon} size={20} /></div>
              <span>{capability.eyebrow}</span>
              <h3>{capability.title}</h3>
              <p>{capability.description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
