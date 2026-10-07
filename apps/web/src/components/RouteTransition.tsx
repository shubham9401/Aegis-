"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** A short circuit pulse follows navigation without delaying or blocking it. */
export default function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="route-shell">
      <div key={pathname} className="route-scene">
        <div className="chain-transition" aria-hidden="true">
          <div className="chain-transition-line" />
          <svg className="chain-transition-circuit" viewBox="0 0 600 84" fill="none">
            <path className="chain-trace" d="M0 42H100L124 18H226L250 42H350L374 66H476L500 42H600" />
            <path className="chain-packet" d="M0 42H100L124 18H226L250 42H350L374 66H476L500 42H600" />
            {[100, 250, 350, 500].map((x, index) => (
              <rect key={x} className="chain-node" x={x - 5} y="37" width="10" height="10" rx="2"
                style={{ animationDelay: `${index * 65}ms` }} />
            ))}
          </svg>
        </div>
        <div className="route-content">{children}</div>
      </div>
    </div>
  );
}
