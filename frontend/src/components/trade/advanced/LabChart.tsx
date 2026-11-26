"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { ema } from "@/lib/indicators";
import type { LabCandle, LabMark, LabSpec, LabTrade } from "@/lib/advancedBacktest";

const BAR_SEC: Record<string, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400,
};

function sec(time: number): UTCTimestamp {
  return Math.floor(time > 1e12 ? time / 1000 : time) as UTCTimestamp;
}

function istParts(time: Time, options: Intl.DateTimeFormatOptions): string {
  const ms = (typeof time === "number" ? time : 0) * 1000;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hourCycle: "h23", ...options }).format(new Date(ms));
}

function istLabel(time: Time): string {
  return istParts(time, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function istTick(time: Time, tickMarkType: TickMarkType): string {
  if (tickMarkType === TickMarkType.Year) return istParts(time, { year: "numeric" });
  if (tickMarkType === TickMarkType.Month) return istParts(time, { month: "short", year: "2-digit" });
  if (tickMarkType === TickMarkType.DayOfMonth) return istParts(time, { day: "2-digit", month: "short" });
  return istParts(time, { hour: "2-digit", minute: "2-digit" });
}

export function LabChart({
  candles,
  trades,
  marks,
  spec,
  focus,
}: {
  candles: LabCandle[];
  trades: LabTrade[];
  marks: LabMark[];
  spec: LabSpec;
  focus: LabTrade | null;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const chart: IChartApi = createChart(el, {
      height: 360,
      width: el.clientWidth || 640,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#a8a29e", fontFamily: "inherit" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: istTick,
      },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { timeFormatter: istLabel },
    });
    const series: ISeriesApi<"Candlestick"> = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    const fast = chart.addLineSeries({ color: "#f97316", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: `EMA ${spec.fast}` });
    const slow = chart.addLineSeries({ color: "#a8a29e", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: `EMA ${spec.slow}` });
    const pull = chart.addLineSeries({ color: "#38bdf8", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: `EMA ${spec.pullLen}` });

    const rows = [...candles]
      .filter((c) => [c.open, c.high, c.low, c.close].every((n) => Number.isFinite(n)))
      .sort((a, b) => a.time - b.time);
    const unique: LabCandle[] = [];
    for (const row of rows) {
      if (unique.length && unique[unique.length - 1].time === row.time) unique[unique.length - 1] = row;
      else unique.push(row);
    }
    series.setData(unique.map((c) => ({ time: sec(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
    const closes = unique.map((c) => c.close);
    const line = (values: number[]) => unique
      .map((c, i) => ({ time: sec(c.time), value: values[i] }))
      .filter((point) => Number.isFinite(point.value));
    fast.setData(line(ema(closes, Math.max(1, Math.round(spec.fast)))));
    slow.setData(line(ema(closes, Math.max(1, Math.round(spec.slow)))));
    pull.setData(line(ema(closes, Math.max(1, Math.round(spec.pullLen)))));

    const byTime = new Map<number, SeriesMarker<UTCTimestamp>>();
    const recentMarks = marks.slice(-80);
    for (const mark of recentMarks) {
      byTime.set(sec(mark.time), {
        time: sec(mark.time),
        position: "aboveBar",
        color: "#a8a29e",
        shape: "circle",
        text: mark.kind === "rsi" ? "RSI" : mark.kind === "cancel" ? "X" : "exp",
      });
    }
    for (const trade of trades) {
      byTime.set(sec(trade.exitTime), {
        time: sec(trade.exitTime),
        position: "inBar",
        color: trade.pnl >= 0 ? "#22c55e" : "#ef4444",
        shape: "circle",
        text: "out",
      });
    }
    for (const trade of trades) {
      byTime.set(sec(trade.entryTime), {
        time: sec(trade.entryTime),
        position: trade.side === "long" ? "belowBar" : "aboveBar",
        color: trade.side === "long" ? "#22c55e" : "#ef4444",
        shape: trade.side === "long" ? "arrowUp" : "arrowDown",
        text: trade.side === "long" ? "L" : "S",
      });
    }
    series.setMarkers([...byTime.values()].sort((a, b) => (a.time as number) - (b.time as number)));

    if (focus) {
      const add = (price: number, color: string, title: string, style: LineStyle) => {
        if (!Number.isFinite(price)) return;
        series.createPriceLine({ price, color, title, lineStyle: style, lineWidth: 1, axisLabelVisible: true });
      };
      add(focus.entry, "#e7e5e4", "Entry", LineStyle.Solid);
      add(focus.stop, "#ef4444", "Stop", LineStyle.Dashed);
      if (focus.target != null) add(focus.target, "#22c55e", "Target", LineStyle.Dashed);
      add(focus.exit, "#f97316", "Exit", LineStyle.Dotted);
      const pad = (BAR_SEC[spec.timeframe] ?? 1800) * 12;
      const from = sec(focus.entryTime) - pad;
      const to = sec(focus.exitTime) + pad;
      try {
        if (to > from) chart.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: to as UTCTimestamp });
        else chart.timeScale().fitContent();
      } catch {
        chart.timeScale().fitContent();
      }
    } else {
      chart.timeScale().fitContent();
    }

    const ro = new ResizeObserver(() => {
      if (host.current) chart.applyOptions({ width: host.current.clientWidth, height: 360 });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [candles, trades, marks, spec.fast, spec.slow, spec.pullLen, spec.timeframe, focus]);

  return (
    <div>
      <p className="lab-legend">
        <span><i style={{ background: "#f97316" }} />EMA {spec.fast}</span>
        <span><i style={{ background: "#a8a29e" }} />EMA {spec.slow}</span>
        <span><i style={{ background: "#38bdf8" }} />EMA {spec.pullLen}</span>
        <span>L / S entry · out exit · exp / RSI / X setup</span>
      </p>
      <div className="lab-chart" ref={host} />
    </div>
  );
}
