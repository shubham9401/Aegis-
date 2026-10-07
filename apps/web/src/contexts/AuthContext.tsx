"use client";
import React, { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { isMeraError } from "@category-labs/mera";
import { createPublicClient, http, formatEther, bytesToHex, type Address } from "viem";
import { monadTestnet } from "viem/chains";
import { openPasskey, storedPasskey } from "@/lib/passkey";
import { AEGIS_EIP712_DOMAIN, ACTION_APPROVAL_TYPES } from "@/lib/eip712";
import type { ApprovalRequest } from "@/lib/approval-store";
interface AuthState { address: Address | null; isConnected: boolean; isLoading: boolean; error: string | null; balance: string | null; hasPasskey: boolean }
interface AuthContextValue extends AuthState {
  connect: () => Promise<void>; createPasskey: () => Promise<void>; disconnect: () => void; refreshBalance: () => Promise<void>;
  authenticatedFetch: (input: string, init?: RequestInit) => Promise<Response>;
  signApproval: (request: ApprovalRequest) => Promise<{ signer: Address; signature: `0x${string}`; nonce: `0x${string}` }>;
}
const AuthContext = createContext<AuthContextValue | null>(null);
export function useAuth() { const ctx = useContext(AuthContext); if (!ctx) throw new Error("useAuth must be used within AuthProvider"); return ctx; }
const empty: AuthState = { address: null, isConnected: false, isLoading: false, error: null, balance: null, hasPasskey: false };
type Signing = Awaited<ReturnType<typeof openPasskey>>;
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(empty);
  const signing = useRef<Signing | null>(null), generation = useRef(0), busy = useRef(false);
  const pendingLogout = useRef<Promise<void> | null>(null);
  const authenticatedFetch = useCallback((input: string, init?: RequestInit) => {
    const url = new URL(input, window.location.origin);
    if (url.origin !== window.location.origin) throw new Error("Authenticated requests must stay on the Aegis origin.");
    return fetch(url, { ...init, credentials: "same-origin", cache: "no-store" });
  }, []);
  useEffect(() => {
    const current = generation.current;
    localStorage.removeItem("aegis_session");
    void authenticatedFetch("/api/auth/session").then(async (r) => {
      const body = r.ok ? await r.json() : null;
      if (current === generation.current) setState({ ...empty, hasPasskey: Boolean(storedPasskey()), address: body?.address ?? null, isConnected: Boolean(body?.address) });
    }).catch(() => { if (current === generation.current) setState((s) => ({ ...s, hasPasskey: Boolean(storedPasskey()) })); });
    return () => {
      // Invalidate every pending operation at cleanup, including a login started after mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++; signing.current?.session.end(); signing.current = null;
    };
  }, [authenticatedFetch]);
  const refreshBalance = useCallback(async () => {
    const address = state.address; if (!address) return;
    try {
      const client = createPublicClient({ chain: monadTestnet, transport: http(process.env.NEXT_PUBLIC_RPC_URL || undefined) });
      const balance = formatEther(await client.getBalance({ address }));
      setState((s) => s.address === address ? { ...s, balance } : s);
    } catch { setState((s) => s.address === address ? { ...s, balance: "—" } : s); }
  }, [state.address]);
  useEffect(() => {
    if (state.address) { const timer = window.setTimeout(() => void refreshBalance(), 0); return () => window.clearTimeout(timer); }
  }, [state.address, refreshBalance]);
  const login = useCallback(async (create: boolean) => {
    if (busy.current) return; busy.current = true;
    const current = ++generation.current;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    let next: Signing | undefined;
    try {
      await pendingLogout.current;
      if (current !== generation.current) return;
      next = await openPasskey(create);
      if (current !== generation.current) return;
      const challenge = await authenticatedFetch("/api/auth/challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: next.account.address }) });
      const body = await challenge.json(); if (!challenge.ok) throw new Error(body.detail || "Sign-in challenge failed.");
      const signature = await next.account.signMessage({ message: body.message });
      if (current !== generation.current) return;
      const proof = await authenticatedFetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: next.account.address, signature }) });
      const result = await proof.json(); if (!proof.ok) throw new Error(result.detail || "Sign-in proof failed.");
      if (current !== generation.current) { await authenticatedFetch("/api/auth/session", { method: "DELETE" }); return; }
      signing.current?.session.end(); signing.current = next; next = undefined;
      setState({ ...empty, address: result.address, isConnected: true, hasPasskey: true });
    } catch (error) {
      if (current === generation.current) {
        const message = isMeraError(error) && error.code === "PRF_UNAVAILABLE" ? "Your passkey provider does not support PRF. Use a compatible provider, such as Google Password Manager on Chrome." : error instanceof Error ? error.message : "Passkey sign-in failed.";
        setState((s) => ({ ...s, isLoading: false, error: message, hasPasskey: Boolean(storedPasskey()) }));
      }
    } finally { next?.session.end(); busy.current = false; }
  }, [authenticatedFetch]);
  const connect = useCallback(() => login(false), [login]);
  const createPasskey = useCallback(() => login(true), [login]);
  const disconnect = useCallback(() => {
    const current = ++generation.current; signing.current?.session.end(); signing.current = null;
    setState({ ...empty, hasPasskey: Boolean(storedPasskey()), isLoading: true });
    const logout = authenticatedFetch("/api/auth/session", { method: "DELETE" }).then((r) => {
      if (!r.ok) throw new Error("Server sign-out failed. Retry disconnect.");
      if (current === generation.current) setState((s) => ({ ...s, isLoading: false }));
    });
    pendingLogout.current = logout;
    void logout.catch((e: Error) => { if (current === generation.current) setState((s) => ({ ...s, isLoading: false, error: e.message })); });
  }, [authenticatedFetch]);
  const signApproval = useCallback(async (request: ApprovalRequest) => {
    if (!state.address || request.user.toLowerCase() !== state.address.toLowerCase()) throw new Error("Sign in as the owner of this approval.");
    if (request.deadline <= Math.floor(Date.now() / 1000)) throw new Error("This approval request has expired.");
    const current = generation.current, fresh = await openPasskey();
    try {
      if (current !== generation.current || fresh.account.address.toLowerCase() !== request.user.toLowerCase()) throw new Error("The selected passkey does not match the approval owner.");
      const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
      const signature = await fresh.account.signTypedData({ domain: AEGIS_EIP712_DOMAIN, types: ACTION_APPROVAL_TYPES, primaryType: "ActionApproval", message: {
        permissionId: request.permissionId, requestId: request.requestId, action: request.action, amountMinor: BigInt(request.amountMinor), currency: request.currency, service: request.service, nonce, deadline: BigInt(request.deadline),
      } });
      if (current !== generation.current) throw new Error("Session ended during approval.");
      return { signer: fresh.account.address, signature, nonce };
    } finally { fresh.session.end(); }
  }, [state.address]);
  return <AuthContext.Provider value={{ ...state, connect, createPasskey, disconnect, refreshBalance, authenticatedFetch, signApproval }}><React.Fragment key={state.address || "signed-out"}>{children}</React.Fragment></AuthContext.Provider>;
}
