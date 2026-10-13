"use client";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
interface Event { name: string; hash: string; index: number; block: string; args: Record<string, string | boolean> }
export default function ChainEvents() {
  const { authenticatedFetch } = useAuth();
  const [events, setEvents] = useState<Event[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [range, setRange] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async (before?: string) => {
    setBusy(true);
    try {
      const res = await authenticatedFetch(`/api/chain/events${before ? `?before=${before}` : ""}`); const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error);
      setEvents(data.events); setCursor(data.nextBefore); setRange(`${data.fromBlock}–${data.toBlock}`); setError("");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [authenticatedFetch]);
  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); return () => clearTimeout(initial); }, [load]);
  return <section className="glass-card" style={{ padding: 20, marginBlock: 20 }}>
    <h2>Confirmed contract events</h2><p>Blocks {range || "loading"}. This paginated feed is for display; authorization reads live contract state.</p>
    {error ? <p role="alert">{error}</p> : null}
    {events.map((event) => <article key={`${event.hash}:${event.index}`} style={{ marginBlock: 12, overflowWrap: "anywhere" }}>
      <strong>{event.name}</strong> · Block {event.block}
      <p>{Object.entries(event.args).filter(([key]) => ["permissionId", "parentId", "amount", "recipient", "manuallyApproved"].includes(key)).map(([key, value]) => `${key}: ${value}`).join(" · ")}</p>
      <a href={`https://testnet.monadexplorer.com/tx/${event.hash}`} target="_blank" rel="noreferrer">View transaction</a>
    </article>)}
    {!busy && events.length === 0 ? <p>No events for your account in this block range.</p> : null}
    <button className="btn btn-ghost" disabled={busy} onClick={() => void load()}>Latest events</button>
    {cursor ? <button className="btn btn-ghost" disabled={busy} onClick={() => void load(cursor)}>Earlier blocks</button> : null}
  </section>;
}
