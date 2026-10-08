"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, Search, Star, TrendingDown, TrendingUp, X } from "lucide-react";
import { fetchMarketTickers, fetchSpotTickers, type MarketTicker, type SpotTicker } from "@/lib/cryptoApi";
import { SPOT_VENUE, fmtQuoteCompact, fmtQuoteNum } from "@/lib/marketQuote";
import {
  WATCHLISTS_CHANGED,
  addSymbolToWatchlist,
  getActiveWatchlist,
  removeSymbolFromWatchlist,
} from "@/lib/watchlist";

type Market = "all" | "USD" | "INR" | "BTC" | "USDT" | "USDC" | "ETH" | "TRX";
type Filter = "none" | "watch" | "gainers" | "losers";
type SortKey = "pair" | "vol" | "change";

const MAIN_TABS: { id: Market; label: string }[] = [
  { id: "all", label: "All" },
  { id: "USD", label: "USD" },
  { id: "INR", label: "INR" },
  { id: "BTC", label: "BTC" },
];
const MORE_TABS: Market[] = ["USDT", "USDC", "ETH", "TRX"];

const DELTA_VENUE = "delta";
const REFRESH_MS = 15_000;

interface Row {
  key: string;
  symbol: string;
  venue: string;
  base: string;
  quote: string;
  name: string;
  price: number | null;
  change: number | null;
  high: number | null;
  low: number | null;
  /** Quote currency mein. */
  turnover: number;
  /** Sort ke liye USD mein — alag currencies ko ek line mein rakhne ka tareeka. */
  turnoverUsd: number;
  oi: number | null;
  funding: number | null;
}

function watchKey(symbol: string, venue: string): string {
  return venue === DELTA_VENUE ? symbol : `${symbol}@${venue}`;
}

function fmtFunding(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(4)}%`;
}

function rowTitle(r: Row): string {
  const kind = r.venue === DELTA_VENUE ? "perpetual · Delta" : "spot · CoinDCX";
  const lines = [
    `${r.name} — ${r.base}/${r.quote} ${kind}`,
    `Price ${fmtQuoteNum(r.price, r.quote)} ${r.quote}  ·  24h ${r.change == null ? "—" : `${r.change.toFixed(2)}%`}`,
    `24h High ${fmtQuoteNum(r.high, r.quote)}  ·  Low ${fmtQuoteNum(r.low, r.quote)}`,
    `Volume ${fmtQuoteCompact(r.turnover, r.quote)}`,
  ];
  if (r.venue === DELTA_VENUE) lines.push(`OI ${fmtQuoteCompact(r.oi, "USD")}  ·  Funding ${fmtFunding(r.funding)}`);
  return lines.join("\n");
}

interface RowProps {
  r: Row;
  active: boolean;
  starred: boolean;
  perpTag: boolean;
  onPick: (r: Row) => void;
  onToggleWatch: (key: string) => void;
}

/** Memo — list mein 1000+ rows; ek coin ka price badle to sirf wahi row dobara bane. */
const MarketRow = memo(function MarketRow({ r, active, starred, perpTag, onPick, onToggleWatch }: RowProps) {
  const up = (r.change ?? 0) >= 0;
  return (
    <div
      role="option"
      aria-selected={active}
      tabIndex={0}
      className="cm-ml-row"
      data-active={active}
      title={rowTitle(r)}
      onClick={() => onPick(r)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(r);
        }
      }}
    >
      <button
        type="button"
        className="cm-ml-row-star"
        data-on={starred}
        onClick={(e) => {
          e.stopPropagation();
          onToggleWatch(watchKey(r.symbol, r.venue));
        }}
        aria-label={starred ? `${r.base} watchlist se hatao` : `${r.base} watchlist mein daalo`}
      >
        <Star className="w-3 h-3" />
      </button>
      <div className="cm-ml-row-main">
        <div className="cm-ml-row-pair">
          {r.base}<span>·{r.quote}</span>
          {perpTag && <em className="cm-ml-tag">Perp</em>}
        </div>
        <div className="cm-ml-row-px">
          {fmtQuoteNum(r.price, r.quote)}
          <span>{`Vol ${fmtQuoteCompact(r.turnover, r.quote)}`}</span>
        </div>
      </div>
      <span className="cm-ml-pill" data-up={r.change == null ? undefined : up}>
        {r.change == null ? "—" : `${up ? "+" : ""}${r.change.toFixed(2)}%`}
      </span>
    </div>
  );
});

interface Props {
  symbol: string;
  /** Chart abhi kis venue se chal raha hai — "delta" ya "coindcx-spot". */
  venue: string;
  onSelect: (symbol: string, venue: string) => void;
  /** Chune hue coin ka live price/change — 15s poll se taaza. */
  livePrice?: number | null;
  liveChange?: number | null;
}

export default memo(MarketList);

function MarketList({ symbol, venue, onSelect, livePrice, liveChange }: Props) {
  const [perps, setPerps] = useState<MarketTicker[]>([]);
  const [spots, setSpots] = useState<SpotTicker[]>([]);
  const [failed, setFailed] = useState(false);
  const [market, setMarket] = useState<Market>("all");
  const [filter, setFilter] = useState<Filter>("none");
  const [moreOpen, setMoreOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "vol", dir: -1 });
  const [query, setQuery] = useState("");
  const [watch, setWatch] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const curVenue = venue === SPOT_VENUE ? SPOT_VENUE : DELTA_VENUE;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [p, s] = await Promise.allSettled([fetchMarketTickers(), fetchSpotTickers()]);
      if (!alive) return;
      if (p.status === "fulfilled") setPerps(p.value);
      if (s.status === "fulfilled") setSpots(s.value);
      setFailed(p.status === "rejected" && (s.status === "rejected" || !s.value.length));
    };
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const sync = () => setWatch(getActiveWatchlist().symbols);
    sync();
    window.addEventListener(WATCHLISTS_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WATCHLISTS_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [moreOpen]);

  const toggleWatch = useCallback((key: string) => {
    const list = getActiveWatchlist();
    if (list.symbols.includes(key)) removeSymbolFromWatchlist(list.id, key);
    else addSymbolToWatchlist(list.id, key);
  }, []);

  const usdPer = useMemo(() => {
    const px = (sym: string) => spots.find((s) => s.symbol === sym)?.price ?? null;
    const usdtInr = px("USDTINR");
    return {
      USD: 1, USDT: 1, USDC: 1,
      INR: usdtInr ? 1 / usdtInr : 1 / 88,
      BTC: px("BTCUSDT") ?? perps.find((p) => p.symbol === "BTCUSDT")?.price ?? 0,
      ETH: px("ETHUSDT") ?? perps.find((p) => p.symbol === "ETHUSDT")?.price ?? 0,
      TRX: px("TRXUSDT") ?? 0,
    } as Record<string, number>;
  }, [spots, perps]);

  const baseRows = useMemo<Row[]>(() => {
    const out: Row[] = perps.map((t) => ({
      key: `${DELTA_VENUE}:${t.symbol}`,
      symbol: t.symbol,
      venue: DELTA_VENUE,
      base: t.base,
      quote: "USD",
      name: t.name || t.base,
      price: t.price ?? t.mark_price,
      change: t.change_24h,
      high: t.high_24h,
      low: t.low_24h,
      turnover: t.turnover_usd,
      turnoverUsd: t.turnover_usd,
      oi: t.oi_value_usd,
      funding: t.funding_rate,
    }));
    for (const s of spots) {
      out.push({
        key: `${SPOT_VENUE}:${s.symbol}`,
        symbol: s.symbol,
        venue: SPOT_VENUE,
        base: s.base,
        quote: s.quote,
        name: s.name || s.base,
        price: s.price,
        change: s.change_24h,
        high: s.high_24h,
        low: s.low_24h,
        turnover: s.turnover_quote,
        turnoverUsd: s.turnover_quote * (usdPer[s.quote] ?? 0),
        oi: null,
        funding: null,
      });
    }
    return out;
  }, [perps, spots, usdPer]);

  // Live price sirf chune hue coin ki row badalta hai — baaki row objects wahi
  // rehte hain, to memo wali rows dobara render nahi hotin.
  const rows = useMemo<Row[]>(() => {
    const idx = baseRows.findIndex((r) => r.symbol === symbol && r.venue === curVenue);
    if (idx < 0) {
      const base = symbol.replace(/USDT$|USD$|INR$/, "");
      return [
        {
          key: `${curVenue}:${symbol}`, symbol, venue: curVenue, base, quote: curVenue === SPOT_VENUE ? "" : "USD",
          name: base, price: livePrice ?? null, change: liveChange ?? null, high: null, low: null,
          turnover: 0, turnoverUsd: 0, oi: null, funding: null,
        },
        ...baseRows,
      ];
    }
    if (livePrice == null && liveChange == null) return baseRows;
    const r = baseRows[idx];
    const out = baseRows.slice();
    out[idx] = { ...r, price: livePrice ?? r.price, change: liveChange ?? r.change };
    return out;
  }, [baseRows, symbol, curVenue, livePrice, liveChange]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.quote] = (c[r.quote] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toUpperCase();
    let list = rows;
    if (market !== "all") list = list.filter((r) => r.quote === market);
    if (q) list = list.filter((r) => r.base.includes(q) || r.name.toUpperCase().includes(q) || r.symbol.includes(q));
    if (filter === "watch") list = list.filter((r) => watch.includes(watchKey(r.symbol, r.venue)));
    if (filter === "gainers") return list.filter((r) => (r.change ?? 0) > 0).sort((a, b) => b.change! - a.change!);
    if (filter === "losers") return list.filter((r) => (r.change ?? 0) < 0).sort((a, b) => a.change! - b.change!);
    const { key, dir } = sort;
    return [...list].sort((a, b) => {
      if (key === "pair") return (a.base.localeCompare(b.base) || a.quote.localeCompare(b.quote)) * dir;
      if (key === "change") return ((a.change ?? -Infinity) - (b.change ?? -Infinity)) * dir;
      return (a.turnoverUsd - b.turnoverUsd) * dir;
    });
  }, [rows, market, query, filter, watch, sort]);

  const onSort = (key: SortKey) => {
    if (filter === "gainers" || filter === "losers") setFilter("none");
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "pair" ? 1 : -1 }));
  };

  const sortIcon = (key: SortKey) => {
    if (filter === "gainers" || filter === "losers" || sort.key !== key) return null;
    return sort.dir === 1 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />;
  };

  const watchSet = useMemo(() => new Set(watch), [watch]);
  const cur = rows.find((r) => r.symbol === symbol && r.venue === curVenue) ?? rows[0];
  const curKey = cur ? watchKey(cur.symbol, cur.venue) : "";
  const curWatched = watch.includes(curKey);
  const moreActive = MORE_TABS.includes(market);

  const pick = useCallback(
    (r: Row) => {
      onSelect(r.symbol, r.venue);
      setOpen(false);
    },
    [onSelect],
  );

  return (
    <aside className="cm-ml" data-open={open} aria-label="Markets list">
      {cur && (
        <div className="cm-ml-head">
          <div className="cm-ml-head-text">
            <div className="cm-ml-head-title">Markets</div>
          </div>
          <button
            type="button"
            className="cm-ml-star"
            data-on={curWatched}
            onClick={() => toggleWatch(curKey)}
            aria-pressed={curWatched}
            aria-label={curWatched ? "Watchlist se hatao" : "Watchlist mein daalo"}
            title={curWatched ? "Watchlist se hatao" : "Watchlist mein daalo"}
          >
            <Star className="w-[18px] h-[18px]" />
          </button>
          <button
            type="button"
            className="cm-ml-toggle"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label="Markets list"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      )}

      {cur && (
        <div className="cm-ml-facts">
          {cur.venue === DELTA_VENUE ? (
            <>
              <div>
                <span>Open Interest</span>
                <b>{fmtQuoteCompact(cur.oi, "USD")}</b>
              </div>
              <div>
                <span>Funding</span>
                <b data-up={cur.funding == null ? undefined : cur.funding >= 0}>{fmtFunding(cur.funding)}</b>
              </div>
            </>
          ) : (
            <>
              <div>
                <span>24h High</span>
                <b>{fmtQuoteNum(cur.high, cur.quote)}</b>
              </div>
              <div>
                <span>24h Low</span>
                <b>{fmtQuoteNum(cur.low, cur.quote)}</b>
              </div>
            </>
          )}
        </div>
      )}

      <div className="cm-ml-body">
        <div className="cm-ml-tabs" role="tablist" aria-label="Market">
          {MAIN_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={market === t.id}
              data-active={market === t.id}
              className="cm-ml-tab"
              onClick={() => {
                setMarket(t.id);
                setMoreOpen(false);
              }}
              title={`${counts[t.id] ?? 0} pairs`}
            >
              {t.label}
            </button>
          ))}
          <div className="cm-ml-more" ref={moreRef}>
            <button
              type="button"
              role="tab"
              aria-selected={moreActive}
              data-active={moreActive}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              className="cm-ml-tab"
              onClick={() => setMoreOpen((o) => !o)}
            >
              {moreActive ? market : "More"}
              <ChevronDown className="w-3 h-3" />
            </button>
            {moreOpen && (
              <div className="cm-ml-more-menu" role="menu">
                {MORE_TABS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="menuitemradio"
                    aria-checked={market === m}
                    data-active={market === m}
                    onClick={() => {
                      setMarket(m);
                      setMoreOpen(false);
                    }}
                  >
                    <span>{m}</span>
                    <small>{counts[m] ?? 0}</small>
                    {market === m && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <label className="cm-ml-search">
          <Search className="w-3.5 h-3.5" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={rows.length > 1 ? `Search ${rows.length} pairs` : "Search coins"}
            aria-label="Search coins"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Search saaf karo">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </label>

        <div className="cm-ml-filters">
          <button
            type="button"
            data-on={filter === "watch"}
            onClick={() => setFilter((f) => (f === "watch" ? "none" : "watch"))}
          >
            <Star className="w-3 h-3" /> Watchlist
          </button>
          <button
            type="button"
            data-on={filter === "gainers"}
            data-tone="up"
            onClick={() => setFilter((f) => (f === "gainers" ? "none" : "gainers"))}
          >
            <TrendingUp className="w-3 h-3" /> Gainers
          </button>
          <button
            type="button"
            data-on={filter === "losers"}
            data-tone="down"
            onClick={() => setFilter((f) => (f === "losers" ? "none" : "losers"))}
          >
            <TrendingDown className="w-3 h-3" /> Losers
          </button>
        </div>

        <div className="cm-ml-cols">
          <button type="button" onClick={() => onSort("pair")} data-on={sort.key === "pair"}>
            Pair {sortIcon("pair")}
          </button>
          <button type="button" onClick={() => onSort("vol")} data-on={sort.key === "vol"}>
            Vol {sortIcon("vol")}
          </button>
          <button type="button" onClick={() => onSort("change")} data-on={sort.key === "change"}>
            24h {sortIcon("change")}
          </button>
        </div>

        <div className="cm-ml-list" role="listbox" aria-label="Coins">
          {visible.map((r) => (
            <MarketRow
              key={r.key}
              r={r}
              active={r.symbol === symbol && r.venue === curVenue}
              starred={watchSet.has(watchKey(r.symbol, r.venue))}
              perpTag={r.venue === DELTA_VENUE && market === "all"}
              onPick={pick}
              onToggleWatch={toggleWatch}
            />
          ))}
          {visible.length === 0 && (
            <div className="cm-ml-empty">
              {filter === "watch" && !query
                ? "Watchlist khaali hai — kisi coin ke ★ par click karein."
                : failed && rows.length <= 1
                  ? "Prices load nahi ho paaye."
                  : rows.length <= 1
                    ? "Load ho raha hai…"
                    : "Koi coin nahi mila."}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
