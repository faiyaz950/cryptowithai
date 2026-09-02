"use client";

import { useState, useMemo, useEffect } from "react";
import type { Conversation, UserType } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  userType: UserType;
  questionsLeft: number;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onUserTypeChange: (type: UserType) => void;
  isOpen: boolean;
  onClose: () => void;
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Sidebar({
  conversations, activeId, userType, questionsLeft,
  onNew, onSelect, onDelete, onUserTypeChange, isOpen, onClose,
}: Props) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 transition-opacity duration-200"
        style={{
          background: "rgba(15, 23, 42, 0.28)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
        }}
        onClick={onClose}
        aria-hidden={!isOpen}
      />

      <aside
        className="fixed left-0 top-0 z-50 flex h-full flex-col motion-reduce:transition-none"
        style={{
          width: "280px",
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border)",
          boxShadow: isOpen ? "var(--shadow-lg)" : "none",
          transform: isOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 220ms ease",
          pointerEvents: isOpen ? "auto" : "none",
        }}
        role="navigation"
        aria-label="Chat history"
        aria-hidden={!isOpen}
        inert={!isOpen || undefined}
      >
        <div className="flex items-center justify-between px-4 h-14 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <Logo size={26} showName />
          <button
            type="button"
            onClick={onClose}
            className="w-11 h-11 rounded-lg flex items-center justify-center cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
            aria-label="Close sidebar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-3 pt-3 pb-2 space-y-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => { onNew(); onClose(); }}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium cursor-pointer"
            style={{ background: "var(--accent)", color: "#ffffff" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New chat
          </button>

          <div
            className="flex items-center gap-2 h-10 px-3 rounded-lg"
            style={{ background: "var(--bg-hover)" }}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} style={{ color: "var(--text-muted)" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats"
              className="bg-transparent text-sm outline-none flex-1"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1">
          {filtered.length === 0 ? (
            <p className="text-center py-10 px-4 text-xs" style={{ color: "var(--text-muted)" }}>
              {search ? "No matching chats" : "No chats yet"}
            </p>
          ) : (
            <>
              <p className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                {search ? "Results" : "Recent"}
              </p>
              {filtered.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => { onSelect(conv.id); onClose(); }}
                  className="group flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer mb-0.5"
                  style={{ background: activeId === conv.id ? "var(--accent-soft)" : "transparent" }}
                  onMouseEnter={(e) => { if (activeId !== conv.id) e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = activeId === conv.id ? "var(--accent-soft)" : "transparent"; }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                      {conv.title}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{timeAgo(conv.createdAt)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded flex-shrink-0 cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#dc2626"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                    aria-label="Delete chat"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="px-3 py-3 space-y-2 flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-hover)" }}>
            {(["free", "pro"] as UserType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onUserTypeChange(type)}
                className="flex-1 h-8 text-xs font-medium capitalize rounded-md cursor-pointer"
                style={{
                  background: userType === type ? "var(--bg-card)" : "transparent",
                  color: userType === type ? "var(--text-primary)" : "var(--text-muted)",
                  boxShadow: userType === type ? "var(--shadow-sm)" : "none",
                }}
              >
                {type === "pro" ? "Pro" : "Free"}
              </button>
            ))}
          </div>

          {userType === "free" && (
            <p className="text-xs px-1" style={{ color: "var(--text-muted)" }}>
              {questionsLeft} of 10 questions left today
            </p>
          )}

          {user && (
            <div className="flex items-center gap-2.5 px-1 pt-1">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                style={{ background: "var(--accent)", color: "#ffffff" }}
              >
                {user.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{user.name}</div>
                <div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{user.email}</div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign out"
                className="p-2 rounded-lg cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#dc2626"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
