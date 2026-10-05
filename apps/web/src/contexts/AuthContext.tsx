"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

// ─── Types ───

interface AuthState {
  address: `0x${string}` | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  balance: string | null;
}

interface AuthContextValue extends AuthState {
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// ─── Demo mode: simulated passkey auth ───
// Mera passkey integration requires HTTPS or localhost + PRF-capable browser.
// For development/demo, we simulate with a deterministic address.
// TODO: Replace with real Mera integration when deploying to final domain.

const DEMO_ADDRESS = "0x1111111111111111111111111111111111111111" as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    address: null,
    isConnected: false,
    isLoading: false,
    error: null,
    balance: null,
  });

  // Check localStorage for existing session on mount
  useEffect(() => {
    const stored = localStorage.getItem("aegis_session");
    if (stored) {
      try {
        const session = JSON.parse(stored);
        if (session.address) {
          setState((s) => ({ ...s, address: session.address, isConnected: true }));
        }
      } catch {
        localStorage.removeItem("aegis_session");
      }
    }
  }, []);

  // Fetch balance when connected
  useEffect(() => {
    if (state.isConnected && state.address) {
      refreshBalance();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isConnected, state.address]);

  const refreshBalance = useCallback(async () => {
    if (!state.address) return;
    try {
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz";
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBalance",
          params: [state.address, "latest"],
          id: 1,
        }),
      });
      const data = await response.json();
      if (data.result) {
        const wei = BigInt(data.result);
        const mon = Number(wei) / 1e18;
        setState((s) => ({ ...s, balance: mon.toFixed(4) }));
      }
    } catch {
      setState((s) => ({ ...s, balance: "—" }));
    }
  }, [state.address]);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      // Simulate passkey creation delay
      await new Promise((r) => setTimeout(r, 800));

      // TODO: Real Mera passkey flow:
      // const { credentialId, transports, prfOutput } = await createPasskeyWithPrfOutput({
      //   rp: { id: rpId, name: "Aegis" },
      //   user: { name: "aegis-user", displayName: "Aegis User" },
      // });
      // Store { credentialId, transports } in localStorage
      // Derive EOA from prfOutput via BIP-44

      const address = DEMO_ADDRESS;

      localStorage.setItem(
        "aegis_session",
        JSON.stringify({ address, connectedAt: Date.now() }),
      );

      setState({
        address,
        isConnected: true,
        isLoading: false,
        error: null,
        balance: null,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message.includes("PRF")
            ? "Your browser or passkey provider does not support WebAuthn PRF. Try desktop Chrome with Google Password Manager."
            : err.message
          : "Failed to connect";

      setState((s) => ({ ...s, isLoading: false, error: message }));
    }
  }, []);

  const disconnect = useCallback(() => {
    // TODO: session.end() to zero the key
    localStorage.removeItem("aegis_session");
    setState({
      address: null,
      isConnected: false,
      isLoading: false,
      error: null,
      balance: null,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, connect, disconnect, refreshBalance }}>
      {children}
    </AuthContext.Provider>
  );
}
