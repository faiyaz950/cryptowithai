"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import LoadingScreen from "@/components/LoadingScreen";

export interface AuthUser {
  name: string;
  email: string;
  plan: "free" | "pro";
  avatar: string; // initials
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = "finowingsai_user";

// Demo accounts for testing
const DEMO_ACCOUNTS: Record<string, { password: string; name: string; plan: "free" | "pro" }> = {
  "demo@finowings.com": { password: "demo123", name: "Demo User", plan: "free" },
  "pro@finowings.com": { password: "pro123", name: "Pro User", plan: "pro" },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setUser(JSON.parse(stored));
    } catch {
      // ignore
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await new Promise((r) => setTimeout(r, 800)); // simulate network

    const account = DEMO_ACCOUNTS[email.toLowerCase()];
    if (account && account.password === password) {
      const u: AuthUser = {
        name: account.name,
        email: email.toLowerCase(),
        plan: account.plan,
        avatar: getInitials(account.name),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      setUser(u);
      return;
    }

    // Accept any email/password for real use
    if (email && password.length >= 6) {
      const name = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const u: AuthUser = {
        name,
        email: email.toLowerCase(),
        plan: "free",
        avatar: getInitials(name),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      setUser(u);
      return;
    }

    throw new Error("Invalid email or password");
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    await new Promise((r) => setTimeout(r, 900));

    if (!name.trim()) throw new Error("Name is required");
    if (!email.includes("@")) throw new Error("Invalid email address");
    if (password.length < 6) throw new Error("Password must be at least 6 characters");

    const u: AuthUser = {
      name: name.trim(),
      email: email.toLowerCase(),
      plan: "free",
      avatar: getInitials(name),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {isLoading ? <LoadingScreen /> : <div className="h-full">{children}</div>}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
