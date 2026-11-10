"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getTheme, onThemeChange, setTheme, type Theme } from "@/lib/theme";

/** Har page par dikhne wala chhota floating switch — dark ⇄ light. */
export default function ThemeToggle() {
  const [theme, setLocal] = useState<Theme | null>(null);

  useEffect(() => {
    setLocal(getTheme());
    return onThemeChange(setLocal);
  }, []);

  // Server render par theme pata nahi hota — hydrate hone tak kuch nahi.
  if (!theme) return null;

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(next)}
      aria-label={next === "light" ? "Switch to light theme" : "Switch to dark theme"}
      title={next === "light" ? "Light theme" : "Dark theme"}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
