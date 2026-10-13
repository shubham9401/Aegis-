"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";
import { formatExpiry } from "@/lib/utils";
import type { ActivityEntry } from "@/lib/activity-log";

interface Policy { permissionId: string; agentId: string; dataScopes: string[]; expiresAt: number; revokedAt?: number; contractStatus?: number }
interface Attention { id: string; action: string; service: string; deadline: number; pending: boolean }
interface Snapshot { policies: Policy[] | null; approvals: Attention[] | null; vault: { scope: string }[] | null; activity: ActivityEntry[] | null; errors: string[]; updated: number; adapter: string }
const empty: Snapshot = { policies: null, approvals: null, vault: null, activity: null, errors: [], updated: 0, adapter: "" };

export default function AccountDashboard({ address }: { address: string }) {
  const { authenticatedFetch } = useAuth();
  const [snapshot, setSnapshot] = useState(empty);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function read<T>(path: string): Promise<T> {
      const response = await authenticatedFetch(`/api/${path}?user=${encodeURIComponent(address)}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? data.error ?? "Unavailable");
      return data as T;
    }
    async function load() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      const approvalRecords = async (): Promise<Attention[]> => {
        if (process.env.NEXT_PUBLIC_ADAPTER === "contract") {
          const data = await read<{ payments: { permissionId: string; requestId: string; recipient: string; deadline: number; outcome: string }[] }>("chain/payments");
          return data.payments.map(payment => ({ id: `${payment.permissionId}:${payment.requestId}`, action: "Extra test-token payment", service: payment.recipient, deadline: payment.deadline, pending: payment.outcome === "pending" }));
        }
        const data = await read<{ request: { approvalId: string; action: string; service: string; deadline: number }; result: { outcome: string } }[]>("approvals");
        return data.map(approval => ({ id: approval.request.approvalId, action: approval.request.action, service: approval.request.service, deadline: approval.request.deadline, pending: approval.result.outcome === "pending" }));
      };
      const results = await Promise.allSettled([
        read<{ permissions: Policy[]; adapter: string }>("permissions"),
        approvalRecords(), read<{ entries: { scope: string }[] }>("vault"), read<{ activity: ActivityEntry[] }>("activity"),
      ]);
      busy = false;
      if (controller.signal.aborted) return;
      const [policies, approvals, vault, activity] = results;
      setSnapshot({
        policies: policies.status === "fulfilled" ? policies.value.permissions : null,
        adapter: policies.status === "fulfilled" ? policies.value.adapter : "",
        approvals: approvals.status === "fulfilled" ? approvals.value : null,
        vault: vault.status === "fulfilled" ? vault.value.entries : null,
        activity: activity.status === "fulfilled" ? activity.value.activity : null,
        errors: results.flatMap((result, index) => result.status === "rejected" ? [`${["Policies", "Approvals", "Vault", "Activity"][index]}: ${result.reason instanceof Error ? result.reason.message : "Unavailable"}`] : []),
        updated: Math.floor(Date.now() / 1000),
      });
    }
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 30_000);
    const visible = () => void load();
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); };
  }, [address, authenticatedFetch, refresh]);
  const active = snapshot.policies?.filter(policy => policy.revokedAt === undefined && policy.expiresAt > snapshot.updated && (policy.contractStatus === undefined || policy.contractStatus === 0));
  const pending = snapshot.approvals?.filter(approval => approval.pending && approval.deadline > snapshot.updated);
  const count = (value: number | undefined) => !snapshot.updated ? "…" : value ?? "—";
  return <section className="account-dashboard" aria-label="Account dashboard">
    <div className="dashboard-heading"><div><h2>Your workspace</h2><p>{snapshot.adapter === "contract" ? "Live Monad policies" : snapshot.adapter ? "Local policies" : "Loading account records…"} · refreshes every 30 seconds</p></div><button className="btn btn-ghost" onClick={() => setRefresh(value => value + 1)} aria-label="Refresh dashboard"><Icon name="refresh" size={16} />Refresh</button></div>
    {snapshot.errors.length ? <div className="alert-error" role="alert">{snapshot.errors.map(error => <p key={error}>{error}</p>)}</div> : null}
    <div className="dashboard-metrics">
      <Link href="/permissions"><Icon name="sliders" size={18} /><strong>{count(active?.length)}</strong><span>Active policies</span></Link>
      <Link href="/approvals"><Icon name="key" size={18} /><strong>{count(pending?.length)}</strong><span>{snapshot.adapter === "contract" ? "Pending in latest 50 requests" : "Pending approvals"}</span></Link>
      <Link href="/data"><Icon name="database" size={18} /><strong>{count(snapshot.vault?.length)}</strong><span>Saved vault fields</span></Link>
      <Link href="/activity"><Icon name="activity" size={18} /><strong>{count(snapshot.activity?.length)}</strong><span>Recent events (up to 50)</span></Link>
    </div>
    <div className="workspace-grid">
      <section className="glass-card dashboard-panel"><div className="dashboard-heading"><h3>Needs your attention</h3><Link href="/approvals">View approvals</Link></div>
        {pending?.length ? <ul className="dashboard-list">{pending.slice(0, 5).map(approval => <li key={approval.id}><Link href="/approvals"><strong>{approval.action}</strong><span>{approval.service} · expires {formatExpiry(approval.deadline)}</span></Link></li>)}</ul> : <p className="field-help">{!snapshot.updated ? "Loading approvals…" : pending ? "No pending approvals. You are up to date." : "Approvals unavailable. Retry to check your queue."}</p>}
      </section>
      <section className="glass-card dashboard-panel"><div className="dashboard-heading"><h3>Latest activity</h3><Link href="/activity">View all</Link></div>
        {snapshot.activity?.length ? <ul className="dashboard-list">{snapshot.activity.slice(0, 5).map(event => <li key={event.id}><strong>{event.type.replaceAll("_", " ")}</strong><span>{event.detail}</span><time dateTime={new Date(event.timestamp * 1000).toISOString()}>{formatExpiry(event.timestamp)}</time></li>)}</ul> : <p className="field-help">{!snapshot.updated ? "Loading activity…" : snapshot.activity ? "No events recorded yet." : "Activity unavailable."}</p>}
      </section>
    </div>
  </section>;
}
