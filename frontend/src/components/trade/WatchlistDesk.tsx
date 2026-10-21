"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Pencil, Plus, Search, Star, Trash2, X } from "lucide-react";
import { fetchMarketTickers, fetchSpotTickers } from "@/lib/cryptoApi";
import { isSpotKey, watchKeyLabel } from "@/lib/marketQuote";
import {
  WATCHLISTS_CHANGED,
  addSymbolToWatchlist,
  addSymbolsToWatchlist,
  createWatchlist,
  deleteWatchlist,
  getActiveWatchlist,
  loadWatchlistStore,
  normalizeWatchKey,
  removeSymbolFromWatchlist,
  renameWatchlist,
  setActiveWatchlist,
  type Watchlist,
} from "@/lib/watchlist";

interface Props {
  onPickSymbol: (symbol: string) => void;
}

/** Add-picker ki ek row: Delta perp ya CoinDCX spot, jo bhi exchange par mile. */
interface PairOption {
  key: string;
  label: string;
  base: string;
  venue: "Delta perp" | "CoinDCX spot";
  price: number | null;
  change: number | null;
}

const SUGGESTION_LIMIT = 80;

type VenueFilter = "all" | "perp" | "spot";
const VENUE_FILTERS: { id: VenueFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "perp", label: "Perps" },
  { id: "spot", label: "Spot" },
];

function fmtChange(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

/** Coin ka chhota gol avatar — pehle 1-3 akshar. */
function Coin({ base }: { base: string }) {
  return <span className="wl-coin" aria-hidden>{base.slice(0, base.length > 4 ? 3 : 2)}</span>;
}

function fmtPx(n: number | null): string {
  if (n == null) return "—";
  return n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n >= 1 ? n.toFixed(3) : n.toFixed(6);
}

export default function WatchlistDesk({ onPickSymbol }: Props) {
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [activeId, setActiveId] = useState("");
  const [query, setQuery] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [universe, setUniverse] = useState<PairOption[]>([]);
  const [universeLoading, setUniverseLoading] = useState(true);
  const [venueFilter, setVenueFilter] = useState<VenueFilter>("all");

  const sync = useCallback(() => {
    const store = loadWatchlistStore();
    setLists(store.lists);
    setActiveId(store.activeId);
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener(WATCHLISTS_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(WATCHLISTS_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, [sync]);

  // Exchange ke saare pairs ek baar laate hain — picker mein koi 30-coin ki hadd nahi.
  useEffect(() => {
    let alive = true;
    void Promise.allSettled([fetchMarketTickers(), fetchSpotTickers()]).then(([perps, spots]) => {
      if (!alive) return;
      const out: PairOption[] = [];
      if (perps.status === "fulfilled") {
        for (const t of perps.value) {
          out.push({ key: t.symbol, label: `${t.base}/USD`, base: t.base, venue: "Delta perp", price: t.price, change: t.change_24h });
        }
      }
      if (spots.status === "fulfilled") {
        for (const t of spots.value) {
          out.push({
            key: normalizeWatchKey(`${t.symbol}@coindcx-spot`),
            label: `${t.base}/${t.quote}`,
            base: t.base,
            venue: "CoinDCX spot",
            price: t.price,
            change: t.change_24h,
          });
        }
      }
      setUniverse(out);
      setUniverseLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const quotes = useMemo(() => new Map(universe.map((o) => [o.key, o])), [universe]);

  const active = useMemo(
    () => lists.find((l) => l.id === activeId) ?? lists[0] ?? getActiveWatchlist(),
    [lists, activeId],
  );

  const filteredSymbols = useMemo(() => {
    const q = query.trim().toUpperCase().replace("/", "");
    const syms = active?.symbols ?? [];
    if (!q) return syms;
    return syms.filter(
      (s) => s.includes(q) || watchKeyLabel(s).replace("/", "").toUpperCase().includes(q),
    );
  }, [active, query]);

  const q = addQuery.trim().toUpperCase().replace("/", "");
  const addMatches = useMemo(() => {
    const existing = new Set(active?.symbols ?? []);
    const pool = universe.filter(
      (o) => !existing.has(o.key) && (venueFilter === "all" || (venueFilter === "perp") === (o.venue === "Delta perp")),
    );
    if (!q) return pool;
    return pool.filter(
      (o) => o.key.includes(q) || o.base.toUpperCase().includes(q) || o.label.replace("/", "").toUpperCase().includes(q),
    );
  }, [universe, active, q, venueFilter]);
  const addSuggestions = addMatches.slice(0, SUGGESTION_LIMIT);
  // Jo pair list mein nahi mila use bhi seedha daal sakte hain (naya listing, ya koi aur naam).
  const customKey = q && !universe.some((o) => o.key === q) ? normalizeWatchKey(q) : "";

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2800);
  };

  const onSelectList = (id: string) => {
    setActiveWatchlist(id);
    setActiveId(id);
    setRenaming(false);
  };

  const onCreate = () => {
    const name = newName.trim() || `Watchlist ${lists.length + 1}`;
    const list = createWatchlist(name);
    setCreating(false);
    setNewName("");
    sync();
    flash(`"${list.name}" ban gayi`);
  };

  const onRenameSave = () => {
    if (!active) return;
    renameWatchlist(active.id, renameValue);
    setRenaming(false);
    sync();
  };

  const onDeleteList = () => {
    if (!active || lists.length <= 1) {
      flash("Kam se kam ek watchlist chahiye");
      return;
    }
    if (!window.confirm(`"${active.name}" delete karein?`)) return;
    deleteWatchlist(active.id);
    sync();
    flash("Watchlist delete ho gayi");
  };

  const onAdd = (symbol: string) => {
    if (!active) return;
    const res = addSymbolToWatchlist(active.id, symbol);
    if (!res.ok) {
      flash(res.error || "Add fail");
      return;
    }
    sync();
  };

  const onAddAll = () => {
    if (!active || addMatches.length === 0) return;
    if (addMatches.length > 25 && !window.confirm(`${addMatches.length} pairs "${active.name}" mein add karein?`)) return;
    const { added } = addSymbolsToWatchlist(active.id, addMatches.map((o) => o.key));
    setAddQuery("");
    sync();
    flash(`${added} pairs add ho gaye`);
  };

  const onRemove = (symbol: string) => {
    if (!active) return;
    removeSymbolFromWatchlist(active.id, symbol);
    sync();
  };

  const symbolCount = active?.symbols.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="trade-page-head">
        <div>
          <div className="trade-page-kicker">Your markets</div>
          <h2 className="trade-page-title">Watchlists</h2>
          <p className="trade-page-sub">
            Apne coins ek jagah — Delta perps aur CoinDCX spot, kitne bhi pairs. Pair par click karke chart kholo.
          </p>
        </div>
        <div className="trade-page-actions">
          <button
            type="button"
            className="trade-btn trade-btn-primary"
            onClick={() => {
              setCreating(true);
              setNewName("");
            }}
          >
            <Plus className="w-4 h-4" />
            New list
          </button>
        </div>
      </div>

      <div className="wl-tabs" role="tablist" aria-label="Watchlists">
        {lists.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={l.id === active?.id}
            className="wl-tab"
            data-active={l.id === active?.id}
            onClick={() => onSelectList(l.id)}
          >
            <Star className="w-3.5 h-3.5" />
            {l.name}
            <span className="wl-tab-count tnum">{l.symbols.length}</span>
          </button>
        ))}
        {creating && (
          <span className="wl-create">
            <input
              className="wl-create-input"
              placeholder="List ka naam"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onCreate();
                if (e.key === "Escape") setCreating(false);
              }}
              autoFocus
            />
            <button type="button" className="trade-btn trade-btn-primary trade-size-sm" onClick={onCreate}>
              <Check className="w-3.5 h-3.5" />
              Create
            </button>
            <button type="button" className="trade-btn trade-btn-ghost trade-size-sm" onClick={() => setCreating(false)} aria-label="Cancel">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        )}
      </div>

      {notice && (
        <p className="wl-notice" role="status">
          <Check className="w-3.5 h-3.5" />
          {notice}
        </p>
      )}

      <div className="wl-layout">
        {/* ── Active list ───────────────────────────── */}
        <div className="trade-panel">
          <div className="trade-panel-head wl-head">
            <div className="wl-head-title">
              {renaming ? (
                <>
                  <input
                    className="wl-create-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onRenameSave();
                      if (e.key === "Escape") setRenaming(false);
                    }}
                    autoFocus
                  />
                  <button type="button" className="trade-btn trade-btn-primary trade-size-sm" onClick={onRenameSave}>
                    <Check className="w-3.5 h-3.5" />
                    Save
                  </button>
                  <button type="button" className="trade-btn trade-btn-ghost trade-size-sm" onClick={() => setRenaming(false)} aria-label="Cancel">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="wl-name">{active?.name}</span>
                  <span className="trade-badge trade-badge-neutral tnum">{symbolCount} pairs</span>
                  <button
                    type="button"
                    className="wl-icon-btn"
                    title="Rename"
                    aria-label="Rename list"
                    onClick={() => {
                      setRenameValue(active?.name ?? "");
                      setRenaming(true);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className="wl-icon-btn wl-icon-danger"
                    title="Delete list"
                    aria-label="Delete list"
                    onClick={onDeleteList}
                    disabled={lists.length <= 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
            <label className="trade-search">
              <Search className="w-3.5 h-3.5 flex-none" style={{ color: "var(--text-muted)" }} />
              <input
                className="trade-search-input"
                placeholder="Filter list"
                aria-label="Filter watchlist"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>

          {filteredSymbols.length === 0 ? (
            <div className="trade-empty trade-empty-lg">
              <span className="trade-empty-icon trade-empty-icon-lg">
                <Star className="w-5 h-5" />
              </span>
              <p className="text-[14px] font-semibold mt-1" style={{ color: "var(--text-secondary)" }}>
                {query ? "Filter se kuch nahi mila" : "Is list mein abhi koi pair nahi"}
              </p>
              <p className="max-w-[300px]">{query ? "Doosra naam try karo." : "Side ke panel se pairs search karke + dabao."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto lg:overflow-y-auto lg:max-h-[70vh]">
              <table className="trade-table wl-table">
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th className="trade-num">Price</th>
                    <th className="trade-num">24h</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSymbols.map((sym) => {
                    const quote = quotes.get(sym);
                    const spot = isSpotKey(sym);
                    const label = watchKeyLabel(sym);
                    const change = quote?.change ?? null;
                    return (
                      <tr key={sym}>
                        <td>
                          <button type="button" className="wl-pair-btn" onClick={() => onPickSymbol(sym)} title="Markets mein kholo">
                            <Coin base={label.split("/")[0]} />
                            <span className="wl-pair-text">
                              <span className="wl-pair-name">{label}</span>
                              <span className="wl-pair-sub">{spot ? "CoinDCX spot" : "Delta perpetual"}</span>
                            </span>
                          </button>
                        </td>
                        <td className="trade-num tnum" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                          {fmtPx(quote?.price ?? null)}
                        </td>
                        <td className="trade-num">
                          {change == null ? (
                            <span style={{ color: "var(--text-muted)" }}>—</span>
                          ) : (
                            <span className={`trade-badge ${change >= 0 ? "trade-badge-green" : "trade-badge-red"} tnum`}>
                              {fmtChange(change)}
                            </span>
                          )}
                        </td>
                        <td className="trade-num">
                          <span className="wl-actions">
                            <button type="button" className="wl-icon-btn wl-open" title="Chart kholo" aria-label={`${label} chart kholo`} onClick={() => onPickSymbol(sym)}>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" className="wl-icon-btn wl-icon-danger" title="Hatao" aria-label={`${label} hatao`} onClick={() => onRemove(sym)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Add pairs ─────────────────────────────── */}
        <div className="trade-panel wl-side">
          <div className="trade-panel-head wl-head">
            <span className="trade-panel-title">Add pairs</span>
            <span className="wl-meta">
              {universeLoading ? "Loading…" : `${universe.length} available`}
            </span>
          </div>
          <div className="wl-add-controls">
            <label className="trade-search wl-search-full">
              <Search className="w-3.5 h-3.5 flex-none" style={{ color: "var(--text-muted)" }} />
              <input
                className="trade-search-input"
                style={{ width: "100%" }}
                placeholder="Search BTC, ETH, DOGE, BTCINR…"
                aria-label="Search pairs to add"
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (addSuggestions.length === 1) onAdd(addSuggestions[0].key);
                  else if (customKey && addSuggestions.length === 0) onAdd(customKey);
                }}
              />
            </label>
            <div className="wl-add-row">
              <div className="trade-seg">
                {VENUE_FILTERS.map((f) => (
                  <button key={f.id} type="button" data-active={venueFilter === f.id} onClick={() => setVenueFilter(f.id)} className="trade-seg-btn">
                    {f.label}
                  </button>
                ))}
              </div>
              {addMatches.length > 1 && (
                <button type="button" className="trade-btn trade-btn-ghost trade-size-sm" onClick={onAddAll}>
                  <Plus className="w-3.5 h-3.5" />
                  Add all {addMatches.length}
                </button>
              )}
            </div>
          </div>

          <div className="wl-results">
            {addSuggestions.map((o) => (
              <button key={o.key} type="button" className="wl-result" onClick={() => onAdd(o.key)} title={`${o.venue} · ${o.key}`}>
                <Coin base={o.base} />
                <span className="wl-pair-text">
                  <span className="wl-pair-name">{o.label}</span>
                  <span className="wl-pair-sub">{o.venue === "Delta perp" ? "Perp" : "Spot"} · {fmtPx(o.price)}</span>
                </span>
                <span className="wl-add-chip" aria-hidden>
                  <Plus className="w-3.5 h-3.5" />
                </span>
              </button>
            ))}
            {!universeLoading && addSuggestions.length === 0 && !customKey && (
              <div className="trade-empty trade-empty-md">
                {universe.length === 0
                  ? "Pair list nahi aayi — symbol type karke (jaise SOLUSDT) Enter dabao."
                  : q
                    ? "Koi naya pair nahi mila"
                    : "Is filter ke saare pairs list mein hain"}
              </div>
            )}
            {customKey && addSuggestions.length === 0 && !universeLoading && (
              <button type="button" className="wl-result" onClick={() => onAdd(customKey)}>
                <Coin base={customKey} />
                <span className="wl-pair-text">
                  <span className="wl-pair-name">{customKey}</span>
                  <span className="wl-pair-sub">Jaisa hai waisa add karo</span>
                </span>
                <span className="wl-add-chip" aria-hidden>
                  <Plus className="w-3.5 h-3.5" />
                </span>
              </button>
            )}
            {addMatches.length > SUGGESTION_LIMIT && (
              <p className="wl-more">Pehle {SUGGESTION_LIMIT} dikh rahe hain — naam likhkar chhaant lo.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
