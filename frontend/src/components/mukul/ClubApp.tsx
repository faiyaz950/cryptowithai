"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchCandles, type Candle } from "@/lib/cryptoApi";
import { countAlert, readRadar, type RadarRead } from "@/lib/mukul/market";
import { loadClub, pushNotice, saveRadarDay, touchActive, useClub } from "@/lib/mukul/store";
import {
  AlertsView,
  AlgoView,
  AnalyzerView,
  BacktestView,
  ClassesView,
  CLUB_VIEWS,
  CommunityView,
  DcaView,
  JournalView,
  LibraryView,
  MissedView,
  MissionView,
  PaperView,
  RadarView,
  RoomView,
  ScoreView,
  VideosView,
  WelcomeView,
  type MarketBag,
} from "@/components/mukul/ClubViews";

const RADAR_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT"];

export default function ClubApp() {
  const club = useClub();
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get("view") || "welcome";
  const [reads, setReads] = useState<RadarRead[]>([]);
  const [candles, setCandles] = useState<Record<string, Candle[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    const settled = await Promise.all(RADAR_SYMBOLS.map(async (symbol) => {
      try {
        const res = await fetchCandles({ symbol, interval: "1h", limit: 160 });
        return { symbol, candles: res.candles };
      } catch {
        return { symbol, candles: [] as Candle[] };
      }
    }));
    const nextCandles = Object.fromEntries(settled.map((row) => [row.symbol, row.candles]));
    const nextReads = settled
      .map((row) => readRadar(row.symbol, row.candles))
      .filter((row): row is RadarRead => Boolean(row));
    setCandles(nextCandles);
    setReads(nextReads);
    setLoading(false);
    if (!nextReads.length) {
      setError("Market data nahi mila. Trading desk ka backend chalu hona chahiye, phir Refresh.");
      return;
    }
    const day = new Date().toISOString().slice(0, 10);
    saveRadarDay(nextReads.map((row) => ({
      day,
      symbol: row.symbol,
      setup: row.setup,
      why: row.why,
      price: row.price,
    })));
    const state = loadClub();
    for (const rule of state.alerts) {
      const read = nextReads.find((row) => row.symbol === rule.symbol);
      if (!read) continue;
      const hit = countAlert(rule, read);
      if (hit.total > 0 && hit.met / hit.total >= 0.8) {
        pushNotice({
          symbol: read.base,
          text: `Mukul Radar Alert — ${read.base} ne aapki selected conditions mein se ${hit.met}/${hit.total} conditions satisfy ki hain.`,
          email: rule.email,
          telegram: rule.telegram,
        }, rule.id);
      }
    }
  }, []);

  const ready = club !== null;
  useEffect(() => {
    if (!ready) return;
    touchActive();
    void reload();
  }, [ready, reload]);

  const open = (next: string, strategy?: string) => {
    const query = new URLSearchParams();
    query.set("view", next);
    if (strategy) query.set("strategy", strategy);
    router.replace(`/club?${query.toString()}`, { scroll: false });
  };

  if (!club) return <div className="mukul-club" />;

  const market: MarketBag = { reads, candles, loading, error, reload };

  let body = <WelcomeView club={club} onOpen={open} />;
  if (!club.membership) {
    body = (
      <div className="mc-panel">
        <h1>Cryptomantra</h1>
        <p>Free access tab khulta hai jab exchange user ID verify ho. Trading desk pehle se khula hai.</p>
        <div className="mc-inline">
          <Link href="/club/join" className="mc-btn mc-btn-primary">Unlock Free Access</Link>
          <Link href="/trade" className="mc-btn">Trading Desk</Link>
        </div>
      </div>
    );
  } else if (view === "videos") body = <VideosView />;
  else if (view === "radar") body = <RadarView market={market} />;
  else if (view === "algo") body = <AlgoView market={market} />;
  else if (view === "alerts") body = <AlertsView club={club} market={market} />;
  else if (view === "analyzer") body = <AnalyzerView market={market} />;
  else if (view === "backtest") body = <BacktestView market={market} preset={params.get("strategy") || undefined} />;
  else if (view === "paper") body = <PaperView club={club} market={market} />;
  else if (view === "room") body = <RoomView market={market} />;
  else if (view === "community") body = <CommunityView club={club} />;
  else if (view === "library") body = <LibraryView onOpen={open} />;
  else if (view === "classes") body = <ClassesView onOpen={open} />;
  else if (view === "dca") body = <DcaView club={club} market={market} />;
  else if (view === "journal") body = <JournalView club={club} market={market} />;
  else if (view === "score") body = <ScoreView club={club} />;
  else if (view === "mission") body = <MissionView club={club} />;
  else if (view === "missed") body = <MissedView club={club} />;

  return (
    <div className="mukul-club">
      <div className="mc-shell">
        <aside className="mc-side" aria-label="Mukul Club">
          <Link href="/" className="mc-brand">
            <img className="mc-avatar" src="/mukul/mukul-face.webp" alt="" width={40} height={40} />
            <span>
              <strong>Cryptomantra</strong>
              <small>by Dr. Mukul Agrawal</small>
            </span>
          </Link>
          <nav>
            {club.membership && CLUB_VIEWS.map((item) => (
              <button key={item.id} type="button" data-active={view === item.id} onClick={() => open(item.id)}>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="mc-side-links">
            <Link href="/trade">Trading Desk</Link>
            <Link href="/club/admin">Admin</Link>
          </div>
        </aside>
        <div className="mc-main">{body}</div>
      </div>
    </div>
  );
}
