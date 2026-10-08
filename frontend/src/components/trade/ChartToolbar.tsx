"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, Plus, RotateCcw, Search, Settings2, Star, Trash2, X } from "lucide-react";
import { CHART_TIMEFRAMES, CHART_TYPES, tfShort, type ChartType } from "@/lib/chartTypes";
import {
  INDICATORS,
  INDICATOR_BY_ID,
  VOLUME_ID,
  defaultParams,
  indicatorTitle,
  outputColor,
  type ActiveIndicator,
  type IndicatorCategory,
} from "@/lib/chartIndicators";

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/**
 * Chart panel `overflow: hidden` hai — absolute menu neeche se kat jaata.
 * Fixed position button ke neeche, aur jitni screen bachi utni hi height.
 */
function useFixedMenu(open: boolean, anchor: RefObject<HTMLElement | null>, width: number) {
  const [style, setStyle] = useState<CSSProperties>({});
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const top = r.bottom + 6;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setStyle({ position: "fixed", top, left, maxHeight: Math.max(200, window.innerHeight - top - 12) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchor, width]);
  return style;
}

// ── Timeframe ────────────────────────────────────────────

export function TimeframeMenu({
  value,
  available,
  favorites,
  onChange,
  onFavorites,
}: {
  value: string;
  available: string[];
  favorites: string[];
  onChange: (tf: string) => void;
  onFavorites: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const menuStyle = useFixedMenu(open, ref, 248);

  const frames = CHART_TIMEFRAMES.filter((t) => available.includes(t.value));
  const order = (tf: string) => CHART_TIMEFRAMES.findIndex((t) => t.value === tf);
  const quick = frames.filter((t) => favorites.includes(t.value)).map((t) => t.value);
  // Chuna hua timeframe favourite na ho tab bhi toolbar par dikhe.
  if (!quick.includes(value) && available.includes(value)) quick.push(value);
  quick.sort((a, b) => order(a) - order(b));

  const groups = (["Minutes", "Hours", "Days"] as const)
    .map((g) => ({ name: g, items: frames.filter((t) => t.group === g) }))
    .filter((g) => g.items.length);

  const toggleFav = (tf: string) => {
    onFavorites(favorites.includes(tf) ? favorites.filter((f) => f !== tf) : [...favorites, tf]);
  };

  return (
    <div className="cm-tf" ref={ref}>
      <div className="cm-tf-quick" role="group" aria-label="Timeframe">
        {quick.map((tf) => (
          <button
            key={tf}
            type="button"
            className="cm-tf-btn"
            data-active={tf === value}
            onClick={() => onChange(tf)}
            title={CHART_TIMEFRAMES.find((t) => t.value === tf)?.label}
          >
            {tfShort(tf)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="cm-tb-iconbtn"
        data-open={open}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="All timeframes"
        title="All timeframes"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="cm-menu cm-tf-menu" role="menu" style={menuStyle}>
          {groups.map((g) => (
            <div key={g.name} className="cm-menu-group">
              <button
                type="button"
                className="cm-menu-head"
                onClick={() => setCollapsed((c) => ({ ...c, [g.name]: !c[g.name] }))}
                aria-expanded={!collapsed[g.name]}
              >
                <span>{g.name}</span>
                {collapsed[g.name] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              </button>
              {!collapsed[g.name] &&
                g.items.map((t) => {
                  const fav = favorites.includes(t.value);
                  return (
                    <div key={t.value} className="cm-menu-row" data-active={t.value === value}>
                      <button
                        type="button"
                        className="cm-menu-row-main"
                        role="menuitemradio"
                        aria-checked={t.value === value}
                        onClick={() => {
                          onChange(t.value);
                          setOpen(false);
                        }}
                      >
                        {t.label}
                      </button>
                      <button
                        type="button"
                        className="cm-star"
                        data-on={fav}
                        aria-pressed={fav}
                        aria-label={fav ? `${t.label} favourites se hatao` : `${t.label} favourite karo`}
                        title={fav ? "Remove from favorites" : "Add to favorites"}
                        onClick={() => toggleFav(t.value)}
                      >
                        <Star className="w-4 h-4" fill={fav ? "currentColor" : "none"} />
                      </button>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Chart type ───────────────────────────────────────────

function TypeSvg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 28 28" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export function ChartTypeIcon({ type }: { type: ChartType }) {
  switch (type) {
    case "bars":
      return <TypeSvg><path d="M9 6v16M6 9h3M9 18h3M19 4v18M16 8h3M19 15h3" /></TypeSvg>;
    case "hlc":
      return <TypeSvg><path d="M9 6v16M9 18h3M19 4v18M19 15h3" /></TypeSvg>;
    case "hollow":
      return <TypeSvg><path d="M10 4v4M10 20v4M18 6v3M18 19v3" /><rect x="7" y="8" width="6" height="12" rx="1" /><rect x="15" y="9" width="6" height="10" rx="1" /></TypeSvg>;
    case "volume":
      return <TypeSvg><path d="M9 5v3M9 20v3M19 7v4M19 18v3" /><rect x="5" y="8" width="8" height="12" rx="1" fill="currentColor" fillOpacity=".35" /><rect x="17" y="11" width="4" height="7" rx="1" fill="currentColor" fillOpacity=".35" /></TypeSvg>;
    case "heikin":
      return <TypeSvg><path d="M9 4v4M9 20v4M19 6v3M19 19v3" /><rect x="6" y="8" width="6" height="12" rx="1" fill="currentColor" fillOpacity=".35" /><rect x="16" y="9" width="6" height="10" rx="1" /><path d="M16 14h6" /></TypeSvg>;
    case "line":
      return <TypeSvg><path d="M4 20l6-7 5 4 9-11" /></TypeSvg>;
    case "linemarkers":
      return <TypeSvg><path d="M4 20l6-7 5 4 9-11" /><circle cx="10" cy="13" r="1.8" fill="currentColor" /><circle cx="15" cy="17" r="1.8" fill="currentColor" /><circle cx="24" cy="6" r="1.8" fill="currentColor" /></TypeSvg>;
    case "step":
      return <TypeSvg><path d="M4 20h5v-7h6v4h5V7h4" /></TypeSvg>;
    case "area":
      return <TypeSvg><path d="M4 20l6-7 5 4 9-11v18H4z" fill="currentColor" fillOpacity=".25" /><path d="M4 20l6-7 5 4 9-11" /></TypeSvg>;
    case "hlcarea":
      return <TypeSvg><path d="M4 14l6-6 5 3 9-7" /><path d="M4 22l6-6 5 3 9-7" /><path d="M4 18l6-6 5 3 9-7" strokeDasharray="2 2" /></TypeSvg>;
    case "baseline":
      return <TypeSvg><path d="M3 15h22" strokeDasharray="2 2" /><path d="M4 18l5-8 5 3 4 6 6-12" /></TypeSvg>;
    case "columns":
      return <TypeSvg><path d="M6 22V12M11 22V8M16 22V14M21 22V6" strokeWidth="3" /></TypeSvg>;
    case "highlow":
      return <TypeSvg><rect x="6" y="6" width="5" height="14" rx="1" /><rect x="17" y="9" width="5" height="12" rx="1" /></TypeSvg>;
    case "candles":
    default:
      return <TypeSvg><path d="M9 4v4M9 20v4M19 6v3M19 19v3" /><rect x="6" y="8" width="6" height="12" rx="1" fill="currentColor" fillOpacity=".35" /><rect x="16" y="9" width="6" height="10" rx="1" /></TypeSvg>;
  }
}

export function ChartTypeMenu({ value, onChange }: { value: ChartType; onChange: (t: ChartType) => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const menuStyle = useFixedMenu(open, ref, 240);
  const current = CHART_TYPES.find((t) => t.id === value);
  return (
    <div className="cm-type" ref={ref}>
      <button
        type="button"
        className="cm-tb-iconbtn cm-tb-iconbtn-lg"
        data-open={open}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Chart type: ${current?.label ?? value}`}
        title={current?.label}
        onClick={() => setOpen((o) => !o)}
      >
        <ChartTypeIcon type={value} />
      </button>
      {open && (
        <div className="cm-menu cm-type-menu" role="menu" style={menuStyle}>
          {CHART_TYPES.map((t, i) => (
            <div key={t.id}>
              {i > 0 && CHART_TYPES[i - 1].group !== t.group && <div className="cm-menu-sep" />}
              <button
                type="button"
                role="menuitemradio"
                aria-checked={t.id === value}
                className="cm-menu-row cm-menu-row-main cm-type-row"
                data-active={t.id === value}
                onClick={() => {
                  onChange(t.id);
                  setOpen(false);
                }}
              >
                <ChartTypeIcon type={t.id} />
                <span>{t.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Indicators ───────────────────────────────────────────

export function IndicatorsButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button type="button" className="cm-tb-btn" onClick={onClick} title="Indicators ( / )" aria-label="Indicators">
      <span className="cm-fx" aria-hidden>
        <i>f</i>
        <sub>x</sub>
      </span>
      <span className="cm-tb-btn-label">Indicators</span>
      {count > 0 && <span className="cm-tb-count">{count}</span>}
    </button>
  );
}

const CATEGORIES: ("All" | IndicatorCategory)[] = [
  "All",
  "Moving Averages",
  "Bands & Channels",
  "Trend",
  "Momentum",
  "Volatility",
  "Volume",
  "Price",
];

export type IndicatorDialogState = null | { mode: "list" } | { mode: "edit"; uid: string };

let uidSeq = 0;
function newUid(id: string) {
  uidSeq += 1;
  return `${id}-${Date.now().toString(36)}-${uidSeq}`;
}

export function IndicatorsDialog({
  state,
  onState,
  indicators,
  onIndicators,
  showVolume,
  onShowVolume,
}: {
  state: IndicatorDialogState;
  onState: (s: IndicatorDialogState) => void;
  indicators: ActiveIndicator[];
  onIndicators: (next: ActiveIndicator[]) => void;
  showVolume: boolean;
  onShowVolume: (next: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const [flash, setFlash] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const open = state != null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onState(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onState]);

  useEffect(() => {
    if (state?.mode === "list") window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [state?.mode]);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1400);
    return () => window.clearTimeout(t);
  }, [flash]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = [
      { id: VOLUME_ID, name: "Volume", short: "Vol", category: "Volume" as IndicatorCategory, pane: false },
      ...INDICATORS.map((d) => ({ id: d.id, name: d.name, short: d.short, category: d.category, pane: d.pane })),
    ];
    return rows
      .filter((r) => cat === "All" || r.category === cat)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.short.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [query, cat]);

  if (!open) return null;

  const add = (id: string) => {
    if (id === VOLUME_ID) {
      onShowVolume(!showVolume);
      setFlash(showVolume ? "Volume hata diya" : "Volume add hua");
      return;
    }
    const def = INDICATOR_BY_ID.get(id);
    if (!def) return;
    onIndicators([...indicators, { uid: newUid(id), id, params: defaultParams(def) }]);
    setFlash(`${def.name} add hua`);
  };

  const patch = (uid: string, next: Partial<ActiveIndicator>) =>
    onIndicators(indicators.map((i) => (i.uid === uid ? { ...i, ...next } : i)));
  const remove = (uid: string) => onIndicators(indicators.filter((i) => i.uid !== uid));

  const editing = state.mode === "edit" ? indicators.find((i) => i.uid === state.uid) : undefined;
  const editDef = editing ? INDICATOR_BY_ID.get(editing.id) : undefined;

  return (
    <div className="cm-dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onState(null)}>
      <div className="cm-dialog" role="dialog" aria-modal="true" aria-label="Indicators">
        <div className="cm-dialog-head">
          <h2>{editing && editDef ? editDef.name : "Indicators"}</h2>
          <button type="button" className="cm-dialog-x" onClick={() => onState(null)} aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {editing && editDef ? (
          <div className="cm-dialog-body cm-edit">
            <div className="cm-edit-outputs">
              {editDef.outputs.map((o, i) => (
                <span key={o.key} className="cm-edit-swatch">
                  <span style={{ background: outputColor(editing, i, indicators) }} />
                  {o.label}
                </span>
              ))}
            </div>
            {editDef.params.length === 0 ? (
              <p className="cm-muted">Is indicator ki koi setting nahi hai.</p>
            ) : (
              <div className="cm-edit-grid">
                {editDef.params.map((p) => (
                  <label key={p.key} className="cm-edit-field">
                    <span>{p.label}</span>
                    <input
                      type="number"
                      className="trade-input"
                      min={p.min}
                      max={p.max}
                      step={p.step ?? 1}
                      value={editing.params[p.key] ?? p.def}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        if (!Number.isFinite(raw)) return;
                        const v = Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, raw));
                        patch(editing.uid, { params: { ...editing.params, [p.key]: p.step ? v : Math.round(v) } });
                      }}
                    />
                  </label>
                ))}
              </div>
            )}
            <div className="cm-edit-actions">
              <button type="button" className="trade-btn trade-btn-ghost trade-size-sm" onClick={() => patch(editing.uid, { params: defaultParams(editDef) })}>
                <RotateCcw className="w-3.5 h-3.5" /> Defaults
              </button>
              <button type="button" className="trade-btn trade-btn-ghost trade-size-sm cm-danger" onClick={() => { remove(editing.uid); onState({ mode: "list" }); }}>
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
              <span className="flex-1" />
              <button type="button" className="trade-btn trade-btn-ghost trade-size-sm" onClick={() => onState({ mode: "list" })}>
                All indicators
              </button>
              <button type="button" className="trade-btn trade-btn-primary trade-size-sm" onClick={() => onState(null)}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="cm-dialog-search">
              <Search className="w-4 h-4" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                aria-label="Search indicators"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="cm-dialog-cats" role="tablist" aria-label="Indicator category">
              {CATEGORIES.map((c) => (
                <button key={c} type="button" role="tab" aria-selected={cat === c} data-active={cat === c} onClick={() => setCat(c)}>
                  {c}
                </button>
              ))}
            </div>
            <div className="cm-dialog-body">
              {(indicators.length > 0 || showVolume) && !query && cat === "All" && (
                <div className="cm-dialog-section">
                  <div className="cm-dialog-label">On chart</div>
                  {showVolume && (
                    <div className="cm-active-row">
                      <span className="cm-active-dot" style={{ background: "#64748b" }} />
                      <span className="cm-active-name">Volume</span>
                      <span className="flex-1" />
                      <button type="button" className="cm-act" onClick={() => onShowVolume(false)} aria-label="Remove Volume" title="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {indicators.map((ind) => (
                    <div key={ind.uid} className="cm-active-row" data-hidden={ind.hidden || undefined}>
                      <span className="cm-active-dot" style={{ background: outputColor(ind, 0, indicators) }} />
                      <span className="cm-active-name">{indicatorTitle(ind)}</span>
                      <span className="cm-active-sub">{INDICATOR_BY_ID.get(ind.id)?.name}</span>
                      <span className="flex-1" />
                      <button type="button" className="cm-act" onClick={() => patch(ind.uid, { hidden: !ind.hidden })} aria-label={ind.hidden ? "Show" : "Hide"} title={ind.hidden ? "Show" : "Hide"}>
                        {ind.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button type="button" className="cm-act" onClick={() => onState({ mode: "edit", uid: ind.uid })} aria-label="Settings" title="Settings">
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" className="cm-act" onClick={() => remove(ind.uid)} aria-label="Remove" title="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="cm-dialog-label">Script name</div>
              {list.length === 0 && <p className="cm-muted">“{query}” se koi indicator nahi mila.</p>}
              {list.map((r) => {
                const count = r.id === VOLUME_ID ? (showVolume ? 1 : 0) : indicators.filter((i) => i.id === r.id).length;
                return (
                  <button key={r.id} type="button" className="cm-script-row" onClick={() => add(r.id)}>
                    <span className="cm-script-name">{r.name}</span>
                    <span className="cm-script-tag">{r.pane ? "Pane" : "Overlay"}</span>
                    {count > 0 && <span className="cm-script-count">{r.id === VOLUME_ID ? "On" : count}</span>}
                    <Plus className="w-4 h-4 cm-script-plus" />
                  </button>
                );
              })}
            </div>
            {flash && <div className="cm-dialog-flash" role="status">{flash}</div>}
          </>
        )}
      </div>
    </div>
  );
}
