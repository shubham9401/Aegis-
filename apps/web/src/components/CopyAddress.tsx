"use client";
import { useState } from "react";

export default function CopyAddress({ address }: { address: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(address); setMessage("Copied"); }
    catch { setMessage("Copy unavailable; select the address"); }
  }
  return <span className="copy-address"><button className="btn btn-ghost" type="button" onClick={copy} aria-label="Copy account address" title="Copy full account address"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg></button><small role="status">{message}</small></span>;
}
