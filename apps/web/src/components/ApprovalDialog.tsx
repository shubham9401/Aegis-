"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Native modal semantics provide keyboard focus containment and focus restoration. */
export default function ApprovalDialog({ children, busy, onClose }: { children: ReactNode; busy: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="approval-dialog" aria-label="Action approval" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>{children}</dialog>;
}
