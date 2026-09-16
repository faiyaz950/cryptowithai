"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { DESK_TZ, DESK_TZ_LABEL, DESK_VENUE_SHORT, type Candle } from "@/lib/cryptoApi";
import { subscribeLiveCandles, type LiveBar, type LiveStatus } from "@/lib/deltaLive";
import type { DrawTool } from "@/components/trade/ChartDeskTools";

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
  showEma9?: boolean;
  showEma21?: boolean;
  showEma50?: boolean;
  showVolume?: boolean;
  /** Diya ho to fixed EMA 9/21/50 ki jagah yahi lines draw hongi. */
  overlays?: ChartLine[];
  compareCandles?: Candle[];
  compareLabel?: string;
  drawTool?: DrawTool;
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
}

interface Readout {
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
}

const UP = "#00e676";
const DOWN = "#ff5252";

const EMA_KEY = /^ema_(\d+)$/;

type EmaState = Map<string, { barTime: number; prev: number; lastClose: number }>;

/**
 * Ek live candle chart par lagao. `update()` aakhri candle badalta hai ya nayi
 * jodta hai, aur setData() ki tarah zoom/scroll nahi chhedta.
 */
function paintLiveBar(
  bar: LiveBar,
  candle: ISeriesApi<"Candlestick">,
  volume: ISeriesApi<"Histogram"> | null,
  lines: Map<string, ISeriesApi<"Line">>,
  emaState: EmaState,
  showVolume: boolean,
) {
  const time = toUnix(bar.time);
  candle.update({ time, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
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

function toUnix(timeMs: number): UTCTimestamp {
  return Math.floor(timeMs / 1000) as UTCTimestamp;
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

export default function CandleChart({
  candles,
  symbol,
  interval,
  showEma9 = true,
  showEma21 = true,
  showEma50 = true,
  showVolume = true,
  overlays,
  compareCandles,
  compareLabel,
  drawTool = "cursor",
  clearDrawingsKey = 0,
  viewKey,
  live,
  onLiveBar,
  onLiveStatus,
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
  const [liveView, setLiveView] = useState<{ key: string; bar: LiveBar } | null>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  const compareSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const lineSeries = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const priceLines = useRef<IPriceLine[]>([]);
  const trendSeries = useRef<ISeriesApi<"Line">[]>([]);
  const trendDraft = useRef<{ time: UTCTimestamp; price: number } | null>(null);
  const drawToolRef = useRef(drawTool);
  const [readout, setReadout] = useState<Readout | null>(null);

  drawToolRef.current = drawTool;

  const lines = useMemo<ChartLine[]>(() => {
    if (overlays) return overlays;
    return [
      { key: "ema_9", color: "#60a5fa", on: showEma9 },
      { key: "ema_21", color: "#fbbf24", on: showEma21 },
      { key: "ema_50", color: "#c084fc", on: showEma50 },
    ]
      .filter((l) => l.on)
      .map(({ key, color }) => ({ key, color }));
  }, [overlays, showEma9, showEma21, showEma50]);

  const lineSig = lines.map((l) => `${l.key}:${l.color}`).join("|");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const series = lineSeries.current;

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

    candleSeries.current = chart.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineColor: "#94a3b8",
      priceLineStyle: LineStyle.Dotted,
      priceLineWidth: 1,
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
      if (!candleSeries.current) return;
      const bar = param.seriesData?.get(candleSeries.current) as
        | { open: number; high: number; low: number; close: number }
        | undefined;
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

    const onClick = (param: MouseEventParams) => {
      const tool = drawToolRef.current;
      if (tool === "cursor" || !param.point || !candleSeries.current || !chartRef.current) return;
      const price = candleSeries.current.coordinateToPrice(param.point.y);
      if (price == null || !Number.isFinite(price)) return;

      if (tool === "hline") {
        const line = candleSeries.current.createPriceLine({
          price,
          color: "#00e676",
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "H",
        });
        priceLines.current.push(line);
        return;
      }

      if (tool === "trend") {
        if (!param.time) return;
        const time = (typeof param.time === "number" ? param.time : toUnix(timeToDate(param.time).getTime())) as UTCTimestamp;
        const draft = trendDraft.current;
        if (!draft) {
          trendDraft.current = { time, price };
          return;
        }
        const series = chartRef.current.addLineSeries({
          color: "#f472b6",
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
        });
        const a = draft.time <= time ? draft : { time, price };
        const b = draft.time <= time ? { time, price } : draft;
        series.setData([
          { time: a.time, value: a.price },
          { time: b.time, value: b.price },
        ]);
        trendSeries.current.push(series);
        trendDraft.current = null;
      }
    };
    chart.subscribeClick(onClick);

    const observer = new ResizeObserver(() => {
      if (!wrapRef.current || !chartRef.current) return;
      chartRef.current.applyOptions({
        width: wrapRef.current.clientWidth,
        height: wrapRef.current.clientHeight,
      });
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeries.current = null;
      volumeSeries.current = null;
      compareSeries.current = null;
      series.clear();
      priceLines.current = [];
      trendSeries.current = [];
      trendDraft.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candleSeries.current) return;
    for (const line of priceLines.current) {
      try {
        candleSeries.current.removePriceLine(line);
      } catch {
        /* already gone */
      }
    }
    priceLines.current = [];
    const chart = chartRef.current;
    if (chart) {
      for (const s of trendSeries.current) {
        try {
          chart.removeSeries(s);
        } catch {
          /* already gone */
        }
      }
    }
    trendSeries.current = [];
    trendDraft.current = null;
  }, [clearDrawingsKey]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      handleScroll: {
        mouseWheel: drawTool === "cursor",
        pressedMouseMove: drawTool === "cursor",
      },
      crosshair: {
        mode: drawTool === "cursor" ? CrosshairMode.Normal : CrosshairMode.Magnet,
      },
    });
    if (wrapRef.current) {
      wrapRef.current.style.cursor = drawTool === "cursor" ? "default" : "crosshair";
    }
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
    if (!candleSeries.current || !candles.length) return;

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

    const valid = candles.filter((c) => c.open && c.high && c.low && c.close);

    const bars = valid
      .map((c) => ({
        time: toUnix(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));

    candleSeries.current.setData(bars);

    if (showVolume) {
      volumeSeries.current?.setData(
        valid
          .map((c) => ({
            time: toUnix(c.time),
            value: c.volume ?? 0,
            color: c.close >= c.open ? "rgba(0, 230, 118, 0.32)" : "rgba(255, 82, 82, 0.28)",
          }))
          .sort((a, b) => (a.time as number) - (b.time as number)),
      );
      volumeSeries.current?.applyOptions({ visible: true });
    } else {
      volumeSeries.current?.setData([]);
      volumeSeries.current?.applyOptions({ visible: false });
    }

    for (const [key, series] of lineSeries.current) {
      series.setData(
        candles
          .map((c) => ({ time: toUnix(c.time), value: Number((c as unknown as Record<string, unknown>)[key]) }))
          .filter((point) => Number.isFinite(point.value))
          .sort((a, b) => (a.time as number) - (b.time as number)),
      );
    }
    barCountRef.current = bars.length;

    // Live feed ke liye base: har EMA line ka "aakhri se pehle wali candle" ka value.
    const sorted = [...candles].sort((a, b) => a.time - b.time);
    const lastBar = sorted[sorted.length - 1];
    const beforeLast = sorted[sorted.length - 2];
    emaStateRef.current.clear();
    if (lastBar && beforeLast) {
      for (const key of lineSeries.current.keys()) {
        const prev = Number((beforeLast as unknown as Record<string, unknown>)[key]);
        if (EMA_KEY.test(key) && Number.isFinite(prev)) {
          emaStateRef.current.set(key, { barTime: lastBar.time, prev, lastClose: lastBar.close });
        }
      }
    }
    lastBarTimeRef.current = lastBar?.time ?? null;

    // Poll ka data live feed se kuch second purana ho sakta hai — bani hui candle
    // peeche na jaaye, isliye taaza live candle dobara lagao.
    const liveBar = liveBarRef.current;
    if (liveBar && lastBar && liveBar.time >= lastBar.time) {
      paintLiveBar(liveBar, candleSeries.current, volumeSeries.current, lineSeries.current, emaStateRef.current, showVolume);
      if (liveBar.time > lastBar.time) barCountRef.current = bars.length + 1;
      lastBarTimeRef.current = liveBar.time;
    }

    /*
     * Pehle yahan har baar fitContent() chalta tha. Markets page har kuch
     * second mein naya data laata hai, to user zoom karta, poll aata aur chart
     * wapas poora zoom-out ho jaata — scroll karke purani candle dekh raha ho
     * to wo bhi seedha aakhri candle par kood jaata.
     *
     * Ab: naya dataset (symbol/timeframe badla) -> fit. Wahi dataset refresh
     * hua aur user aakhri candle dekh raha tha -> jitna zoom aur aakhri candle
     * ke right mein jitni khaali jagah thi, wahi rakho; nayi candle aaye to view
     * ek candle aage chale. User pichhe history dekh raha tha -> wahi jagah.
     *
     * Live edge par pehle scrollToRealTime() tha. Wo right ki khaali jagah hata
     * kar aakhri candle ko edge se chipka deta tha, to har 10s ke poll par chart
     * thoda khisak jaata tha — "jaisa chhoda tha waisa" nahi rehta tha.
     */
    if (isNewView) {
      viewKeyRef.current = key;
      timeScale?.fitContent();
    } else if (followingLive && prevLogical) {
      const width = prevLogical.to - prevLogical.from;
      const rightGap = prevLogical.to - (prevBarCount - 1);
      const to = barCountRef.current - 1 + rightGap;
      timeScale?.setVisibleLogicalRange({ from: to - width, to });
    } else if (followingLive) {
      timeScale?.scrollToRealTime();
    } else if (prevTimeRange) {
      timeScale?.setVisibleRange(prevTimeRange);
    }
  }, [candles, lineSig, showVolume, viewKey, symbol, interval]);

  // Callbacks aur toggles ref mein — inke badalne par socket dobara nahi kholna.
  useEffect(() => {
    onLiveBarRef.current = onLiveBar;
    onLiveStatusRef.current = onLiveStatus;
    showVolumeRef.current = showVolume;
  });

  const liveSymbol = live?.symbol;
  const liveInterval = live?.interval;

  useEffect(() => {
    if (!liveSymbol || !liveInterval) return;
    const key = `${liveSymbol}|${liveInterval}`;
    liveBarRef.current = null;
    let pending: LiveBar | null = null;

    const onBar = (bar: LiveBar) => {
      const candle = candleSeries.current;
      const lastTime = lastBarTimeRef.current;
      // History abhi aayi nahi, ya ye tick chart ki aakhri candle se purana hai.
      if (!candle || lastTime == null || bar.time < lastTime) return;
      if (bar.time > lastTime) barCountRef.current += 1;
      liveBarRef.current = bar;
      paintLiveBar(bar, candle, volumeSeries.current, lineSeries.current, emaStateRef.current, showVolumeRef.current);
      lastBarTimeRef.current = bar.time;
      pending = bar;
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

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(flush);
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

  return (
    <div className="relative w-full h-full">
      {view && (
        <div className="trade-chart-legend">
          <span className="font-bold" style={{ color: "var(--text-primary)" }}>
            {symbol ?? "—"}
            <span style={{ color: "var(--text-muted)" }}>
              {/* Venue chart par hi — doosre platform se milaane wale ko pata ho
                  ki ye kis exchange ka kaunsa contract hai. */}
              {` · Perp · ${DESK_VENUE_SHORT}`}
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
      <div
        ref={wrapRef}
        className="w-full h-full"
        role="img"
        aria-label="Crypto candlestick chart with indicator lines and volume"
      />
    </div>
  );
}
