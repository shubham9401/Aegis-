"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

const navLinks = [
  { href: "/", label: "Connect", icon: "🔑" },
  { href: "/data", label: "Data Vault", icon: "🔒" },
  { href: "/permissions", label: "Permissions", icon: "🛡️" },
  { href: "/approvals", label: "Approvals", icon: "✅" },
  { href: "/activity", label: "Activity", icon: "📊" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { isConnected, address, disconnect } = useAuth();

  return (
    <nav className="navbar">
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          {/* Logo */}
          <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              fontSize: 24,
              background: "linear-gradient(135deg, var(--aegis-primary), var(--aegis-accent))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontWeight: 800,
              letterSpacing: "-0.5px",
            }}>
              ⛨ Aegis
            </span>
          </Link>

          {/* Nav Links */}
          <div style={{ display: "flex", gap: 4 }}>
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link ${pathname === link.href ? "active" : ""}`}
              >
                <span style={{ marginRight: 4 }}>{link.icon}</span>
                {link.label}
              </Link>
            ))}
          </div>

          {/* User Info */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isConnected && address ? (
              <>
                <span style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontFamily: "monospace",
                  padding: "4px 10px",
                  background: "var(--bg-secondary)",
                  borderRadius: 8,
                  border: "1px solid var(--border-color)",
                }}>
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
                <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={disconnect}>
                  Sign Out
                </button>
              </>
            ) : (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Not connected</span>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
