"use client";

import { useAuth } from "@/contexts/AuthContext";
import { Icon, type IconName } from "@/components/Icon";

interface ConnectionGateProps {
  icon: IconName;
  title: string;
  description: string;
}

export function ConnectionGate({ icon, title, description }: ConnectionGateProps) {
  const { connect, createPasskey, hasPasskey, isLoading, error } = useAuth();

  return (
    <div className="page-container access-gate-wrap">
      <section className="access-gate">
        <div className="access-gate-icon"><Icon name={icon} size={28} /></div>
        <span className="section-label">Authenticated workspace</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {error ? <div className="alert-error">{error}</div> : null}
        <div className="passkey-actions">
          <button className="btn btn-primary" onClick={hasPasskey ? connect : createPasskey} disabled={isLoading}>
            <Icon name="key" size={16} />
            {isLoading ? "Waiting for passkey…" : hasPasskey ? "Sign in with passkey" : "Create passkey"}
          </button>
          {hasPasskey ? <button className="btn btn-ghost" onClick={createPasskey} disabled={isLoading}>Create another passkey</button> : null}
        </div>
        <small>Passkeys are bound to this domain. Use a provider that supports WebAuthn PRF.</small>
      </section>
    </div>
  );
}
