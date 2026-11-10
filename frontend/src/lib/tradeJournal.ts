"use client";

import { useEffect, useState } from "react";

export interface JournalTrade {
  id: string;
  at: number;
  symbol: string;
  side: "long" | "short";
  pnl: number;
  roi: number;
  strategy: string;
  tags: string[];
  mode: "paper" | "live";
}

const KEY = "cryptomantra_trade_journal";
const EVENT = "cryptomantra:journal";

function read(): JournalTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "[]") as JournalTrade[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(rows: JournalTrade[]) {
  window.localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 500)));
  window.dispatchEvent(new Event(EVENT));
}

export function listJournal(): JournalTrade[] {
  return read().slice().sort((a, b) => b.at - a.at);
}

export function addJournalTrades(rows: JournalTrade[]) {
  if (rows.length === 0) return;
  write([...rows, ...read()]);
}

export function useJournal(): JournalTrade[] {
  const [rows, setRows] = useState<JournalTrade[]>([]);
  useEffect(() => {
    const sync = () => setRows(listJournal());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return rows;
}
