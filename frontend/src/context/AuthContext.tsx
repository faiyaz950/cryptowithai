"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import LoadingScreen from "@/components/LoadingScreen";
import {
  AccountApiError,
  fetchMe,
  loginAccount,
  logoutAccount,
  registerAccount,
  type AccountUser,
} from "@/lib/accountApi";

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  email: string;
  plan: "free" | "pro";
  avatar: string; // initials
}

interface AuthContextType {
  user: AuthUser | null;
  /** Backend session token — exchange jaisi private APIs isi se chalti hain. */
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Kisi API ne 401 diya — session khatam maan kar user ko logout dikhao. */
  handleExpiredSession: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const SESSION_KEY = "finowings_session";
/**
 * Purana browser-only login isi key mein "user" save karta tha, bina kisi
 * backend account ke. Wo asli account nahi the, isliye mile to hata do —
 * warna user khud ko logged in dekhta aur har private request 401 deti.
 */
const LEGACY_USER_KEY = "finowingsai_user";

interface StoredSession {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U"
  );
}

function toAuthUser(u: AccountUser): AuthUser {
  const name = u.full_name?.trim() || u.username;
  return { id: u.id, username: u.username, name, email: u.email, plan: "free", avatar: getInitials(name) };
}

function readSession(): StoredSession | null {
  try {
    localStorage.removeItem(LEGACY_USER_KEY);
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed.token || !parsed.user) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // private mode — session sirf is tab tak
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    writeSession(null);
    setSession(null);
  }, []);

  useEffect(() => {
    const stored = readSession();
    // Saved session turant dikhao aur backend se peeche check karo. Render ka
    // free server so raha ho to /me mein ek minute lag sakta hai — utni der
    // poora app loading screen par nahi atakna chahiye.
    setSession(stored);
    setIsLoading(false);
    if (!stored) return;

    fetchMe(stored.token)
      .then(({ user }) => {
        const next = { ...stored, user: toAuthUser(user) };
        writeSession(next);
        setSession(next);
      })
      .catch((err) => {
        // Sirf tab logout jab backend ne session reject kiya — network fail par nahi.
        if (err instanceof AccountApiError && err.status === 401) clearSession();
      });
  }, [clearSession]);

  const applySession = useCallback((res: { token: string; expires_at: string; user: AccountUser }) => {
    const next: StoredSession = { token: res.token, expiresAt: res.expires_at, user: toAuthUser(res.user) };
    writeSession(next);
    setSession(next);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      applySession(await loginAccount(email.trim(), password));
    },
    [applySession],
  );

  const signup = useCallback(
    async (name: string, email: string, password: string) => {
      if (!name.trim()) throw new Error("Naam zaroori hai");
      if (password.length < 8) throw new Error("Password kam se kam 8 characters ka ho");
      applySession(await registerAccount(name.trim(), email.trim(), password));
    },
    [applySession],
  );

  const logout = useCallback(() => {
    const token = session?.token;
    clearSession();
    // Server par bhi session band karo; fail ho to bhi local logout ho chuka.
    if (token) void logoutAccount(token).catch(() => {});
  }, [session?.token, clearSession]);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        token: session?.token ?? null,
        isLoading,
        login,
        signup,
        logout,
        handleExpiredSession: clearSession,
      }}
    >
      {isLoading ? <LoadingScreen /> : <div className="h-full">{children}</div>}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
