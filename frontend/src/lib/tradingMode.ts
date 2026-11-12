"use client";

import { useEffect, useState } from "react";

/** Poori desk ka ek mode. Paper orders aur live P&L isi se alag rehte hain. */
export type TradingMode = "paper" | "live";

const KEY = "cryptomantra_trading_mode";
const EVENT = "cryptomantra:trading-mode";

export function readTradingMode(): TradingMode {
  if (typeof window === "undefined") return "paper";
  return window.localStorage.getItem(KEY) === "live" ? "live" : "paper";
}

export function writeTradingMode(mode: TradingMode) {
  window.localStorage.setItem(KEY, mode);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }));
}

export function useTradingMode(): [TradingMode, (mode: TradingMode) => void] {
  const [mode, setMode] = useState<TradingMode>("paper");

  useEffect(() => {
    setMode(readTradingMode());
    const onMode = (event: Event) => {
      const next = (event as CustomEvent<TradingMode>).detail;
      if (next === "paper" || next === "live") setMode(next);
    };
    const onStorage = () => setMode(readTradingMode());
    window.addEventListener(EVENT, onMode);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onMode);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return [mode, writeTradingMode];
}
