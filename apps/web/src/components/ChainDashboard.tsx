"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { decodeEventLog, formatEther, formatUnits, getAddress, zeroAddress } from "viem";
import { CHAIN_STATUS, parseTestAmount } from "@aegis/sdk";
import { useAuth } from "@/contexts/AuthContext";
import { ConnectionGate } from "./ConnectionGate";
import CopyAddress from "./CopyAddress";
import { aegisAbi, ownerWrite, type ChainConfig, type OwnerOperation } from "@/lib/chain-wallet";
interface Permission { id: string; agentId: string; agent: string; parentId: string; actions: string; spendingLimit: string; spent: string; approvedSpent: string; expiresAt: string; paymentRecipient: string; status: number; canDelegate: boolean }
interface Snapshot { config: ChainConfig; balance: string; tokenBalance: string; gasBalance: string; permissions: Permission[]; nextCursor: string | null }
interface Payment { permissionId: string; requestId: `0x${string}`; recipient: `0x${string}`; amount: string; deadline: number; agentId: string; outcome: string }
const fields = [[1, "Dietary preference"], [16, "Travel budget"], [32, "Passport validity"]] as const;
const amount = (raw: string) => formatUnits(BigInt(raw), 6);
export default function ChainDashboard({ section = "policies" }: { section?: "policies" | "approvals" }) {
  const { address, authenticatedFetch, refreshBalance } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [payments, setPayments] = useState<Payment[]>([]);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [hash, setHash] = useState("");
  const [readError, setReadError] = useState("");
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(false);
  const lock = useRef(false), initialized = useRef(false), reading = useRef(false);
  const [cursor, setCursor] = useState("1");
  const [agent, setAgent] = useState(""), [recipient, setRecipient] = useState(""), [limit, setLimit] = useState("500");
  const [selected, setSelected] = useState<number[]>([1, 16]), [pay, setPay] = useState(false), [delegate, setDelegate] = useState(false);
  const [hours, setHours] = useState("24"), [fundAmount, setFundAmount] = useState("1000");
  const load = useCallback(async () => {
    if (!address || reading.current) return;
    reading.current = true;
    setLoading(true);
    try {
      const [response, pending] = await Promise.all([
        authenticatedFetch(`/api/chain?cursor=${cursor}`), authenticatedFetch("/api/chain/payments"),
      ]);
      const [data, records] = await Promise.all([response.json(), pending.json()]);
      if (!response.ok) throw new Error(data.detail || data.error);
      setSnapshot(data);
      if (!initialized.current) { setAgent(data.config.agentId); setRecipient(data.config.recipient); initialized.current = true; }
      if (!pending.ok) throw new Error(records.detail || records.error);
      setPayments(records.payments);
      setReadError("");
    } catch (e) { setReadError(e instanceof Error ? e.message : "Unable to read Monad state."); }
    finally { reading.current = false; setLoading(false); }
  }, [address, authenticatedFetch, cursor]);
  useEffect(() => {
    const refresh = () => { if (!lock.current && document.visibilityState === "visible") void load(); };
    const initial = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearTimeout(initial); clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);
  async function run(operation: OwnerOperation | "approveToken" | "mintDemo", args: readonly unknown[]) {
    if (!address || !snapshot || lock.current) return;
    if (operation === "approvePayment" && Number(args[4]) <= Math.floor(Date.now() / 1000)) {
      setError("This payment request has expired. A new deliberate request is required."); return;
    }
    lock.current = true; setBusy(true); setError(""); setNotice("Use your passkey to sign. Waiting for Monad confirmation…"); setHash("");
    try {
      const receipt = await ownerWrite(snapshot.config, address, operation, args);
      setHash(receipt.transactionHash); setNotice("Transaction confirmed on Monad testnet.");
      if (operation === "cancelPaymentApproval") {
        const cancelled = await authenticatedFetch("/api/chain/payments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: args[1] }) });
        if (!cancelled.ok) setNotice("Approval cancelled on-chain. Refresh and reject the queued request if it is still shown.");
      }
      if (operation === "grantPermission") {
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== snapshot.config.address.toLowerCase()) continue;
          try { const event = decodeEventLog({ abi: aegisAbi, data: log.data, topics: log.topics }); if (event.eventName === "PermissionGranted") setNotice(`Permission ${event.args.permissionId} created. Copy this ID into the agent configuration.`); } catch { /* Other events are irrelevant. */ }
        }
      }
      await Promise.all([load(), refreshBalance()]);
    } catch (e) { setNotice(""); setError(e instanceof Error ? e.message : "Transaction failed."); }
    finally { lock.current = false; setBusy(false); }
  }
  function grant() {
    try {
      if (!snapshot || !/^(0|[1-9]\d{0,77})$/.test(agent) || BigInt(agent) >= 2n ** 256n) throw new Error("Enter a numeric registered agent ID within uint256.");
      const duration = Number(hours);
      if (!Number.isInteger(duration) || duration < 1 || duration > 168) throw new Error("Expiry must be 1–168 hours.");
      const actions = selected.reduce((bits, value) => bits | BigInt(value), pay ? 8n : 0n);
      if (!actions) throw new Error("Select at least one permission.");
      if (pay && (parseTestAmount(limit) <= 0n || getAddress(recipient) === zeroAddress)) throw new Error("Set a positive payment allowance and a nonzero merchant address.");
      void run("grantPermission", [{ agentId: BigInt(agent), scope: snapshot.config.scope, actions,
        spendingLimit: pay ? parseTestAmount(limit) : 0n, expiresAt: BigInt(Math.floor(Date.now() / 1000) + duration * 3600), canDelegate: delegate,
        paymentRecipient: pay ? getAddress(recipient) : zeroAddress }]);
    } catch (e) { setError((e as Error).message); }
  }
  function funding(operation: "approveToken" | "deposit" | "withdraw" | "mintDemo") {
    try {
      if (!snapshot || !address) return;
      const value = parseTestAmount(fundAmount); if (value <= 0n) throw new Error("Enter a positive amount.");
      const args = operation === "approveToken" ? [snapshot.config.address, value] : operation === "withdraw" ? [value, address] : operation === "mintDemo" ? [address, value] : [value];
      void run(operation, args);
    } catch (e) { setError((e as Error).message); }
  }
  async function reject(requestId: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { const res = await authenticatedFetch("/api/chain/payments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }) }); if (!res.ok) throw new Error("Unable to reject request."); await load(); } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  if (!address) return <ConnectionGate icon="shield" title="Control your agents" description="Sign in to grant permissions and approve payments on Monad testnet." />;
  return <div className="page-container">
    <div className="eyebrow">Monad testnet · aUSD-TEST · no real value</div>
    <h1 className="page-title">{section === "policies" ? "On-chain permissions" : "Payment approvals"}</h1>
    <p className="page-subtitle">Confirmed contract state authorizes access and payments. Your passkey signs each owner transaction.</p>
    {error ? <p role="alert" className="error-message">{error}</p> : null}
    {readError ? <p role="alert" className="error-message">{readError} Displayed records may be stale; retry Refresh.</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {hash ? <p><a href={`https://testnet.monadexplorer.com/tx/${hash}`} target="_blank" rel="noreferrer">View confirmed transaction</a></p> : null}
    <button className="btn btn-ghost" disabled={busy || loading} onClick={() => void load()}>{loading ? "Reading Monad…" : "Refresh"}</button>
    {snapshot ? <>
      <div className="chain-addresses"><span>Account <code>{address}</code><CopyAddress address={address} /></span><span>Contract <code>{snapshot.config.address}</code><CopyAddress address={snapshot.config.address} /></span></div>
      <section className="glass-card chain-funding">
        <h2>Test funds</h2>
        <div className="chain-fund-metrics"><div><span>Gas balance</span><strong>{formatEther(BigInt(snapshot.gasBalance))} MON</strong></div><div><span>Wallet balance</span><strong>{amount(snapshot.tokenBalance)} aUSD-TEST</strong></div><div><span>Available to agents</span><strong>{amount(snapshot.balance)} aUSD-TEST</strong></div></div>
        <p>Mint sample tokens, approve the exact deposit amount, then deposit. Withdrawals return funds to your account.</p>
        <label>Token amount<input className="input" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} inputMode="decimal" disabled={busy} /></label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
          <button className="btn btn-secondary" disabled={busy} onClick={() => funding("mintDemo")}>Mint demo tokens</button>
          <button className="btn btn-secondary" disabled={busy} onClick={() => funding("approveToken")}>Approve token deposit</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => funding("deposit")}>Deposit</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => funding("withdraw")}>Withdraw</button>
        </div>
      </section>
      {section === "policies" ? <>
        <section className="glass-card chain-grant"><h2>Grant permission</h2>
          <label>Registered agent ID<input className="input" value={agent} onChange={(e) => setAgent(e.target.value)} inputMode="numeric" /></label>
          <fieldset><legend>Facts the agent may read</legend>{fields.map(([bit, label]) => <label key={bit} style={{ display: "block" }}><input type="checkbox" checked={selected.includes(bit)} onChange={(e) => setSelected((old) => e.target.checked ? [...old, bit] : old.filter((n) => n !== bit))} /> {label}</label>)}</fieldset>
          <label style={{ display: "block" }}><input type="checkbox" checked={pay} onChange={(e) => setPay(e.target.checked)} /> Allow test-token payments</label>
          {pay ? <><label>Approved merchant wallet<input className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label>
            <label>Automatic total allowance (aUSD-TEST)<input className="input" value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" /></label>
            <p>Extra payments require your separate approval and do not reduce or increase the automatic allowance.</p></> : null}
          <label>Expires after (hours)<input className="input" type="number" min="1" max="168" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
          <label style={{ display: "block" }}><input type="checkbox" checked={delegate} onChange={(e) => setDelegate(e.target.checked)} /> Allow this agent to delegate narrower permissions</label>
          <button className="btn btn-primary" disabled={busy} onClick={grant}>Grant with passkey</button>
        </section>
        <h2>Your grants</h2><p className="field-help">Scanning up to 25 contract grant IDs from {cursor}. Each page shows only grants owned by this account.</p>{snapshot.permissions.length === 0 ? <p>No grants owned by you on this page.</p> : null}
        {snapshot.permissions.map((p) => <article key={p.id} className="glass-card" style={{ padding: 20, marginBlock: 12, overflowWrap: "anywhere" }}>
          <h3>Permission {p.id} · agent {p.agentId} · {CHAIN_STATUS[p.status]}</h3>
          <p>Parent: {p.parentId === "0" ? "Root grant" : p.parentId} · Delegation: {p.canDelegate ? "Allowed" : "Disabled"}</p>
          <p>Readable facts: {fields.filter(([bit]) => (BigInt(p.actions) & BigInt(bit)) !== 0n).map(([, name]) => name).join(", ") || "None"}</p>
          <p>Automatic: {amount(p.spent)} / {amount(p.spendingLimit)} · Extra paid: {amount(p.approvedSpent)} aUSD-TEST</p>
          <p>Recipient: {p.paymentRecipient}<br />Expires: {new Date(Number(p.expiresAt) * 1000).toLocaleString()}</p>
          <button className="btn btn-danger-subtle" disabled={busy || p.status !== 0} onClick={() => void run("revokePermission", [BigInt(p.id)])}>Revoke with passkey</button>
        </article>)}
        <div className="chain-page-actions">{cursor !== "1" ? <button className="btn btn-ghost" disabled={loading || busy} onClick={() => setCursor("1")}>First page</button> : null}{snapshot.nextCursor ? <button className="btn btn-ghost" disabled={loading || busy} onClick={() => setCursor(snapshot.nextCursor!)}>Scan next grants</button> : null}</div>
      </> : null}
      <h2>Extra payment requests</h2><p>Showing up to 50 recent requests. Approval permits this exact additional transfer. It does not book a real trip. Cancelling a mined approval needs an on-chain transaction.</p>
      {payments.length === 0 ? <p>No payment requests yet. Run the connected agent with a permission ID.</p> : null}
      {payments.map((p) => <article key={`${p.permissionId}:${p.requestId}`} className="glass-card" style={{ padding: 20, marginBlock: 12, overflowWrap: "anywhere" }}>
        <h3>{amount(p.amount)} aUSD-TEST · {p.outcome}</h3><p>Agent {p.agentId} · Permission {p.permissionId}<br />To: {p.recipient}<br />Request: {p.requestId}<br />Deadline: {new Date(p.deadline * 1000).toLocaleString()}</p>
        <div style={{ display: "flex", gap: 12 }}>
          {p.outcome === "pending" ? <><button className="btn btn-primary" disabled={busy} onClick={() => void run("approvePayment", [BigInt(p.permissionId), p.requestId, p.recipient, BigInt(p.amount), BigInt(p.deadline)])}>Approve exact extra payment</button><button className="btn btn-ghost" disabled={busy} onClick={() => void reject(p.requestId)}>Reject</button></> : null}
          {p.outcome === "approved" ? <button className="btn btn-danger-subtle" disabled={busy} onClick={() => void run("cancelPaymentApproval", [BigInt(p.permissionId), p.requestId])}>Cancel approval on-chain</button> : null}
        </div>
      </article>)}
    </> : null}
  </div>;
}
