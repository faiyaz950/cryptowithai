"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  BarChart3,
  CandlestickChart,
  CirclePlus,
  Eraser,
  Expand,
  Gauge,
  Minus,
  MoveDiagonal,
  Pencil,
  Shrink,
  Sigma,
  TrendingUp,
  X,
} from "lucide-react";
import { CRYPTO_SYMBOLS, symbolLabel } from "@/lib/cryptoApi";

export type ChartDeskTool = "markets" | "chart" | "indicators" | "drawing" | "compare" | "fullscreen";
export type DrawTool = "cursor" | "hline" | "trend";

interface EmaToggle {
  id: string;
  label: string;
  on: boolean;
  set: (next: boolean) => void;
  color: string;
}

interface Props {
  symbol: string;
  onSymbol: (symbol: string) => void;
  emaToggles: EmaToggle[];
  showVolume: boolean;
  onShowVolume: (next: boolean) => void;
  compareSymbol: string | null;
  onCompareSymbol: (symbol: string | null) => void;
  drawTool: DrawTool;
  onDrawTool: (tool: DrawTool) => void;
  onClearDrawings: () => void;
  fullscreenTargetRef: RefObject<HTMLElement | null>;
}

const TOOLS: { id: ChartDeskTool; label: string; icon: typeof BarChart3 }[] = [
  { id: "markets", label: "Markets", icon: BarChart3 },
  { id: "chart", label: "Chart", icon: CandlestickChart },
  { id: "indicators", label: "Indicators", icon: Sigma },
  { id: "drawing", label: "Drawing", icon: Pencil },
  { id: "compare", label: "Compare", icon: CirclePlus },
  { id: "fullscreen", label: "Fullscreen", icon: Expand },
];

export default function ChartDeskTools({
  symbol,
  onSymbol,
  emaToggles,
  showVolume,
  onShowVolume,
  compareSymbol,
  onCompareSymbol,
  drawTool,
  onDrawTool,
  onClearDrawings,
  fullscreenTargetRef,
}: Props) {
  const [active, setActive] = useState<ChartDeskTool>("chart");
  const [open, setOpen] = useState<Exclude<ChartDeskTool, "chart" | "fullscreen"> | null>(null);
  const [marketQuery, setMarketQuery] = useState("");
  const [isFs, setIsFs] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFs = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const markets = useMemo(() => {
    const q = marketQuery.trim().toUpperCase().replace("/", "");
    if (!q) return CRYPTO_SYMBOLS;
    return CRYPTO_SYMBOLS.filter(
      (s) => s.value.includes(q) || s.label.replace("/", "").includes(q),
    );
  }, [marketQuery]);

  const toggleFullscreen = async () => {
    const el = fullscreenTargetRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setActive("chart");
      } else {
        await el.requestFullscreen();
        setActive("fullscreen");
      }
    } catch {
      /* browser blocked fullscreen */
    }
  };

  const onTool = (id: ChartDeskTool) => {
    if (id === "fullscreen") {
      void toggleFullscreen();
      return;
    }
    if (id === "chart") {
      setActive("chart");
      setOpen(null);
      onDrawTool("cursor");
      return;
    }
    setActive(id);
    setOpen((prev) => (prev === id ? null : id));
    if (id === "drawing") onDrawTool(drawTool === "cursor" ? "hline" : drawTool);
  };

  return (
    <div className="desk-tools" ref={rootRef}>
      <div className="desk-tools-bar" role="toolbar" aria-label="Chart tools">
        {TOOLS.map((t) => {
          const Icon = t.id === "fullscreen" && isFs ? Shrink : t.icon;
          const isActive =
            t.id === "fullscreen" ? isFs :
            open === t.id || (t.id === "chart" && !open && active === "chart");
          return (
            <button
              key={t.id}
              type="button"
              className="desk-tools-btn"
              data-active={isActive}
              onClick={() => onTool(t.id)}
              aria-pressed={isActive}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.id === "fullscreen" && isFs ? "Exit" : t.label}</span>
            </button>
          );
        })}
      </div>

      {open === "markets" && (
        <div className="desk-tools-panel" role="dialog" aria-label="Markets">
          <div className="desk-tools-panel-head">
            <span>Markets</span>
            <button type="button" className="trade-iconbtn trade-iconbtn-sm" onClick={() => setOpen(null)} aria-label="Close">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            className="trade-input"
            value={marketQuery}
            onChange={(e) => setMarketQuery(e.target.value)}
            placeholder="Search pair…"
            aria-label="Search markets"
          />
          <div className="desk-tools-list">
            {markets.map((s) => (
              <button
                key={s.value}
                type="button"
                className="desk-tools-row"
                data-active={symbol === s.value}
                onClick={() => {
                  onSymbol(s.value);
                  setOpen(null);
                  setActive("chart");
                }}
              >
                <span className="font-semibold">{s.label}</span>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.value}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {open === "indicators" && (
        <div className="desk-tools-panel desk-tools-panel-sm" role="dialog" aria-label="Indicators">
          <div className="desk-tools-panel-head">
            <span>Indicators</span>
            <button type="button" className="trade-iconbtn trade-iconbtn-sm" onClick={() => setOpen(null)} aria-label="Close">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-2">
            {emaToggles.map((ema) => (
              <button
                key={ema.id}
                type="button"
                className="desk-tools-row"
                data-active={ema.on}
                onClick={() => ema.set(!ema.on)}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="trade-chip-dot" style={{ background: ema.color, opacity: 1 }} />
                  {ema.label}
                </span>
                <span className="text-[11px] font-bold" style={{ color: ema.on ? "var(--green)" : "var(--text-muted)" }}>
                  {ema.on ? "ON" : "OFF"}
                </span>
              </button>
            ))}
            <button
              type="button"
              className="desk-tools-row"
              data-active={showVolume}
              onClick={() => onShowVolume(!showVolume)}
            >
              <span className="inline-flex items-center gap-2">
                <Gauge className="w-3.5 h-3.5" />
                Volume
              </span>
              <span className="text-[11px] font-bold" style={{ color: showVolume ? "var(--green)" : "var(--text-muted)" }}>
                {showVolume ? "ON" : "OFF"}
              </span>
            </button>
          </div>
        </div>
      )}

      {open === "drawing" && (
        <div className="desk-tools-panel desk-tools-panel-sm" role="dialog" aria-label="Drawing tools">
          <div className="desk-tools-panel-head">
            <span>Drawing</span>
            <button type="button" className="trade-iconbtn trade-iconbtn-sm" onClick={() => setOpen(null)} aria-label="Close">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="desk-draw-grid">
            <button type="button" data-active={drawTool === "cursor"} onClick={() => onDrawTool("cursor")} className="desk-draw-tool">
              <TrendingUp className="w-4 h-4" />
              Cursor
            </button>
            <button type="button" data-active={drawTool === "hline"} onClick={() => onDrawTool("hline")} className="desk-draw-tool">
              <Minus className="w-4 h-4" />
              H-Line
            </button>
            <button type="button" data-active={drawTool === "trend"} onClick={() => onDrawTool("trend")} className="desk-draw-tool">
              <MoveDiagonal className="w-4 h-4" />
              Trend
            </button>
            <button type="button" onClick={onClearDrawings} className="desk-draw-tool">
              <Eraser className="w-4 h-4" />
              Clear
            </button>
          </div>
          <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
            H-Line: chart pe click. Trend: do points click karo.
          </p>
        </div>
      )}

      {open === "compare" && (
        <div className="desk-tools-panel" role="dialog" aria-label="Compare">
          <div className="desk-tools-panel-head">
            <span>Compare</span>
            <button type="button" className="trade-iconbtn trade-iconbtn-sm" onClick={() => setOpen(null)} aria-label="Close">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {compareSymbol && (
            <button
              type="button"
              className="desk-tools-row mb-2"
              data-active
              onClick={() => onCompareSymbol(null)}
            >
              <span>Remove {symbolLabel(compareSymbol)}</span>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="desk-tools-list">
            {CRYPTO_SYMBOLS.filter((s) => s.value !== symbol).map((s) => (
              <button
                key={s.value}
                type="button"
                className="desk-tools-row"
                data-active={compareSymbol === s.value}
                onClick={() => {
                  onCompareSymbol(s.value);
                  setOpen(null);
                  setActive("chart");
                }}
              >
                <span className="font-semibold">{s.label}</span>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Overlay %</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
