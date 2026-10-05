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
  const { isConnected, address, balance, isLoading, error, connect, disconnect, refreshBalance } = useAuth();

  return (
    <div className="page-container home-page">
      <section className="home-hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" />Trust infrastructure for autonomous agents</div>
          <h1>Control what agents know.<br /><span>Enforce what they can do.</span></h1>
          <p className="hero-lead">
            Aegis is a user-owned permission and enforcement layer for AI agents on Monad—built for narrow context access, bounded actions, and safe delegation.
          </p>
          <div className="hero-actions">
            {isConnected ? (
              <Link href="/permissions" className="btn btn-primary">
                Manage policies <Icon name="arrow" size={16} />
              </Link>
            ) : (
              <button className="btn btn-primary" onClick={connect} disabled={isLoading}>
                <Icon name="key" size={17} />
                {isLoading ? "Creating session…" : "Connect with passkey"}
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
                <button className="btn btn-ghost" onClick={refreshBalance}>
                  <Icon name="refresh" size={15} /> Refresh
                </button>
                <button className="btn btn-danger-subtle" onClick={disconnect}>Disconnect</button>
              </div>
              <div className="session-note">
                <Icon name="shield" size={15} />
                <p>
                <span>Demo</span>
                Simulated passkey session until the Mera adapter is connected.
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
              <p className="session-description">Create a local demo session to configure policy boundaries and inspect the complete decision flow.</p>
              <button className="btn btn-primary btn-block" onClick={connect} disabled={isLoading}>
                {isLoading ? "Creating session…" : "Connect with passkey"}
              </button>
            </div>
          )}
        </aside>
      </section>

      <section className="decision-flow" aria-label="Aegis enforcement flow">
        <div className="flow-intro">
          <span className="section-label">Request lifecycle</span>
          <strong>One decision boundary.<br />Every agent request.</strong>
        </div>
        <div className="flow-step"><span>01</span><Icon name="network" /><div><small>Identify</small><strong>Verify the agent</strong></div></div>
        <div className="flow-step"><span>02</span><Icon name="sliders" /><div><small>Evaluate</small><strong>Check live policy</strong></div></div>
        <div className="flow-step"><span>03</span><Icon name="check" /><div><small>Enforce</small><strong>Release or block</strong></div></div>
      </section>

      <section className="capability-section">
        <div className="section-heading">
          <div>
            <span className="section-label">Built for enforceable trust</span>
            <h2>Permission records are not enough.<br />Aegis enforces the boundary.</h2>
          </div>
          <p>Policy checks happen where private context is decrypted and where sensitive actions execute—not merely where permissions are recorded.</p>
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
