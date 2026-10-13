"use client";

import { useState, useEffect, useCallback, useRef, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ConnectionGate } from "@/components/ConnectionGate";
import { Icon } from "@/components/Icon";
import { CURRENCIES, DIETARY_OPTIONS, passportExpiryStatus } from "@/lib/profile-fields";
import { vaultBatchWriteSchema } from "@/lib/validation";
import { decimalToMinorUnits } from "@/lib/utils";

function DataVaultPageContent() {
  const expiryInput = useRef<HTMLInputElement>(null);
  const [pickerError, setPickerError] = useState("");
  const { isConnected, address, authenticatedFetch } = useAuth();
  const [diet, setDiet] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [expiry, setExpiry] = useState("");
  const [today, setToday] = useState("");
  const [stored, setStored] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadVaultStatus = useCallback(async () => {
    if (!address) return;
    const response = await authenticatedFetch(`/api/vault?user=${address}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail ?? "Unable to load vault");
    setStored(data.entries.map((entry: { scope: string }) => entry.scope));
  }, [address, authenticatedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setToday(new Date().toLocaleDateString("en-CA"));
      if (isConnected && address) void loadVaultStatus().catch(error => { setSuccess(false); setMessage(error instanceof Error ? error.message : "Unable to load vault"); });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isConnected, address, loadVaultStatus]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || saving) return;
    setMessage(null); setSuccess(false);
    try {
      const entries: { scope: string; value: string }[] = [];
      if (diet) entries.push({ scope: "profile:dietary-preference", value: diet.toLowerCase() });
      if (budget) {
        const cents = BigInt(decimalToMinorUnits(budget));
        entries.push({ scope: "profile:travel-budget", value: `${currency} ${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}` });
      }
      if (expiry) entries.push({ scope: "profile:passport-validity", value: expiry });
      const parsed = vaultBatchWriteSchema.safeParse({ entries });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      setSaving(true);
      const response = await authenticatedFetch("/api/vault", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? data.error ?? "Unable to save");
      setSuccess(true); setMessage("Selected fields encrypted and saved.");
      setDiet(""); setBudget(""); setExpiry("");
      setStored(previous => [...new Set([...previous, ...parsed.data.entries.map(entry => entry.scope)])]);
    } catch (error) {
      setSuccess(false); setMessage(error instanceof Error ? error.message : "Unable to save");
    } finally { setSaving(false); }
  }

  if (!isConnected) return <ConnectionGate icon="database" title="Unlock your private context vault" description="Sign in with a passkey to manage encrypted travel preferences." />;
  const saved = (scope: string) => stored.includes(scope) ? <span className="badge badge-active">Saved</span> : null;

  const changedCount = Number(Boolean(diet)) + Number(Boolean(budget)) + Number(Boolean(expiry));
  function openCalendar() {
    const input = expiryInput.current;
    if (!input) return;
    try {
      if (typeof input.showPicker === "function") input.showPicker();
      else { input.focus(); setPickerError("Enter the expiry date in the date field."); }
    } catch { input.focus(); setPickerError("Enter the expiry date in the date field."); }
  }
  return <div className="page-container vault-page">
    <header className="vault-page-heading"><div><span className="vault-eyebrow">Private context</span><h1 className="page-title">Your data vault</h1><p>Choose what agents can learn about you. Access stays under your policies.</p></div><span className="vault-security-chip"><Icon name="lock" size={15} />Encrypted at rest</span></header>
    <form className="glass-card vault-editor" onSubmit={handleSave}>
      <fieldset disabled={saving}>
        <section className="vault-field-row">
          <div className="vault-field-description"><div className="vault-section-icon"><Icon name="sliders" size={20} /></div><h2>Dietary preference</h2><p>Help agents plan meals that suit you.</p>{saved("profile:dietary-preference")}</div>
          <div className="vault-field-control"><div className="vault-choice-grid" role="group" aria-label="Dietary preference">{DIETARY_OPTIONS.map(option => <button key={option} type="button" className={diet === option ? "vault-choice selected" : "vault-choice"} aria-pressed={diet === option} onClick={() => setDiet(previous => previous === option ? "" : option)}><span className="vault-choice-dot" />{option}{diet === option ? <Icon name="check" size={14} /> : null}</button>)}</div><p className="vault-field-note">Select a preference. Select it again to leave this field unchanged.</p></div>
        </section>
        <section className="vault-field-row">
          <div className="vault-field-description"><div className="vault-section-icon"><Icon name="wallet" size={20} /></div><h2><label htmlFor="budget">Travel budget</label></h2><p>Your preferred budget for a trip.</p>{saved("profile:travel-budget")}</div>
          <div className="vault-field-control"><div className="vault-budget-group"><select className="select" aria-label="Budget currency" value={currency} onChange={event => setCurrency(event.target.value)}>{CURRENCIES.map(code => <option key={code}>{code}</option>)}</select><input className="input" id="budget" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="500.00" value={budget} onChange={event => setBudget(event.target.value)} /></div><p className="vault-field-note">A positive amount with up to two decimal places.</p></div>
        </section>
        <section className="vault-field-row">
          <div className="vault-field-description"><div className="vault-section-icon"><Icon name="shield" size={20} /></div><h2><label htmlFor="passport-expiry">Passport expiry</label></h2><p>Check how long your passport has left.</p>{saved("profile:passport-validity")}</div>
          <div className="vault-field-control"><div className="vault-date-group"><input ref={expiryInput} className="input" id="passport-expiry" type="date" value={expiry} onChange={event => { setExpiry(event.target.value); setPickerError(""); }} /><button className="btn btn-ghost vault-calendar-button" type="button" onClick={openCalendar} aria-label="Open passport expiry calendar"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M7 17h2"/></svg>Choose date</button></div>
            {expiry && today ? <p className={expiry < today ? "vault-expiry-status expired" : "vault-expiry-status"} role="status">{passportExpiryStatus(expiry, today)}</p> : <p className="vault-field-note">Select a date to check expiry automatically.</p>}
            {pickerError ? <p className="vault-field-note" role="status">{pickerError}</p> : null}
            <p className="vault-field-note">Expiry check only. This does not verify the document or destination entry rules.</p>
          </div>
        </section>
        <footer className="vault-save-bar"><div><strong>{changedCount ? `${changedCount} field${changedCount === 1 ? "" : "s"} ready to save` : "Only selected fields will be updated"}</strong><p>Leave a field empty to keep its saved value.</p></div><button className="btn btn-primary" disabled={changedCount === 0}><Icon name="lock" size={16} />{saving ? "Encrypting & saving…" : "Encrypt & save"}</button></footer>
      </fieldset>
      {message ? <p className={success ? "save-feedback vault-message" : "alert-error vault-message"} role={success ? "status" : "alert"}>{message}</p> : null}
    </form>
    <p className="vault-trust-note"><Icon name="shield" size={15} />Values are encrypted with a server-held key. Agents receive only the fields allowed by your policies.</p>
  </div>;
}

export default function DataVaultPage() {
  const { address } = useAuth();
  return <DataVaultPageContent key={address ?? "signed-out"} />;
}
