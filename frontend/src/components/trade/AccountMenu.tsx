"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut, Plug } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/**
 * Desk header ka account button. Pehle yahan sirf ek khaali user icon tha jo
 * kuch nahi karta tha — ab logged-in user ka naam, exchanges aur logout, ya
 * sign-in ka rasta.
 */
export default function AccountMenu({ onOpenExchanges }: { onOpenExchanges: () => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) {
    return (
      <Link href="/login?next=%2Ftrade" className="acct-signin">
        <LogIn className="w-3.5 h-3.5" />
        Sign in
      </Link>
    );
  }

  return (
    <div className="acct" ref={wrapRef}>
      <button
        type="button"
        className="desk-avatar acct-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${user.name}`}
        onClick={() => setOpen((v) => !v)}
      >
        {user.avatar}
      </button>

      {open && (
        <div className="acct-menu" role="menu">
          <div className="acct-id">
            <span className="acct-id-avatar">{user.avatar}</span>
            <span className="min-w-0">
              <span className="acct-id-name">{user.name}</span>
              <span className="acct-id-email">{user.email || `@${user.username}`}</span>
            </span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="acct-item"
            onClick={() => {
              setOpen(false);
              onOpenExchanges();
            }}
          >
            <Plug className="w-4 h-4" />
            Exchanges
          </button>
          <button
            type="button"
            role="menuitem"
            className="acct-item acct-item-danger"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
