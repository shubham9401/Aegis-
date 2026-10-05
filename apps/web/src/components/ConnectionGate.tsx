"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Icon, type IconName } from "@/components/Icon";

interface ConnectionGateProps {
  icon: IconName;
  title: string;
  description: string;
}

export function ConnectionGate({ icon, title, description }: ConnectionGateProps) {
  const { connect, isLoading, error } = useAuth();

  return (
    <main className="page-container access-gate-wrap">
      <section className="access-gate">
        <div className="access-gate-icon"><Icon name={icon} size={28} /></div>
        <span className="section-label">Authenticated workspace</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {error ? <div className="alert-error">{error}</div> : null}
        <button className="btn btn-primary" onClick={connect} disabled={isLoading}>
          <Icon name="key" size={16} />
          {isLoading ? "Creating session…" : "Connect with passkey"}
        </button>
        <small>Demo sessions are local until the Mera adapter is connected.</small>
      </section>
    </main>
  );
}
