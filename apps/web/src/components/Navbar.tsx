"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Icon, type IconName } from "@/components/Icon";

const navLinks: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Overview", icon: "shield" },
  { href: "/data", label: "Vault", icon: "database" },
  { href: "/permissions", label: "Policies", icon: "sliders" },
  { href: "/approvals", label: "Approvals", icon: "check" },
  { href: "/activity", label: "Activity", icon: "activity" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { isConnected, address, disconnect, isLoading } = useAuth();

  return (
    <nav className="navbar">
      <div className="nav-shell">
        <div className="nav-row">
          <Link href="/" className="brand" aria-label="Aegis overview">
            <span className="brand-mark"><Icon name="shield" size={20} /></span>
            <span className="brand-copy">
              <strong>Aegis</strong>
              <small>Agent control plane</small>
            </span>
          </Link>

          <div className="nav-links" aria-label="Primary navigation">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`nav-link ${pathname === link.href ? "active" : ""}`}
                aria-current={pathname === link.href ? "page" : undefined}
              >
                <Icon name={link.icon} size={16} />
                {link.label}
              </Link>
            ))}
          </div>

          <div className="nav-account">
            {isConnected && address ? (
              <>
                <span className="connection-dot" aria-label="Connected" />
                <span className="address-chip">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
                <button className="nav-signout" onClick={disconnect} disabled={isLoading} aria-label="Disconnect account" title="Disconnect account">
                  <Icon name="logout" size={16} /><span>Disconnect</span>
                </button>
              </>
            ) : (
              <span className="connection-icon" role="img" aria-label="Account disconnected" title="Account disconnected">
                <Icon name="disconnected" size={19} />
              </span>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
