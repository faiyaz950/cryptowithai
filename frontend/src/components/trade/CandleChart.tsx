"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  LineType,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { Eye, EyeOff, Pencil, Settings2, Trash2, X } from "lucide-react";
import { DESK_TZ, DESK_TZ_LABEL, DESK_VENUE_SHORT, type Candle } from "@/lib/cryptoApi";
import { subscribeLiveCandles, type LiveBar, type LiveStatus } from "@/lib/deltaLive";
import { DRAW_COLORS, DRAW_WIDTHS, DrawingsPrimitive, useChartDrawings, type DrawTool } from "@/lib/chartDrawings";
import type { ChartType } from "@/lib/chartTypes";
import {
  INDICATOR_BY_ID,
  barMinutesOf,
  computeIndicator,
  indicatorTitle,
  outputColor,
  type ActiveIndicator,
  type IndicatorDef,
  type IndicatorOutput,
  type Num,
} from "@/lib/chartIndicators";

/** Delta timestamps UTC hote hain; axis/tooltip desk ke timezone mein dikhao. */
const CHART_TZ = DESK_TZ;

function timeToDate(time: Time): Date {
  if (typeof time === "number") return new Date(time * 1000);
  if (typeof time === "string") return new Date(time);
  return new Date(Date.UTC(time.year, time.month - 1, time.day));
}

function istParts(date: Date, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("en-GB", { timeZone: CHART_TZ, hour12: false, ...options }).formatToParts(date);
}

function part(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((p) => p.type === type)?.value ?? "";
}

function formatCrosshairTime(time: Time): string {
  const parts = istParts(timeToDate(time), {
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${part(parts, "day")} ${part(parts, "month")} '${part(parts, "year")} ${part(parts, "hour")}:${part(parts, "minute")}`;
}

function formatTick(time: Time, tickMarkType: TickMarkType): string {
  const date = timeToDate(time);
  if (tickMarkType === TickMarkType.Year) {
    return part(istParts(date, { year: "numeric" }), "year");
  }
  if (tickMarkType === TickMarkType.Month) {
    return part(istParts(date, { month: "short" }), "month");
  }
  if (tickMarkType === TickMarkType.DayOfMonth) {
    const parts = istParts(date, { day: "2-digit", month: "short" });
    return `${part(parts, "day")} ${part(parts, "month")}`;
  }
  const parts = istParts(date, { hour: "2-digit", minute: "2-digit" });
  return `${part(parts, "hour")}:${part(parts, "minute")}`;
}

/** Price scale par draw hone wali ek line — `key` candle ka field hai (jaise `ema_21`). */
export interface ChartLine {
  key: string;
  color: string;
}

interface Props {
  candles: Candle[];
  symbol?: string;
  interval?: string;
  /** Chart kis exchange ka hai — legend mein dikhta hai. */
  venue?: string;
  showEma9?: boolean;
  showEma21?: boolean;
  showEma50?: boolean;
  showVolume?: boolean;
  /** Diya ho to fixed EMA 9/21/50 ki jagah yahi lines draw hongi. */
  overlays?: ChartLine[];
  compareCandles?: Candle[];
  compareLabel?: string;
  drawTool?: DrawTool;
  /** Ek drawing poori hone par chart tool wapas cursor par kar deta hai. */
  onDrawToolChange?: (tool: DrawTool) => void;
  /** Drawings isi naam se save hoti hain (har coin ki alag). Na ho to drawing band. */
  drawingsKey?: string;
  clearDrawingsKey?: number;
  /**
   * Kis dataset ki candles hain (symbol + timeframe + history). Ye badle tabhi
   * chart poora fit hota hai; wahi dataset refresh ho to user ka zoom/scroll
   * jaisa tha waisa rehta hai. Na diya ho to symbol + interval se banta hai.
   */
  viewKey?: string;
  /**
   * Delta ka live feed. Diya ho to aakhri candle har trade par badalti hai aur
   * interval poora hote hi nayi candle apne aap banti hai — Delta ki site jaisa.
   * Ye usi symbol/timeframe ka hona chahiye jiski `candles` abhi chart par hain.
   */
  live?: { symbol: string; interval: string };
  onLiveBar?: (bar: LiveBar) => void;
  onLiveStatus?: (status: LiveStatus) => void;
  /**
   * User baayein kinare ke paas hai — parent purani candles jod de.
   * Chart view khud shift karta hai, isliye data aane par jump nahi hota.
   */
  onReachHistory?: () => void;
  /** Candles, bars, line, area… Default candles. */
  chartType?: ChartType;
  /**
   * Browser mein compute hone wale indicators. Diye hon to server ki EMA
   * lines (`showEma*` / `overlays`) draw nahi hoti.
   */
  indicators?: ActiveIndicator[];
  onIndicatorToggle?: (uid: string) => void;
  onIndicatorSettings?: (uid: string) => void;
  onIndicatorRemove?: (uid: string) => void;
}

interface Readout {
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
}

const DRAW_HINTS: Record<Exclude<DrawTool, "cursor">, string> = {
  trend: "Trend line: kheencho, ya do jagah click karo · Esc = band",
  ray: "Ray: shuru ka point, phir disha — aage tak badhti hai · Esc = band",
  hline: "Horizontal line: price par click karo",
  vline: "Vertical line: time par click karo",
  rect: "Rectangle: ek kone se doosre kone tak kheencho",
  fib: "Fib retracement: swing ke ek sire se doosre tak kheencho",
  fibext: "Fib extension: A se B tak kheencho (move), phir C (pullback) par click karo",
  brush: "Brush: daba kar chalao · Esc = band",
  text: "Text: jahan likhna hai wahan click karo",
};

const UP = "#00e676";
const DOWN = "#ff5252";

const EMA_KEY = /^ema_(\d+)$/;

type EmaState = Map<string, { barTime: number; prev: number; lastClose: number }>;

type Ohlc = { time: number; open: number; high: number; low: number; close: number; volume?: number };

/** Main series ka live state — Heikin Ashi ko pichhli HA candle chahiye, volume candles ko average. */
interface MainState {
  type: ChartType;
  haPrev: { open: number; close: number } | null;
  haLast: { open: number; close: number } | null;
  lastTime: number | null;
  avgVol: number;
}

interface MainRefs {
  series: ISeriesApi<SeriesType>;
  /** HLC area ki high/low lines. */
  extras: ISeriesApi<"Line">[];
  state: MainState;
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function heikin(k: Ohlc, prev: { open: number; close: number } | null) {
  const close = (k.open + k.high + k.low + k.close) / 4;
  const open = prev ? (prev.open + prev.close) / 2 : (k.open + k.close) / 2;
  return { open, high: Math.max(k.high, open, close), low: Math.min(k.low, open, close), close };
}

/** Ek candle ko chart type ke data point mein badlo. Heikin Ashi ka state caller sambhalta hai. */
function mainPoint(type: ChartType, k: Ohlc, st: MainState) {
  const time = toUnix(k.time);
  const up = k.close >= k.open;
  switch (type) {
    case "heikin":
      return { time, ...heikin(k, st.haPrev) };
    case "volume": {
      const a = st.avgVol > 0 ? Math.min(1, Math.max(0.25, 0.2 + 0.45 * ((k.volume ?? 0) / st.avgVol))) : 1;
      const col = rgba(up ? UP : DOWN, a);
      return { time, open: k.open, high: k.high, low: k.low, close: k.close, color: col, borderColor: col, wickColor: col };
    }
    case "highlow": {
      const col = up ? UP : DOWN;
      return { time, open: k.high, high: k.high, low: k.low, close: k.low, color: rgba(col, 0.55), borderColor: col, wickColor: col };
    }
    case "columns":
      return { time, value: k.close, color: rgba(up ? UP : DOWN, 0.6) };
    case "candles":
    case "hollow":
    case "bars":
    case "hlc":
      return { time, open: k.open, high: k.high, low: k.low, close: k.close };
    default:
      return { time, value: k.close };
  }
}

function setMainData(main: MainRefs, bars: Ohlc[]) {
  const st = main.state;
  st.haPrev = null;
  st.haLast = null;
  const recent = bars.slice(-50);
  st.avgVol = recent.length ? recent.reduce((s, b) => s + (b.volume ?? 0), 0) / recent.length : 0;
  const points = bars.map((b) => {
    if (st.type === "heikin") st.haPrev = st.haLast;
    const p = mainPoint(st.type, b, st);
    if (st.type === "heikin") st.haLast = { open: (p as { open: number }).open, close: (p as { close: number }).close };
    return p;
  });
  st.lastTime = bars.length ? bars[bars.length - 1].time : null;
  // setData generic series par union type nahi leta.
  (main.series as ISeriesApi<"Line">).setData(points as never);
  const [hi, lo] = main.extras;
  if (hi && lo) {
    hi.setData(bars.map((b) => ({ time: toUnix(b.time), value: b.high })));
    lo.setData(bars.map((b) => ({ time: toUnix(b.time), value: b.low })));
  }
}

function updateMain(main: MainRefs, bar: Ohlc) {
  const st = main.state;
  if (st.type === "heikin" && (st.lastTime == null || bar.time > st.lastTime)) st.haPrev = st.haLast;
  st.lastTime = st.lastTime == null ? bar.time : Math.max(st.lastTime, bar.time);
  const p = mainPoint(st.type, bar, st);
  if (st.type === "heikin") st.haLast = { open: (p as { open: number }).open, close: (p as { close: number }).close };
  (main.series as ISeriesApi<"Line">).update(p as never);
  const [hi, lo] = main.extras;
  if (hi && lo) {
    hi.update({ time: toUnix(bar.time), value: bar.high });
    lo.update({ time: toUnix(bar.time), value: bar.low });
  }
}

const MAIN_COMMON = {
  priceLineColor: "#94a3b8",
  priceLineStyle: LineStyle.Dotted,
  priceLineWidth: 1 as const,
};
const LINE_BLUE = "#19a2dd";

function createMain(chart: IChartApi, type: ChartType, closesInView: () => { lo: number; hi: number } | null): MainRefs {
  const state: MainState = { type, haPrev: null, haLast: null, lastTime: null, avgVol: 0 };
  const candleColors = { upColor: UP, downColor: DOWN, borderUpColor: UP, borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN };
  let series: ISeriesApi<SeriesType>;
  const extras: ISeriesApi<"Line">[] = [];
  switch (type) {
    case "hollow":
      series = chart.addCandlestickSeries({ ...MAIN_COMMON, ...candleColors, upColor: "rgba(0, 0, 0, 0)" });
      break;
    case "highlow":
      series = chart.addCandlestickSeries({ ...MAIN_COMMON, ...candleColors, wickVisible: false });
      break;
    case "bars":
      series = chart.addBarSeries({ ...MAIN_COMMON, upColor: UP, downColor: DOWN, thinBars: false });
      break;
    case "hlc":
      series = chart.addBarSeries({ ...MAIN_COMMON, upColor: UP, downColor: DOWN, thinBars: false, openVisible: false });
      break;
    case "line":
      series = chart.addLineSeries({ ...MAIN_COMMON, color: LINE_BLUE, lineWidth: 2 });
      break;
    case "linemarkers":
      series = chart.addLineSeries({ ...MAIN_COMMON, color: LINE_BLUE, lineWidth: 2, pointMarkersVisible: true, pointMarkersRadius: 2.5 });
      break;
    case "step":
      series = chart.addLineSeries({ ...MAIN_COMMON, color: LINE_BLUE, lineWidth: 2, lineType: LineType.WithSteps });
      break;
    case "area":
      series = chart.addAreaSeries({
        ...MAIN_COMMON,
        lineColor: LINE_BLUE,
        topColor: "rgba(25, 162, 221, 0.38)",
        bottomColor: "rgba(25, 162, 221, 0.02)",
        lineWidth: 2,
      });
      break;
    case "hlcarea":
      extras.push(
        chart.addLineSeries({ color: rgba(UP, 0.8), lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
        chart.addLineSeries({ color: rgba(DOWN, 0.8), lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
      );
      series = chart.addAreaSeries({
        ...MAIN_COMMON,
        lineColor: "#cbd5e1",
        topColor: "rgba(148, 163, 184, 0.22)",
        bottomColor: "rgba(148, 163, 184, 0.02)",
        lineWidth: 2,
      });
      break;
    case "baseline":
      series = chart.addBaselineSeries({
        ...MAIN_COMMON,
        baseValue: { type: "price", price: 0 },
        topLineColor: UP,
        topFillColor1: "rgba(0, 230, 118, 0.28)",
        topFillColor2: "rgba(0, 230, 118, 0.04)",
        bottomLineColor: DOWN,
        bottomFillColor1: "rgba(255, 82, 82, 0.04)",
        bottomFillColor2: "rgba(255, 82, 82, 0.28)",
        lineWidth: 2,
      });
      break;
    case "columns":
      // Histogram 0 se khada hota hai — scale sirf dikh rahe closes par, warna
      // poori price range 0 tak khinch jaati.
      series = chart.addHistogramSeries({
        ...MAIN_COMMON,
        autoscaleInfoProvider: () => {
          const r = closesInView();
          if (!r) return null;
          const pad = (r.hi - r.lo) * 0.06 || r.hi * 0.01;
          return { priceRange: { minValue: r.lo - pad, maxValue: r.hi + pad } };
        },
      });
      break;
    case "candles":
    case "heikin":
    case "volume":
    default:
      series = chart.addCandlestickSeries({ ...MAIN_COMMON, ...candleColors });
      break;
  }
  return { series, extras, state };
}

function removeMain(chart: IChartApi, main: MainRefs | null) {
  if (!main) return;
  for (const s of [main.series, ...main.extras]) {
    try {
      chart.removeSeries(s);
    } catch {
      /* already gone */
    }
  }
}

function histColor(o: IndicatorOutput, v: number, prev: Num): string {
  const good = o.histMode === "rise" ? prev == null || v >= prev : v >= 0;
  return good ? "rgba(34, 197, 94, 0.7)" : "rgba(239, 68, 68, 0.7)";
}

function indicatorPoints(o: IndicatorOutput, values: Num[], candles: Candle[]) {
  return candles.map((c, i) => {
    const time = toUnix(c.time);
    const v = values[i];
    if (v == null || !Number.isFinite(v)) return { time };
    return o.type === "histogram" ? { time, value: v, color: histColor(o, v, values[i - 1] ?? null) } : { time, value: v };
  });
}

function createIndicatorSeries(chart: IChartApi, def: IndicatorDef, uid: string, colors: string[]) {
  const scaleId = def.pane ? `pane-${uid}` : "right";
  const bounds = def.bounds;
  const autoscale = bounds ? { autoscaleInfoProvider: () => ({ priceRange: { minValue: bounds[0], maxValue: bounds[1] } }) } : {};
  const series: ISeriesApi<"Line" | "Histogram">[] = def.outputs.map((o, i) =>
    o.type === "histogram"
      ? chart.addHistogramSeries({
          priceScaleId: scaleId,
          color: colors[i],
          lastValueVisible: false,
          priceLineVisible: false,
          ...autoscale,
        })
      : chart.addLineSeries({
          priceScaleId: scaleId,
          color: colors[i],
          lineWidth: o.width ?? 1,
          lineStyle: o.dashed ? LineStyle.Dashed : LineStyle.Solid,
          lineVisible: o.type !== "dots",
          pointMarkersVisible: o.type === "dots",
          pointMarkersRadius: 1.6,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: o.type !== "dots",
          ...autoscale,
        }),
  );
  if (series[0]) {
    for (const level of def.levels ?? []) {
      series[0].createPriceLine({
        price: level,
        color: "rgba(148, 163, 184, 0.4)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
    }
  }
  return series;
}

function fmtInd(v: Num | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

interface IndEntry {
  sig: string;
  series: ISeriesApi<"Line" | "Histogram">[];
  /** Kis candles array + params par aakhri baar poora setData hua. */
  dataFor: { candles: Candle[] | null; params: string; len: number; first: number | null };
}

/**
 * Price ke neeche indicator panes. Lightweight-charts v4 mein asli panes nahi,
 * isliye har pane apne price scale par hai aur scaleMargins se apni patti mein.
 */
function paneLayout(paneCount: number) {
  const mainFrac = paneCount ? Math.max(0.4, 1 - paneCount * 0.2) : 1;
  const paneH = paneCount ? (1 - mainFrac) / paneCount : 0;
  return { mainFrac, paneH };
}

/**
 * Ek live candle chart par lagao. `update()` aakhri candle badalta hai ya nayi
 * jodta hai, aur setData() ki tarah zoom/scroll nahi chhedta.
 */
function paintLiveBar(
  bar: LiveBar,
  main: MainRefs,
  volume: ISeriesApi<"Histogram"> | null,
  lines: Map<string, ISeriesApi<"Line">>,
  emaState: EmaState,
  showVolume: boolean,
) {
  const time = toUnix(bar.time);
  updateMain(main, bar);
  if (showVolume && volume) {
    volume.update({
      time,
      value: bar.volume,
      color: bar.close >= bar.open ? "rgba(0, 230, 118, 0.32)" : "rgba(255, 82, 82, 0.28)",
    });
  }
  for (const [key, line] of lines) {
    const match = EMA_KEY.exec(key);
    const state = emaState.get(key);
    if (!match || !state) continue;
    const alpha = 2 / (Number(match[1]) + 1);
    if (bar.time > state.barTime) {
      // Pichhli candle band ho gayi — uska aakhri EMA hi nayi candle ka base.
      state.prev = alpha * state.lastClose + (1 - alpha) * state.prev;
      state.barTime = bar.time;
    }
    state.lastClose = bar.close;
    line.update({ time, value: alpha * bar.close + (1 - alpha) * state.prev });
  }
}

/** Ek baar mein itni candles tak hi tail update; zyada badli to poora setData. */
const TAIL_MAX = 30;

/**
 * Naya data purane ka hi aage badha roop hai (shuru same, beech same, bas aakhir
 * mein candles badli/judi)? To `next` ka wo index jahan se update karna hai, warna -1.
 * `prev` mein aakhri live candle bhi ho sakti hai jo poll mein abhi nahi aayi.
 */
function tailStart(prev: Ohlc[], next: Ohlc[]): number {
  if (prev.length < 2 || !next.length || prev[0].time !== next[0].time) return -1;
  const lastPrev = prev[prev.length - 1].time;
  let lo = 0;
  let hi = next.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (next[mid].time < lastPrev) lo = mid + 1;
    else hi = mid;
  }
  if (lo !== prev.length - 1 || next.length - lo > TAIL_MAX) return -1;
  if (lo > 0 && next[lo - 1].time !== prev[lo - 1].time) return -1;
  return lo;
}

function toUnix(timeMs: number): UTCTimestamp {
  return Math.floor(timeMs / 1000) as UTCTimestamp;
}

/**
 * Overlay field (EMA, RSI, …). `null` ko `Number(null) === 0` mat banao —
 * warna chhoti history (1D + 7d) par EMA price 0 par draw hoti hai aur
 * scale 0 se poori price tak khul jaati hai.
 */
function finiteField(row: object, key: string): number | null {
  const raw = (row as Record<string, unknown>)[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pctSeries(candles: Candle[]): { time: UTCTimestamp; value: number }[] {
  const valid = candles.filter((c) => c.close && c.time).sort((a, b) => a.time - b.time);
  const base = valid[0]?.close;
  if (!base) return [];
  return valid.map((c) => ({
    time: toUnix(c.time),
    value: ((c.close - base) / base) * 100,
  }));
}

/** Reset / naya symbol: poori history fit karne se candles resha ho jaati hain.
 *  Aakhri ~150 bars, readable spacing, price usi window pe scale. */
const RESET_BARS = 150;

function showLatest(chart: IChartApi, count: number) {
  chart.priceScale("right").applyOptions({ autoScale: true });
  const ts = chart.timeScale();
  ts.applyOptions({ barSpacing: 8, rightOffset: 4 });
  if (count <= 1) {
    ts.fitContent();
    return;
  }
  const span = Math.min(RESET_BARS, count);
  const to = count - 1 + 4;
  ts.setVisibleLogicalRange({ from: to - span, to });
}

function ChartNavButton({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string[];
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="trade-chart-nav-btn" aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
      <span className="trade-chart-nav-tip" role="tooltip">
        {label}
        {shortcut && (
          <span className="trade-chart-nav-keys">
            {shortcut.map((k, i) => (
              <span key={k}>
                {i > 0 && <span className="trade-chart-nav-plus">+</span>}
                <kbd>{k}</kbd>
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

export default function CandleChart({
  candles,
  symbol,
  interval,
  venue = DESK_VENUE_SHORT,
  showEma9 = true,
  showEma21 = true,
  showEma50 = true,
  showVolume = true,
  overlays,
  compareCandles,
  compareLabel,
  drawTool = "cursor",
  onDrawToolChange,
  drawingsKey,
  clearDrawingsKey = 0,
  viewKey,
  live,
  onLiveBar,
  onLiveStatus,
  onReachHistory,
  chartType = "candles",
  indicators,
  onIndicatorToggle,
  onIndicatorSettings,
  onIndicatorRemove,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  /** Chart abhi kis dataset ka hai — isi se tay hota hai fit karna hai ya view bachana. */
  const viewKeyRef = useRef<string | null>(null);
  /** Pichhli setData ki bar count — user aakhri candle par hai ya nahi, ye isi se pata chalta hai. */
  const barCountRef = useRef(0);
  /** Pichhli baar kaunsa candles array draw hua tha. */
  const lastCandlesRef = useRef<Candle[] | null>(null);
  /** Chart par aakhri candle ka time (ms). null = abhi history load nahi hui. */
  const lastBarTimeRef = useRef<number | null>(null);
  /** Feed se aayi sabse taaza candle — poll ka purana data use peeche na khiskaye. */
  const liveBarRef = useRef<LiveBar | null>(null);
  /**
   * EMA line har key ke liye: `prev` = live candle se pehle wali band candle ka
   * EMA. Live candle ka EMA = α·close + (1−α)·prev — backend jaisa hi formula,
   * bas aakhri point browser mein.
   */
  const emaStateRef = useRef(new Map<string, { barTime: number; prev: number; lastClose: number }>());
  const showVolumeRef = useRef(showVolume);
  const onLiveBarRef = useRef(onLiveBar);
  const onLiveStatusRef = useRef(onLiveStatus);
  const onReachHistoryRef = useRef(onReachHistory);
  /** Pehli candle ka time (ms) — history judi/hati to view langar se bachao. */
  const firstBarTimeRef = useRef<number | null>(null);
  /** Pichhli baar data kis symbol/lines/type ke saath laga — wahi ho to sirf tail update. */
  const dataSigRef = useRef("");
  /** Data lag raha hai — is beech ki range-events history load trigger na karein. */
  const applyingRef = useRef(false);
  /** Crosshair kis candle par hai — wahi candle ho to React re-render nahi. */
  const hoverIdxRef = useRef<number | undefined>(undefined);
  const [liveView, setLiveView] = useState<{ key: string; bar: LiveBar } | null>(null);
  /** Indicators ke liye live candle — har tick nahi, ~1s mein ek baar (poori history par compute hota hai). */
  const [indLive, setIndLive] = useState<{ key: string; bar: LiveBar } | null>(null);
  const mainRef = useRef<MainRefs | null>(null);
  /** Chart par jo OHLC hai (valid, sorted) — crosshair readout aur columns ke autoscale ke liye. */
  const mainBarsRef = useRef<Ohlc[]>([]);
  const barIndexRef = useRef(new Map<number, number>());
  const chartTypeRef = useRef(chartType);
  const indSeries = useRef(new Map<string, IndEntry>());
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [axisH, setAxisH] = useState(28);
  const volumeSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  const compareSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const lineSeries = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const [readout, setReadout] = useState<Readout | null>(null);
  const [drawPrim] = useState(() => new DrawingsPrimitive(mainBarsRef));
  const drawings = useChartDrawings({
    primitive: drawPrim,
    hostRef: wrapRef,
    tool: drawTool,
    onToolChange: onDrawToolChange,
    storageKey: drawingsKey ?? null,
    clearKey: clearDrawingsKey,
  });
  const hasIndicatorsRef = useRef(false);

  /** Live candle ko readout/autoscale wale arrays mein bhi rakho. */
  const trackLiveBar = (bar: LiveBar) => {
    const arr = mainBarsRef.current;
    const t = toUnix(bar.time) as number;
    const o: Ohlc = { time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume };
    const idx = barIndexRef.current.get(t);
    if (idx != null) {
      arr[idx] = o;
    } else if (!arr.length || bar.time > arr[arr.length - 1].time) {
      barIndexRef.current.set(t, arr.length);
      arr.push(o);
    }
  };

  const lines = useMemo<ChartLine[]>(() => {
    if (indicators) return [];
    if (overlays) return overlays;
    return [
      { key: "ema_9", color: "#60a5fa", on: showEma9 },
      { key: "ema_21", color: "#fbbf24", on: showEma21 },
      { key: "ema_50", color: "#c084fc", on: showEma50 },
    ]
      .filter((l) => l.on)
      .map(({ key, color }) => ({ key, color }));
  }, [indicators, overlays, showEma9, showEma21, showEma50]);

  const lineSig = lines.map((l) => `${l.key}:${l.color}`).join("|");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const series = lineSeries.current;
    const indEntries = indSeries.current;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#0a0e14" },
        textColor: "#64748b",
        fontSize: 11,
        fontFamily: "Inter, system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "#121821" },
        horzLines: { color: "#121821" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#475569", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#00e676" },
        horzLine: { color: "#475569", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#00e676" },
      },
      rightPriceScale: {
        borderColor: "#1a2230",
        scaleMargins: { top: 0.06, bottom: 0.18 },
        entireTextOnly: true,
      },
      leftPriceScale: {
        visible: false,
        borderColor: "#1a2230",
      },
      localization: {
        timeFormatter: formatCrosshairTime,
      },
      timeScale: {
        borderColor: "#1a2230",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 8,
        tickMarkFormatter: formatTick,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    volumeSeries.current = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
      borderVisible: false,
    });

    compareSeries.current = chart.addLineSeries({
      color: "#38bdf8",
      lineWidth: 2,
      priceScaleId: "compare",
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
      title: "Compare",
    });
    chart.priceScale("compare").applyOptions({
      visible: false,
      scaleMargins: { top: 0.1, bottom: 0.3 },
    });

    chartRef.current = chart;
    chart.subscribeCrosshairMove((param) => {
      // Readout asal OHLC se — Heikin Ashi / line par series ka data asli candle nahi hota.
      const t = typeof param.time === "number" ? param.time : null;
      const idx = t == null ? undefined : barIndexRef.current.get(t);
      // Mouse ek hi candle ke andar hil raha hai — legend wahi rehta hai. Live
      // candle (aakhri) har baar padho, uske numbers tick ke saath badalte hain.
      if (idx === hoverIdxRef.current && (idx == null || idx < mainBarsRef.current.length - 1)) return;
      hoverIdxRef.current = idx;
      const bar = idx == null ? undefined : mainBarsRef.current[idx];
      setHoverTime(bar ? t : null);
      if (!bar || bar.open == null) {
        setReadout(null);
        return;
      }
      setReadout({
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        change: bar.open ? ((bar.close - bar.open) / bar.open) * 100 : 0,
      });
    });

    const onRange = () => {
      const range = chart.timeScale().getVisibleLogicalRange();
      if (!range || barCountRef.current < 10 || applyingRef.current) return;
      if (range.from < 48) onReachHistoryRef.current?.();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    const observer = new ResizeObserver(() => {
      if (!wrapRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: wrapRef.current.clientWidth,
        height: wrapRef.current.clientHeight,
      });
      const h = chartRef.current.timeScale().height();
      if (h > 0) setAxisH(h);
    });
    observer.observe(el);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      indEntries.clear();
      volumeSeries.current = null;
      compareSeries.current = null;
      series.clear();
    };
  }, []);

  /*
   * Main series chart type ke hisaab se. Type badle to purani hata kar nayi —
   * data niche wala effect daalta hai (chartType uski deps mein hai), aur
   * H-lines nayi series par dobara lagti hain.
   */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chartTypeRef.current = chartType;
    removeMain(chart, mainRef.current);
    const main = createMain(chart, chartType, () => {
      const bars = mainBarsRef.current;
      const r = chart.timeScale().getVisibleLogicalRange();
      if (!r || !bars.length) return null;
      const a = Math.max(0, Math.floor(r.from));
      const b = Math.min(bars.length - 1, Math.ceil(r.to));
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = a; i <= b; i++) {
        lo = Math.min(lo, bars[i].close);
        hi = Math.max(hi, bars[i].close);
      }
      return Number.isFinite(lo) ? { lo, hi } : null;
    });
    mainRef.current = main;
    main.series.attachPrimitive(drawPrim);
    // Nayi series data ke bina hai — data effect ko dobara poora setData karna hai.
    lastCandlesRef.current = null;
  }, [chartType, drawPrim]);

  useEffect(() => {
    // Drawing ke beech chart khiske nahi; crosshair Normal hi, taaki point
    // wahin bane jahan crosshair dikh raha hai.
    chartRef.current?.applyOptions({
      handleScroll: {
        mouseWheel: drawTool === "cursor",
        pressedMouseMove: drawTool === "cursor",
      },
    });
  }, [drawTool]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const wanted = new Map(lines.map((l) => [l.key, l.color]));
    for (const [key, series] of lineSeries.current) {
      if (wanted.get(key) !== undefined) continue;
      chart.removeSeries(series);
      lineSeries.current.delete(key);
    }
    for (const [key, color] of wanted) {
      const existing = lineSeries.current.get(key);
      if (existing) {
        existing.applyOptions({ color });
        continue;
      }
      lineSeries.current.set(
        key,
        chart.addLineSeries({
          color,
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        }),
      );
    }
  }, [lines, lineSig]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main || !candles.length) return;

    const timeScale = chartRef.current?.timeScale();
    const key = viewKey ?? `${symbol ?? ""}|${interval ?? ""}`;
    // Naya dataset tabhi jab key ke saath candles bhi badli hon. Symbol dropdown
    // badalte hi key badal jaati hai par candles abhi purani hoti hain — us waqt
    // fit karne se purane chart par zoom reset ho jaata, aur nayi candles aane
    // par wo "refresh" maani jaati.
    const candlesChanged = lastCandlesRef.current !== candles;
    lastCandlesRef.current = candles;
    const isNewView = candlesChanged && viewKeyRef.current !== key;

    // Refresh se pehle user kahan dekh raha tha. Time range (bar index nahi)
    // isliye ki har poll par sabse purani candle hat-ti hai aur nayi judti hai —
    // index wala range har minute ek candle aage khisak jaata.
    const prevLogical = isNewView ? null : timeScale?.getVisibleLogicalRange() ?? null;
    const prevTimeRange = isNewView ? null : timeScale?.getVisibleRange() ?? null;
    const prevBarCount = barCountRef.current;
    const followingLive = prevLogical == null || prevLogical.to >= prevBarCount - 2;

    const valid = candles
      .filter((c) => c.open && c.high && c.low && c.close)
      .sort((a, b) => a.time - b.time);

    const ohlc: Ohlc[] = valid.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));

    // Purani view ka "langar": left kinare wali candle ka time. Data aage-peeche
    // khiske (history judi / hati) to bhi wahi candle wahin rahe — zoom same.
    const prevBars = mainBarsRef.current;
    const anchorIdx = prevLogical && prevBars.length
      ? Math.min(prevBars.length - 1, Math.max(0, Math.round(prevLogical.from)))
      : -1;
    const anchorTime = anchorIdx >= 0 ? prevBars[anchorIdx].time : null;

    const sig = `${key}|${lineSig}|${showVolume}|${chartType}`;
    const tailFrom = !isNewView && dataSigRef.current === sig ? tailStart(prevBars, ohlc) : -1;
    dataSigRef.current = sig;
    applyingRef.current = true;

    if (tailFrom >= 0) {
      // Poll: sirf aakhri kuch candles badli. update() zoom/scroll ko haath nahi
      // lagata aur hazaron candles dobara draw nahi karta — chart jhatka nahi khata.
      const volume = showVolume ? volumeSeries.current : null;
      for (let i = tailFrom; i < ohlc.length; i++) {
        const bar = ohlc[i];
        if (main.state.lastTime != null && bar.time < main.state.lastTime) continue;
        const time = toUnix(bar.time);
        updateMain(main, bar);
        volume?.update({
          time,
          value: bar.volume ?? 0,
          color: bar.close >= bar.open ? "rgba(0, 230, 118, 0.32)" : "rgba(255, 82, 82, 0.28)",
        });
        for (const [lineKey, series] of lineSeries.current) {
          const value = finiteField(valid[i], lineKey);
          if (value != null) series.update({ time, value });
        }
      }
    } else {
      setMainData(main, ohlc);
      if (showVolume) {
        volumeSeries.current?.setData(
          valid.map((c) => ({
            time: toUnix(c.time),
            value: c.volume ?? 0,
            color: c.close >= c.open ? "rgba(0, 230, 118, 0.32)" : "rgba(255, 82, 82, 0.28)",
          })),
        );
        volumeSeries.current?.applyOptions({ visible: true });
      } else {
        volumeSeries.current?.setData([]);
        volumeSeries.current?.applyOptions({ visible: false });
      }
      for (const [lineKey, series] of lineSeries.current) {
        series.setData(
          valid.flatMap((c) => {
            const value = finiteField(c, lineKey);
            return value == null ? [] : [{ time: toUnix(c.time), value }];
          }),
        );
      }
    }

    mainBarsRef.current = ohlc;
    barIndexRef.current = new Map(ohlc.map((b, i) => [toUnix(b.time) as number, i]));
    hoverIdxRef.current = undefined;
    if (main.state.type === "baseline" && ohlc.length && tailFrom < 0) {
      // Base wahan jahan reset view shuru hota hai — upar hara, neeche laal.
      const ref = ohlc[Math.max(0, ohlc.length - RESET_BARS)].close;
      main.series.applyOptions({ baseValue: { type: "price", price: ref } });
    }

    const firstTime = ohlc.length ? ohlc[0].time : null;
    const prevFirst = firstBarTimeRef.current;
    const historyShifted = prevFirst != null && firstTime != null && firstTime !== prevFirst;
    firstBarTimeRef.current = firstTime;
    barCountRef.current = ohlc.length;

    // Live feed ke liye base: har EMA line ka "aakhri se pehle wali candle" ka value.
    const sorted = valid;
    const lastBar = sorted[sorted.length - 1];
    const beforeLast = sorted[sorted.length - 2];
    emaStateRef.current.clear();
    if (lastBar && beforeLast) {
      for (const key of lineSeries.current.keys()) {
        const prev = finiteField(beforeLast, key);
        if (prev != null && EMA_KEY.test(key)) {
          emaStateRef.current.set(key, { barTime: lastBar.time, prev, lastClose: lastBar.close });
        }
      }
    }
    lastBarTimeRef.current = lastBar?.time ?? null;

    // Poll ka data live feed se kuch second purana ho sakta hai — bani hui candle
    // peeche na jaaye, isliye taaza live candle dobara lagao.
    const liveBar = liveBarRef.current;
    if (liveBar && lastBar && liveBar.time >= lastBar.time) {
      paintLiveBar(liveBar, main, volumeSeries.current, lineSeries.current, emaStateRef.current, showVolume);
      trackLiveBar(liveBar);
      if (liveBar.time > lastBar.time) barCountRef.current = ohlc.length + 1;
      lastBarTimeRef.current = liveBar.time;
    }

    /*
     * Pehle yahan har baar fitContent() chalta tha. Markets page har kuch
     * second mein naya data laata hai, to user zoom karta, poll aata aur chart
     * wapas poora zoom-out ho jaata — scroll karke purani candle dekh raha ho
     * to wo bhi seedha aakhri candle par kood jaata.
     *
     * Ab: naya dataset (symbol/timeframe badla) -> aakhri ~150 candles,
     * readable zoom. Wahi dataset refresh
     * hua aur user aakhri candle dekh raha tha -> jitna zoom aur aakhri candle
     * ke right mein jitni khaali jagah thi, wahi rakho; nayi candle aaye to view
     * ek candle aage chale. User pichhe history dekh raha tha -> wahi jagah.
     *
     * Live edge par pehle scrollToRealTime() tha. Wo right ki khaali jagah hata
     * kar aakhri candle ko edge se chipka deta tha, to har 10s ke poll par chart
     * thoda khisak jaata tha — "jaisa chhoda tha waisa" nahi rehta tha.
     *
     * Tail update (poll) par view ko chhoona hi nahi — update() khud sahi rakhta hai.
     */
    const chart = chartRef.current;
    const keepAnchor = () => {
      const idx = anchorTime == null ? undefined : barIndexRef.current.get(toUnix(anchorTime));
      if (prevLogical && idx != null) {
        const shift = idx - anchorIdx;
        timeScale?.setVisibleLogicalRange({ from: prevLogical.from + shift, to: prevLogical.to + shift });
      } else if (prevTimeRange) {
        timeScale?.setVisibleRange(prevTimeRange);
      }
    };
    if (isNewView && chart) {
      viewKeyRef.current = key;
      showLatest(chart, barCountRef.current);
    } else if (tailFrom >= 0) {
      /* view jaisa tha waisa */
    } else if (historyShifted && prevLogical) {
      keepAnchor();
    } else if (followingLive && prevLogical) {
      const width = prevLogical.to - prevLogical.from;
      const rightGap = prevLogical.to - (prevBarCount - 1);
      const to = barCountRef.current - 1 + rightGap;
      timeScale?.setVisibleLogicalRange({ from: to - width, to });
    } else if (followingLive) {
      timeScale?.scrollToRealTime();
    } else {
      keepAnchor();
    }
    // History-load ki range-events data lagne ke beech aati hain (purani index par) —
    // unhe agla page maangne ka signal na samjho; view set hone ke baad hi suno.
    const release = requestAnimationFrame(() => {
      applyingRef.current = false;
    });
    const h = chart?.timeScale().height();
    if (h && h > 0) setAxisH(h);
    return () => cancelAnimationFrame(release);
  }, [candles, lineSig, showVolume, viewKey, symbol, interval, chartType]);

  // Callbacks aur toggles ref mein — inke badalne par socket dobara nahi kholna.
  useEffect(() => {
    onLiveBarRef.current = onLiveBar;
    onLiveStatusRef.current = onLiveStatus;
    onReachHistoryRef.current = onReachHistory;
    showVolumeRef.current = showVolume;
    hasIndicatorsRef.current = Boolean(indicators?.length);
  });

  const liveSymbol = live?.symbol;
  const liveInterval = live?.interval;

  useEffect(() => {
    if (!liveSymbol || !liveInterval) return;
    const key = `${liveSymbol}|${liveInterval}`;
    liveBarRef.current = null;
    let pending: LiveBar | null = null;

    let indPending: LiveBar | null = null;
    const onBar = (bar: LiveBar) => {
      const main = mainRef.current;
      const lastTime = lastBarTimeRef.current;
      // History abhi aayi nahi, ya ye tick chart ki aakhri candle se purana hai.
      if (!main || lastTime == null || bar.time < lastTime) return;
      if (bar.time > lastTime) barCountRef.current += 1;
      liveBarRef.current = bar;
      paintLiveBar(bar, main, volumeSeries.current, lineSeries.current, emaStateRef.current, showVolumeRef.current);
      trackLiveBar(bar);
      lastBarTimeRef.current = bar.time;
      pending = bar;
      indPending = bar;
      onLiveBarRef.current?.(bar);
    };

    let stop = () => {};
    const start = () => {
      stop();
      stop = subscribeLiveCandles(liveSymbol, liveInterval, onBar, (status) => onLiveStatusRef.current?.(status));
    };
    // Tab chhupi ho to socket band — wapas aane par page poori history laata hai
    // aur feed phir se jud jaati hai.
    const onVisibility = () => {
      if (document.hidden) {
        stop();
        stop = () => {};
      } else {
        start();
      }
    };

    // Legend ke numbers ko har tick par React re-render nahi chahiye — chart
    // khud turant badalta hai, legend 4 baar/second kaafi hai.
    const flush = window.setInterval(() => {
      if (!pending) return;
      const bar = pending;
      pending = null;
      setLiveView({ key, bar });
    }, 250);
    const indFlush = window.setInterval(() => {
      if (!indPending || !hasIndicatorsRef.current) return;
      const bar = indPending;
      indPending = null;
      setIndLive({ key, bar });
    }, 1000);

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(flush);
      window.clearInterval(indFlush);
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [liveSymbol, liveInterval]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = compareSeries.current;
    if (!chart || !series) return;

    if (!compareCandles?.length) {
      series.setData([]);
      chart.priceScale("compare").applyOptions({ visible: false });
      series.applyOptions({ title: "Compare" });
      return;
    }

    series.setData(pctSeries(compareCandles));
    series.applyOptions({ title: compareLabel ? `${compareLabel} %` : "Compare %" });
    chart.priceScale("compare").applyOptions({ visible: true });
  }, [compareCandles, compareLabel]);

  const liveKey = liveSymbol && liveInterval ? `${liveSymbol}|${liveInterval}` : null;

  // ── Indicators ─────────────────────────────────────────

  const sortedCandles = useMemo(
    () => candles.filter((c) => c.open && c.high && c.low && c.close).sort((a, b) => a.time - b.time),
    [candles],
  );

  const indLiveBar = indLive && indLive.key === liveKey ? indLive.bar : null;
  const indCandles = useMemo(() => {
    const lastC = sortedCandles[sortedCandles.length - 1];
    if (!indLiveBar || !lastC || indLiveBar.time < lastC.time) return sortedCandles;
    const bar: Candle = {
      time: indLiveBar.time,
      open: indLiveBar.open,
      high: indLiveBar.high,
      low: indLiveBar.low,
      close: indLiveBar.close,
      volume: indLiveBar.volume,
    };
    return indLiveBar.time === lastC.time ? [...sortedCandles.slice(0, -1), bar] : [...sortedCandles, bar];
  }, [sortedCandles, indLiveBar]);

  const indData = useMemo(() => {
    if (!indicators?.length) return [];
    const ctx = { barMinutes: barMinutesOf(indCandles) };
    return indicators.map((ind) => ({ ind, values: computeIndicator(ind, indCandles, ctx) }));
  }, [indicators, indCandles]);

  const paneUids = useMemo(
    () => (indicators ?? []).filter((i) => INDICATOR_BY_ID.get(i.id)?.pane).map((i) => i.uid),
    [indicators],
  );
  const paneSig = paneUids.join("|");
  const { mainFrac, paneH } = paneLayout(paneUids.length);

  // Series banao / hatao. Data neeche wala effect daalta hai.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const list = indicators ?? [];
    const keep = new Set<string>();
    for (const ind of list) {
      const def = INDICATOR_BY_ID.get(ind.id);
      if (!def) continue;
      keep.add(ind.uid);
      const colors = def.outputs.map((_, i) => outputColor(ind, i, list));
      // chartType sig mein: main series dobara bane to indicators uske upar dobara bane.
      const sig = `${chartType}|${def.id}|${colors.join(",")}`;
      let entry = indSeries.current.get(ind.uid);
      if (entry && entry.sig !== sig) {
        for (const s of entry.series) {
          try {
            chart.removeSeries(s);
          } catch {
            /* already gone */
          }
        }
        indSeries.current.delete(ind.uid);
        entry = undefined;
      }
      if (!entry) {
        entry = { sig, series: createIndicatorSeries(chart, def, ind.uid, colors), dataFor: { candles: null, params: "", len: 0, first: null } };
        indSeries.current.set(ind.uid, entry);
      }
      for (const s of entry.series) s.applyOptions({ visible: !ind.hidden });
    }
    for (const [uid, entry] of indSeries.current) {
      if (keep.has(uid)) continue;
      for (const s of entry.series) {
        try {
          chart.removeSeries(s);
        } catch {
          /* already gone */
        }
      }
      indSeries.current.delete(uid);
    }
  }, [indicators, chartType]);

  useEffect(() => {
    for (const { ind, values } of indData) {
      const entry = indSeries.current.get(ind.uid);
      const def = INDICATOR_BY_ID.get(ind.id);
      if (!entry || !def || !values.length) continue;
      const params = JSON.stringify(ind.params);
      const prev = entry.dataFor;
      const first = indCandles[0]?.time ?? null;
      const grow = indCandles.length - prev.len;
      // Live candle badli (candles same), ya poll ne aakhir mein kuch candles
      // jodi — dono mein sirf aakhri points update; poori history ka setData nahi.
      const tail =
        prev.params === params &&
        prev.len > 0 &&
        prev.first === first &&
        (prev.candles === sortedCandles || (grow >= 0 && grow <= TAIL_MAX));
      if (!tail) {
        def.outputs.forEach((o, i) => {
          entry.series[i]?.setData(indicatorPoints(o, values[i] ?? [], indCandles) as never);
        });
        entry.dataFor = { candles: sortedCandles, params, len: indCandles.length, first };
        continue;
      }
      const from = prev.candles === sortedCandles ? indCandles.length - 1 : Math.max(0, prev.len - 1);
      for (let j = from; j < indCandles.length; j++) {
        const time = toUnix(indCandles[j].time);
        def.outputs.forEach((o, i) => {
          const v = values[i]?.[j];
          const s = entry.series[i];
          if (!s) return;
          try {
            if (v == null || !Number.isFinite(v)) s.update({ time } as never);
            else s.update((o.type === "histogram" ? { time, value: v, color: histColor(o, v, values[i]?.[j - 1] ?? null) } : { time, value: v }) as never);
          } catch {
            /* series mein aakhri time isse naya — agla poll theek kar dega */
          }
        });
      }
      entry.dataFor = { candles: sortedCandles, params, len: indCandles.length, first };
    }
  }, [indData, indCandles, sortedCandles, chartType]);

  // Panes ki jagah: price upar, volume uske neeche, phir har pane apni patti mein.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const below = 1 - mainFrac;
    chart.priceScale("right").applyOptions({
      scaleMargins: { top: 0.06, bottom: below + mainFrac * (showVolume ? 0.18 : 0.04) },
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: mainFrac * 0.78, bottom: below } });
    chart.priceScale("compare").applyOptions({ scaleMargins: { top: 0.1, bottom: below + mainFrac * 0.3 } });
    paneUids.forEach((uid, i) => {
      const y0 = mainFrac + i * paneH;
      try {
        chart.priceScale(`pane-${uid}`).applyOptions({
          scaleMargins: { top: y0 + paneH * 0.2, bottom: Math.max(0, 1 - y0 - paneH * 0.94) },
          borderVisible: false,
        });
      } catch {
        /* scale abhi bana nahi */
      }
    });
    // paneSig = paneUids ki pehchaan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paneSig, mainFrac, paneH, showVolume, chartType, indicators]);

  const indIndex = useMemo(() => new Map(indCandles.map((c, i) => [toUnix(c.time) as number, i])), [indCandles]);
  const valueIdx = (hoverTime == null ? undefined : indIndex.get(hoverTime)) ?? indCandles.length - 1;

  const renderIndRow = (ind: ActiveIndicator, values: Num[][]) => {
    const def = INDICATOR_BY_ID.get(ind.id);
    if (!def) return null;
    const list = indicators ?? [];
    return (
      <div key={ind.uid} className="cm-ind-row" data-hidden={ind.hidden || undefined}>
        <span className="cm-ind-name">{indicatorTitle(ind)}</span>
        {!ind.hidden && (
          <span className="cm-ind-vals">
            {def.outputs.map((o, i) => (
              <span key={o.key} style={{ color: outputColor(ind, i, list) }}>
                {fmtInd(values[i]?.[valueIdx])}
              </span>
            ))}
          </span>
        )}
        <span className="cm-ind-actions">
          {onIndicatorToggle && (
            <button type="button" onClick={() => onIndicatorToggle(ind.uid)} aria-label={ind.hidden ? "Show" : "Hide"} title={ind.hidden ? "Show" : "Hide"}>
              {ind.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          )}
          {onIndicatorSettings && (
            <button type="button" onClick={() => onIndicatorSettings(ind.uid)} aria-label="Settings" title="Settings">
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onIndicatorRemove && (
            <button type="button" onClick={() => onIndicatorRemove(ind.uid)} aria-label="Remove" title="Remove">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
      </div>
    );
  };

  const overlayRows = indData.filter(({ ind }) => !INDICATOR_BY_ID.get(ind.id)?.pane);
  const paneRows = paneUids.map((uid) => indData.find((d) => d.ind.uid === uid)).filter(Boolean) as typeof indData;
  const liveLegendBar = liveView && liveView.key === liveKey ? liveView.bar : null;
  const lastCandle = candles.at(-1);
  const last =
    liveLegendBar && (!lastCandle || liveLegendBar.time >= lastCandle.time) ? liveLegendBar : lastCandle;
  const view: Readout | null =
    readout ??
    (last && last.open
      ? {
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          change: ((last.close - last.open) / last.open) * 100,
        }
      : null);
  const positive = (view?.change ?? 0) >= 0;

  /** Right edge thami rehti hai — TradingView jaisa, aakhri candle nazar se nahi hatti. */
  const zoom = (factor: number) => {
    const ts = chartRef.current?.timeScale();
    const range = ts?.getVisibleLogicalRange();
    if (!ts || !range) return;
    const width = Math.max(5, (range.to - range.from) * factor);
    ts.setVisibleLogicalRange({ from: range.to - width, to: range.to });
  };

  const scroll = (direction: -1 | 1) => {
    const ts = chartRef.current?.timeScale();
    const range = ts?.getVisibleLogicalRange();
    if (!ts || !range) return;
    const step = Math.max(1, Math.round((range.to - range.from) * 0.15)) * direction;
    ts.setVisibleLogicalRange({ from: range.from + step, to: range.to + step });
  };

  const resetChart = () => {
    const chart = chartRef.current;
    if (chart) showLatest(chart, barCountRef.current);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Mac par Option+R `e.key` mein "®" deta hai, isliye `code`.
      if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== "KeyR") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      const chart = chartRef.current;
      if (chart) showLatest(chart, barCountRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative w-full h-full trade-chart-shell">
      <div className="cm-legend-stack">
      {view && (
        <div className="trade-chart-legend">
          <span className="font-bold" style={{ color: "var(--text-primary)" }}>
            {symbol ?? "—"}
            <span style={{ color: "var(--text-muted)" }}>
              {/* Venue chart par hi — doosre platform se milaane wale ko pata ho
                  ki ye kis exchange ka kaunsa contract hai. */}
              {/Spot/i.test(venue) ? ` · ${venue}` : ` · Perp · ${venue}`}
              {interval ? ` · ${interval}` : ""} · {DESK_TZ_LABEL}
              {compareLabel ? ` · vs ${compareLabel}` : ""}
              {drawTool !== "cursor" ? ` · draw:${drawTool}` : ""}
            </span>
          </span>
          <span className="trade-legend-ohl"><span className="trade-legend-key">O</span><span className="trade-legend-val">{fmt(view.open)}</span></span>
          <span className="trade-legend-ohl"><span className="trade-legend-key">H</span><span className="trade-legend-val">{fmt(view.high)}</span></span>
          <span className="trade-legend-ohl"><span className="trade-legend-key">L</span><span className="trade-legend-val">{fmt(view.low)}</span></span>
          <span><span className="trade-legend-key">C</span><span className="trade-legend-val">{fmt(view.close)}</span></span>
          <span className="font-bold" style={{ color: positive ? UP : DOWN }}>
            {positive ? "+" : ""}{view.change.toFixed(2)}%
          </span>
        </div>
      )}
      {overlayRows.length > 0 && (
        <div className="cm-ind-legend">{overlayRows.map(({ ind, values }) => renderIndRow(ind, values))}</div>
      )}
      </div>
      <div
        ref={wrapRef}
        className="w-full h-full"
        role="img"
        aria-label="Crypto candlestick chart with indicator lines and volume"
      />
      {drawings.selected && (
        <div className="cm-draw-bar" role="toolbar" aria-label="Drawing settings">
          {DRAW_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className="cm-draw-swatch"
              style={{ background: c }}
              data-on={drawings.selected?.color === c}
              onClick={() => drawings.edit({ color: c })}
              aria-label={`Rang ${c}`}
            />
          ))}
          <span className="cm-draw-sep" />
          {DRAW_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              className="cm-draw-width"
              data-on={drawings.selected?.width === w}
              onClick={() => drawings.edit({ width: w })}
              aria-label={`Motaai ${w}`}
              title={drawings.selected?.type === "text" ? `Size ${w}` : `${w}px`}
            >
              <span style={{ height: drawings.selected?.type === "text" ? 2 : w }} />
            </button>
          ))}
          {drawings.selected.type === "text" && (
            <>
              <span className="cm-draw-sep" />
              <button
                type="button"
                className="cm-draw-icon"
                onClick={() => {
                  const text = window.prompt("Text badlein", drawings.selected?.text ?? "")?.trim();
                  if (text) drawings.edit({ text });
                }}
                aria-label="Text badlein"
                title="Text badlein"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <span className="cm-draw-sep" />
          <button type="button" className="cm-draw-icon" data-tone="danger" onClick={drawings.remove} aria-label="Drawing delete karein" title="Delete (Del)">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" className="cm-draw-icon" onClick={drawings.deselect} aria-label="Band karein" title="Band (Esc)">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {drawTool !== "cursor" && (
        <div className="cm-draw-hint">{DRAW_HINTS[drawTool]}</div>
      )}
      {paneRows.map(({ ind, values }, i) => (
        <div
          key={ind.uid}
          className="cm-pane"
          style={{
            top: `calc((100% - ${axisH}px) * ${mainFrac + i * paneH})`,
            height: `calc((100% - ${axisH}px) * ${paneH})`,
          }}
        >
          {renderIndRow(ind, values)}
        </div>
      ))}
      <div
        className="trade-chart-nav"
        role="toolbar"
        aria-label="Chart navigation"
        style={paneRows.length ? { bottom: `calc((100% - ${axisH}px) * ${1 - mainFrac} + ${axisH + 14}px)` } : undefined}
      >
        <ChartNavButton label="Zoom Out" onClick={() => zoom(1.25)}>
          <path d="M5 12h14" />
        </ChartNavButton>
        <ChartNavButton label="Zoom In" onClick={() => zoom(0.8)}>
          <path d="M12 5v14M5 12h14" />
        </ChartNavButton>
        <span className="trade-chart-nav-gap" />
        <ChartNavButton label="Scroll Left" onClick={() => scroll(-1)}>
          <path d="M15 6l-6 6 6 6" />
        </ChartNavButton>
        <ChartNavButton label="Scroll Right" onClick={() => scroll(1)}>
          <path d="M9 6l6 6-6 6" />
        </ChartNavButton>
        <span className="trade-chart-nav-gap" />
        <ChartNavButton label="Reset Chart" shortcut={["Alt", "R"]} onClick={resetChart}>
          <path d="M4 12a8 8 0 1 0 2.34-5.66" />
          <path d="M4 4v4h4" />
        </ChartNavButton>
      </div>
    </div>
  );
}
