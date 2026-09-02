"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/cryptoApi";

interface Props {
  candles: Candle[];
  symbol?: string;
  interval?: string;
  showEma9: boolean;
  showEma21: boolean;
  showEma50: boolean;
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

export default function CandleChart({ candles, symbol, interval, showEma9, showEma21, showEma50 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema9Series = useRef<ISeriesApi<"Line"> | null>(null);
  const ema21Series = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Series = useRef<ISeriesApi<"Line"> | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

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
      timeScale: {
        borderColor: "#eef1f5",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 8,
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

    const lineOpts = { lineWidth: 2 as const, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false };
    ema9Series.current = chart.addLineSeries({ color: "#2563eb", ...lineOpts });
    ema21Series.current = chart.addLineSeries({ color: "#d97706", ...lineOpts });
    ema50Series.current = chart.addLineSeries({ color: "#7c3aed", ...lineOpts });
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
    };
  }, []);

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

    const setEma = (series: ISeriesApi<"Line"> | null, key: "ema_9" | "ema_21" | "ema_50", visible: boolean) => {
      if (!series) return;
      series.applyOptions({ visible });
      if (!visible) {
        series.setData([]);
        return;
      }
      series.setData(
        candles
          .filter((c) => c[key] != null && Number.isFinite(c[key] as number))
          .map((c) => ({ time: toUnix(c.time), value: Number(c[key]) }))
          .sort((a, b) => (a.time as number) - (b.time as number)),
      );
    };

    setEma(ema9Series.current, "ema_9", showEma9);
    setEma(ema21Series.current, "ema_21", showEma21);
    setEma(ema50Series.current, "ema_50", showEma50);
    chartRef.current?.timeScale().fitContent();
  }, [candles, showEma9, showEma21, showEma50]);

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
            {interval ? <span style={{ color: "var(--text-muted)" }}> · {interval}</span> : null}
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
        aria-label="Crypto candlestick chart with EMA lines and volume"
      />
    </div>
  );
}
