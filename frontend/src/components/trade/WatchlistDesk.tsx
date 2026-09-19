"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { CRYPTO_SYMBOLS, symbolLabel } from "@/lib/cryptoApi";
import {
  WATCHLISTS_CHANGED,
  addSymbolToWatchlist,
  createWatchlist,
  deleteWatchlist,
  getActiveWatchlist,
  loadWatchlistStore,
  removeSymbolFromWatchlist,
  renameWatchlist,
  setActiveWatchlist,
  type Watchlist,
} from "@/lib/watchlist";

interface Props {
  onPickSymbol: (symbol: string) => void;
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

  const active = useMemo(
    () => lists.find((l) => l.id === activeId) ?? lists[0] ?? getActiveWatchlist(),
    [lists, activeId],
  );

  const filteredSymbols = useMemo(() => {
    const q = query.trim().toUpperCase().replace("/", "");
    const syms = active?.symbols ?? [];
    if (!q) return syms;
    return syms.filter(
      (s) => s.includes(q) || symbolLabel(s).replace("/", "").toUpperCase().includes(q),
    );
  }, [active, query]);

  const addSuggestions = useMemo(() => {
    const q = addQuery.trim().toUpperCase().replace("/", "");
    const existing = new Set(active?.symbols ?? []);
    let pool = CRYPTO_SYMBOLS.filter((s) => !existing.has(s.value));
    if (q) {
      pool = pool.filter(
        (s) =>
          s.value.includes(q) || s.label.replace("/", "").toUpperCase().includes(q),
      );
    }
    return pool.slice(0, 8);
  }, [addQuery, active]);

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
    setAddQuery("");
    sync();
  };

  const onRemove = (symbol: string) => {
    if (!active) return;
    removeSymbolFromWatchlist(active.id, symbol);
    sync();
  };

  return (
    <div className="space-y-4">
      <div className="trade-panel">
        <div className="trade-panel-head">
          <span className="trade-panel-title flex items-center gap-2">
            <Star className="w-4 h-4" style={{ color: "var(--accent)" }} />
            Watchlists
          </span>
          <button
            type="button"
            className="trade-btn trade-btn-primary trade-size-sm"
            onClick={() => {
              setCreating(true);
              setNewName("");
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            New list
          </button>
        </div>

        <div className="p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {lists.map((l) => (
              <button
                key={l.id}
                type="button"
                className="trade-seg-btn"
                data-active={l.id === active?.id}
                onClick={() => onSelectList(l.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--tr-line-soft)",
                  background: l.id === active?.id ? "var(--tr-field)" : "transparent",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {l.name}
                <span className="tnum" style={{ color: "var(--text-muted)", marginLeft: 6 }}>
                  {l.symbols.length}
                </span>
              </button>
            ))}
          </div>

          {creating && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="trade-input flex-1 min-w-[160px]"
                placeholder="List ka naam"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onCreate()}
                autoFocus
              />
              <button type="button" className="trade-btn trade-btn-primary trade-size-sm" onClick={onCreate}>
                <Check className="w-3.5 h-3.5" />
                Create
              </button>
              <button
                type="button"
                className="trade-btn trade-size-sm"
                onClick={() => setCreating(false)}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {active && (
            <div className="flex flex-wrap items-center gap-2">
              {renaming ? (
                <>
                  <input
                    className="trade-input flex-1 min-w-[160px]"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onRenameSave()}
                    autoFocus
                  />
                  <button type="button" className="trade-btn trade-btn-primary trade-size-sm" onClick={onRenameSave}>
                    <Check className="w-3.5 h-3.5" />
                    Save
                  </button>
                  <button type="button" className="trade-btn trade-size-sm" onClick={() => setRenaming(false)}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[14px] font-bold">{active.name}</span>
                  <button
                    type="button"
                    className="trade-btn trade-size-sm"
                    title="Rename"
                    onClick={() => {
                      setRenameValue(active.name);
                      setRenaming(true);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className="trade-btn trade-size-sm"
                    title="Delete list"
                    onClick={onDeleteList}
                    disabled={lists.length <= 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          )}

          {notice && (
            <p className="text-[12px]" style={{ color: "var(--accent)" }}>
              {notice}
            </p>
          )}
        </div>
      </div>

      <div className="trade-panel">
        <div className="trade-panel-head">
          <span className="trade-panel-title">Add symbol</span>
        </div>
        <div className="p-3 space-y-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              className="trade-input pl-9"
              placeholder="Search BTC, ETH…"
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
            />
          </div>
          {addSuggestions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {addSuggestions.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className="trade-btn trade-size-sm"
                  onClick={() => onAdd(s.value)}
                >
                  <Plus className="w-3 h-3" />
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              {addQuery ? "Koi naya symbol nahi mila" : "Type karke symbol add karein"}
            </p>
          )}
        </div>
      </div>

      <div className="trade-panel">
        <div className="trade-panel-head">
          <span className="trade-panel-title">
            Symbols
            <span className="tnum trade-badge trade-badge-neutral ml-2">
              {active?.symbols.length ?? 0}
            </span>
          </span>
          <div className="relative w-[180px]">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              className="trade-input pl-8 text-[12px]"
              placeholder="Filter"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="p-3">
          {filteredSymbols.length === 0 ? (
            <div className="trade-empty">
              <span className="trade-empty-icon">
                <Star className="w-4 h-4" />
              </span>
              Is list mein abhi koi symbol nahi — upar se add karein
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSymbols.map((sym) => (
                <div key={sym} className="trade-row">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onPickSymbol(sym)}
                  >
                    <div className="text-[13px] font-bold">{symbolLabel(sym)}</div>
                    <div className="text-[11px] tnum" style={{ color: "var(--text-muted)" }}>
                      {sym} · Markets mein kholo
                    </div>
                  </button>
                  <button
                    type="button"
                    className="trade-btn trade-size-sm flex-none"
                    title="Remove"
                    onClick={() => onRemove(sym)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
