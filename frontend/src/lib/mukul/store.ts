"use client";

import { useEffect, useState } from "react";
import type { AlertRule } from "@/lib/mukul/market";

export type OfferId = "a" | "b" | "c";

export interface Attribution {
  clickId: string;
  offer: OfferId;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
}

export interface FunnelEvent {
  id: string;
  type: "landing" | "referral_click" | "account_claim" | "kyc" | "deposit" | "first_trade" | "active";
  at: string;
  offer: OfferId;
  content: string;
  clickId: string;
}

export interface Membership {
  exchangeUserId: string;
  contact: string;
  claimedAt: string;
  /** Exchange referral API abhi connected nahi — claim record hai, exchange-confirmed nahi. */
  exchangeConfirmed: false;
  depositMarked: boolean;
  firstTradeMarked: boolean;
}

export interface PaperPosition {
  id: string;
  symbol: string;
  strategy: string;
  notionalInr: number;
  entryUsd: number;
  openedAt: string;
}

export interface PaperTrade {
  id: string;
  symbol: string;
  strategy: string;
  notionalInr: number;
  entryUsd: number;
  exitUsd: number;
  pnlInr: number;
  pnlPct: number;
  rr: number;
  stopMoved: boolean;
  openedAt: string;
  closedAt: string;
}

export interface ClubAlert extends AlertRule {
  createdAt: string;
}

export interface ClubNotice {
  id: string;
  at: string;
  symbol: string;
  text: string;
  email: string;
  telegram: boolean;
}

export interface CommunityPost {
  id: string;
  channel: "updates" | "learning" | "room" | "algo" | "education";
  author: string;
  body: string;
  at: string;
}

export interface DcaPlan {
  symbol: string;
  amountInr: number;
  cadence: "week" | "month";
  nextDate: string;
}

export interface MissionAnswer {
  day: string;
  text: string;
  at: string;
}

export interface RadarSnapshot {
  day: string;
  symbol: string;
  setup: string;
  why: string;
  price: number;
}

export interface ClubState {
  attribution: Attribution;
  events: FunnelEvent[];
  membership: Membership | null;
  activeDays: string[];
  alerts: ClubAlert[];
  notices: ClubNotice[];
  alertFiredOn: Record<string, string>;
  paperCash: number;
  paperPeak: number;
  positions: PaperPosition[];
  paperTrades: PaperTrade[];
  posts: CommunityPost[];
  dca: DcaPlan | null;
  missions: MissionAnswer[];
  radarHistory: RadarSnapshot[];
}

export const PAPER_START_INR = 100_000;
/** Paper marks ke liye fixed study rate. Live FX nahi hai. */
export const PAPER_USD_INR = 84;

export const OFFER_LABEL: Record<OfferId, string> = {
  a: "Free Mukul Algo",
  b: "Free Cryptomantra Access",
  c: "Free Mukul Live Trading Room + Algo",
};

const KEY = "mukul_club_v1";

function empty(): ClubState {
  return {
    attribution: {
      clickId: "",
      offer: "b",
      utmSource: "",
      utmMedium: "",
      utmCampaign: "",
      utmContent: "",
    },
    events: [],
    membership: null,
    activeDays: [],
    alerts: [],
    notices: [],
    alertFiredOn: {},
    paperCash: PAPER_START_INR,
    paperPeak: PAPER_START_INR,
    positions: [],
    paperTrades: [],
    posts: [
      {
        id: "seed-learn",
        channel: "learning",
        author: "Mukul Club",
        body: "Aaj sirf ek chart kholo aur support likho. Yahan signal paste nahi karna — seekhna hai ki level kyun hai.",
        at: new Date().toISOString(),
      },
      {
        id: "seed-edu",
        channel: "education",
        author: "Mukul Club",
        body: "Strategy library mein Learn → Backtest → Paper Trade → Track. Pehle paper, baad mein sochna.",
        at: new Date().toISOString(),
      },
      {
        id: "seed-room",
        channel: "room",
        author: "Mukul Club",
        body: "Live room ka order: Market overview, phir BTC, ETH, major setups, aur risk discussion. Tip group nahi.",
        at: new Date().toISOString(),
      },
    ],
    dca: null,
    missions: [],
    radarHistory: [],
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function normalize(raw: Partial<ClubState> | null): ClubState {
  const base = empty();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    attribution: { ...base.attribution, ...(raw.attribution ?? {}) },
    events: Array.isArray(raw.events) ? raw.events : [],
    alerts: Array.isArray(raw.alerts) ? raw.alerts : [],
    notices: Array.isArray(raw.notices) ? raw.notices : [],
    positions: Array.isArray(raw.positions) ? raw.positions : [],
    paperTrades: Array.isArray(raw.paperTrades) ? raw.paperTrades : [],
    posts: Array.isArray(raw.posts) && raw.posts.length ? raw.posts : base.posts,
    missions: Array.isArray(raw.missions) ? raw.missions : [],
    radarHistory: Array.isArray(raw.radarHistory) ? raw.radarHistory : [],
    activeDays: Array.isArray(raw.activeDays) ? raw.activeDays : [],
    alertFiredOn: raw.alertFiredOn && typeof raw.alertFiredOn === "object" ? raw.alertFiredOn : {},
    paperCash: typeof raw.paperCash === "number" ? raw.paperCash : PAPER_START_INR,
    paperPeak: typeof raw.paperPeak === "number" ? raw.paperPeak : PAPER_START_INR,
    membership: raw.membership ?? null,
    dca: raw.dca ?? null,
  };
}

let snapshot: ClubState = empty();
let loaded = false;
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    /* private mode */
  }
  listeners.forEach((fn) => fn());
}

export function loadClub(): ClubState {
  if (loaded || typeof window === "undefined") return snapshot;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) snapshot = normalize(JSON.parse(raw) as Partial<ClubState>);
  } catch {
    snapshot = empty();
  }
  return snapshot;
}

export function updateClub(mutator: (state: ClubState) => void) {
  loadClub();
  const next = normalize(JSON.parse(JSON.stringify(snapshot)) as ClubState);
  mutator(next);
  snapshot = next;
  persist();
}

export function useClub(): ClubState | null {
  const [state, setState] = useState<ClubState | null>(null);
  useEffect(() => {
    setState(loadClub());
    const pull = () => setState(loadClub());
    listeners.add(pull);
    return () => {
      listeners.delete(pull);
    };
  }, []);
  return state;
}

function pushEvent(state: ClubState, type: FunnelEvent["type"]) {
  state.events.push({
    id: newId(),
    type,
    at: new Date().toISOString(),
    offer: state.attribution.offer,
    content: state.attribution.utmContent || "direct",
    clickId: state.attribution.clickId,
  });
  void fetch("/api/mukul/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.events[state.events.length - 1]),
  }).catch(() => undefined);
}

export function captureVisit(params: URLSearchParams) {
  updateClub((state) => {
    if (!state.attribution.clickId) state.attribution.clickId = newId();
    const offer = params.get("offer");
    if (offer === "a" || offer === "b" || offer === "c") state.attribution.offer = offer;
    const source = params.get("utm_source");
    const medium = params.get("utm_medium");
    const campaign = params.get("utm_campaign");
    const content = params.get("utm_content");
    if (source) state.attribution.utmSource = source;
    if (medium) state.attribution.utmMedium = medium;
    if (campaign) state.attribution.utmCampaign = campaign;
    if (content) state.attribution.utmContent = content;
    const seen = sessionStorage.getItem("mukul_landing_counted");
    if (!seen) {
      sessionStorage.setItem("mukul_landing_counted", "1");
      pushEvent(state, "landing");
    }
  });
}

export function referralUrl(state: ClubState): string {
  const base = process.env.NEXT_PUBLIC_MUKUL_REFERRAL_URL || "https://www.delta.exchange/";
  try {
    const url = new URL(base);
    url.searchParams.set("mukul_click", state.attribution.clickId || "pending");
    url.searchParams.set("utm_source", state.attribution.utmSource || "youtube");
    url.searchParams.set("utm_medium", state.attribution.utmMedium || "club");
    url.searchParams.set("utm_campaign", state.attribution.offer);
    url.searchParams.set("utm_content", state.attribution.utmContent || "landing");
    return url.toString();
  } catch {
    return base;
  }
}

export function recordReferralClick() {
  updateClub((state) => {
    if (!state.attribution.clickId) state.attribution.clickId = newId();
    pushEvent(state, "referral_click");
  });
}

export function claimMembership(exchangeUserId: string, contact: string) {
  updateClub((state) => {
    state.membership = {
      exchangeUserId: exchangeUserId.trim(),
      contact: contact.trim(),
      claimedAt: new Date().toISOString(),
      exchangeConfirmed: false,
      depositMarked: false,
      firstTradeMarked: false,
    };
    pushEvent(state, "account_claim");
    pushEvent(state, "kyc");
  });
}

export function markDeposit() {
  updateClub((state) => {
    if (!state.membership || state.membership.depositMarked) return;
    state.membership.depositMarked = true;
    pushEvent(state, "deposit");
  });
}

export function markFirstTrade() {
  updateClub((state) => {
    if (!state.membership || state.membership.firstTradeMarked) return;
    state.membership.firstTradeMarked = true;
    pushEvent(state, "first_trade");
  });
}

export function touchActive() {
  updateClub((state) => {
    const day = todayKey();
    if (state.activeDays.includes(day)) return;
    state.activeDays.push(day);
    pushEvent(state, "active");
  });
}

export function saveRadarDay(rows: RadarSnapshot[]) {
  updateClub((state) => {
    const day = todayKey();
    state.radarHistory = state.radarHistory.filter((row) => row.day !== day).concat(rows).slice(-80);
  });
}

export function addAlert(rule: Omit<ClubAlert, "id" | "createdAt">) {
  updateClub((state) => {
    state.alerts.push({ ...rule, id: newId(), createdAt: new Date().toISOString() });
  });
}

export function removeAlert(id: string) {
  updateClub((state) => {
    state.alerts = state.alerts.filter((a) => a.id !== id);
  });
}

export function pushNotice(notice: Omit<ClubNotice, "id" | "at">, ruleId: string) {
  updateClub((state) => {
    const day = todayKey();
    if (state.alertFiredOn[ruleId] === day) return;
    state.alertFiredOn[ruleId] = day;
    state.notices.unshift({ ...notice, id: newId(), at: new Date().toISOString() });
    state.notices = state.notices.slice(0, 30);
  });
}

export function openPaper(input: { symbol: string; strategy: string; notionalInr: number; entryUsd: number }) {
  updateClub((state) => {
    if (input.notionalInr <= 0 || input.notionalInr > state.paperCash) return;
    state.paperCash -= input.notionalInr;
    state.positions.push({
      id: newId(),
      symbol: input.symbol,
      strategy: input.strategy,
      notionalInr: input.notionalInr,
      entryUsd: input.entryUsd,
      openedAt: new Date().toISOString(),
    });
  });
}

export function closePaper(id: string, exitUsd: number, stopMoved: boolean) {
  updateClub((state) => {
    const pos = state.positions.find((p) => p.id === id);
    if (!pos || pos.entryUsd <= 0) return;
    const pnlPct = exitUsd / pos.entryUsd - 1;
    const pnlInr = pos.notionalInr * pnlPct;
    state.paperCash += pos.notionalInr + pnlInr;
    state.paperPeak = Math.max(state.paperPeak, state.paperCash);
    state.paperTrades.unshift({
      id: pos.id,
      symbol: pos.symbol,
      strategy: pos.strategy,
      notionalInr: pos.notionalInr,
      entryUsd: pos.entryUsd,
      exitUsd,
      pnlInr,
      pnlPct: pnlPct * 100,
      rr: pnlPct / 0.02,
      stopMoved,
      openedAt: pos.openedAt,
      closedAt: new Date().toISOString(),
    });
    state.positions = state.positions.filter((p) => p.id !== id);
  });
}

export function saveDca(plan: DcaPlan) {
  updateClub((state) => {
    state.dca = plan;
  });
}

export function addPost(channel: CommunityPost["channel"], body: string) {
  updateClub((state) => {
    state.posts.unshift({
      id: newId(),
      channel,
      author: "You",
      body: body.trim(),
      at: new Date().toISOString(),
    });
  });
}

export function submitMission(day: string, text: string) {
  updateClub((state) => {
    state.missions = state.missions.filter((m) => m.day !== day);
    state.missions.push({ day, text: text.trim(), at: new Date().toISOString() });
  });
}

export interface ScoreBreakdown {
  total: number | null;
  risk: number | null;
  discipline: number | null;
  overtrading: number | null;
  consistency: number | null;
}

export function disciplineScore(state: ClubState): ScoreBreakdown {
  const trades = state.paperTrades;
  if (!trades.length && !state.missions.length) {
    return { total: null, risk: null, discipline: null, overtrading: null, consistency: null };
  }
  const moved = trades.filter((t) => t.stopMoved).length;
  const risk = trades.length ? Math.round(100 - (moved / trades.length) * 100) : null;
  const weekAgo = Date.now() - 7 * 86400000;
  const missionsWeek = state.missions.filter((m) => new Date(m.at).getTime() >= weekAgo).length;
  const discipline = Math.min(100, Math.round((missionsWeek / 7) * 100 + (state.alerts.length ? 10 : 0)));
  const tradesWeek = trades.filter((t) => new Date(t.closedAt).getTime() >= weekAgo).length;
  const overtrading = Math.max(0, Math.min(100, 100 - Math.max(0, tradesWeek - 5) * 8));
  const counts = new Map<string, number>();
  for (const t of trades) counts.set(t.strategy, (counts.get(t.strategy) ?? 0) + 1);
  const top = Math.max(0, ...counts.values());
  const consistency = trades.length ? Math.round((top / trades.length) * 100) : null;
  const parts = [risk, discipline, overtrading, consistency].filter((n): n is number => n != null);
  const total = parts.length ? Math.round(parts.reduce((s, n) => s + n, 0) / parts.length) : null;
  return { total, risk, discipline, overtrading, consistency };
}

export function paperStats(state: ClubState, markUsd: Record<string, number>) {
  let openPnl = 0;
  for (const pos of state.positions) {
    const mark = markUsd[pos.symbol];
    if (!mark || pos.entryUsd <= 0) continue;
    openPnl += pos.notionalInr * (mark / pos.entryUsd - 1);
  }
  const equity = state.paperCash + state.positions.reduce((s, p) => s + p.notionalInr, 0) + openPnl;
  const closed = state.paperTrades;
  const wins = closed.filter((t) => t.pnlInr > 0);
  const losses = closed.filter((t) => t.pnlInr <= 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length) : 0;
  const drawdown = state.paperPeak > 0 ? Math.max(0, (state.paperPeak - equity) / state.paperPeak) * 100 : 0;
  return {
    equity,
    openPnl,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    drawdown,
    rr: avgLoss > 0 ? avgWin / avgLoss : null,
    trades: closed.length,
    stopsMoved: closed.filter((t) => t.stopMoved).length,
  };
}

export function funnelCounts(events: FunnelEvent[]) {
  const count = (type: FunnelEvent["type"]) => events.filter((e) => e.type === type).length;
  const now = Date.now();
  const active7 = events.filter((e) => e.type === "active" && now - new Date(e.at).getTime() <= 7 * 86400000).length;
  const active30 = events.filter((e) => e.type === "active" && now - new Date(e.at).getTime() <= 30 * 86400000).length;
  return {
    landing: count("landing"),
    clicks: count("referral_click"),
    accounts: count("account_claim"),
    kyc: count("kyc"),
    deposits: count("deposit"),
    firstTrade: count("first_trade"),
    active7,
    active30,
  };
}
