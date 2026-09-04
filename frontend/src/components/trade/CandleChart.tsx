"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/cryptoApi";

/** Delta timestamps UTC hote hain; axis/tooltip IST mein dikhao. */
const CHART_TZ = "Asia/Kolkata";

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
  /** Diya ho to fixed EMA 9/21/50 ki jagah yahi lines draw hongi. */
  overlays?: ChartLine[];
}

interface Readout {
  open: number;
  high: number;
  low: number;
  close: number;
  change: number;
}

const UP = "#059669";
const DOWN = "#dc2626";

function toUnix(timeMs: number): UTCTimestamp {
  return Math.floor(timeMs / 1000) as UTCTimestamp;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CandleChart({
  candles,
  symbol,
  interval,
  showEma9 = true,
  showEma21 = true,
  showEma50 = true,
  overlays,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lineSeries = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const [readout, setReadout] = useState<Readout | null>(null);

  // Classic terminal view = EMA 9/21/50 toggles; strategy pages apni lines bhejte hain.
  const lines = useMemo<ChartLine[]>(() => {
    if (overlays) return overlays;
    return [
      { key: "ema_9", color: "#2563eb", on: showEma9 },
      { key: "ema_21", color: "#d97706", on: showEma21 },
      { key: "ema_50", color: "#7c3aed", on: showEma50 },
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
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#94a3b8",
        fontSize: 11,
        fontFamily: "Inter, system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: "#f4f6f9" },
        horzLines: { color: "#f4f6f9" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#94a3b8", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#0f172a" },
        horzLine: { color: "#94a3b8", width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#0f172a" },
      },
      rightPriceScale: {
        borderColor: "#eef1f5",
        scaleMargins: { top: 0.08, bottom: 0.26 },
        entireTextOnly: true,
      },
      localization: {
        timeFormatter: formatCrosshairTime,
      },
      timeScale: {
        borderColor: "#eef1f5",
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
      scaleMargins: { top: 0.82, bottom: 0 },
      borderVisible: false,
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
      // chart.remove() saari series bhi hata deta hai — stale handles rakhna khatarnak hai.
      series.clear();
    };
  }, []);

  // Line set badalte hi series add/remove karo (periods change ho sakte hain).
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

    volumeSeries.current?.setData(
      valid
        .map((c) => ({
          time: toUnix(c.time),
          value: c.volume ?? 0,
          color: c.close >= c.open ? "rgba(5, 150, 105, 0.28)" : "rgba(220, 38, 38, 0.24)",
        }))
        .sort((a, b) => (a.time as number) - (b.time as number)),
    );

    for (const [key, series] of lineSeries.current) {
      // `key` runtime par aata hai (jaise `ema_21`), isliye lookup untyped hai.
      series.setData(
        candles
          .map((c) => ({ time: toUnix(c.time), value: Number((c as unknown as Record<string, unknown>)[key]) }))
          .filter((point) => Number.isFinite(point.value))
          .sort((a, b) => (a.time as number) - (b.time as number)),
      );
    }
    chartRef.current?.timeScale().fitContent();
  }, [candles, lineSig]);

  const last = candles.at(-1);
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
              {interval ? ` · ${interval}` : ""} · IST
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
