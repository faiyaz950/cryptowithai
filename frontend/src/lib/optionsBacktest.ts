import {
  candlesSpanDays,
  fetchOptionsBacktestCandles,
  intervalMinutes,
  runOptionsBacktestRequest,
  type BacktestResult,
  type OptionsBacktestInfo,
  type OptionsBacktestRequest,
} from "./cryptoApi";
import { num, str, type StrategyDef, type StrategyValues } from "./strategies";

/**
 * Har bar par `analyze()` ko itni hi pichhli candles milti hain. Live card 400
 * leta hai; EMA/ADX itne mein settle ho jaate hain aur VWAP roz reset hota hai,
 * to signal wahi aata hai jo live mein aata — bas poori history har bar par
 * dobara nahi ghumani padti.
 */
const REPLAY_WINDOW = 500;
/** Itne bars ke baad browser ko saans lene do, warna tab atak jaata hai. */
const YIELD_EVERY = 250;

export function optionsKind(def: StrategyDef): OptionsBacktestInfo["kind"] | null {
  if (def.optionCondor) return "condor";
  if (def.optionSpread) return "spread";
  if (def.optionChain) return "single";
  return null;
}

export type OptionsBacktestProgress = (message: string) => void;

export async function runOptionsBacktest(
  def: StrategyDef,
  values: StrategyValues,
  onProgress?: OptionsBacktestProgress,
): Promise<BacktestResult> {
  const kind = optionsKind(def);
  if (!kind) throw new Error("Ye options strategy nahi hai");

  const symbol = str(values, "symbol", "BTCUSDT");
  const timeframe = str(values, "timeframe", "5m");
  const days = num(values, "days", 14);

  onProgress?.(`${days} din ki candles aa rahi hain…`);
  const candles = await fetchOptionsBacktestCandles(symbol, timeframe, days);
  if (candles.length < 100) throw new Error("Backtest ke liye candles kaafi nahi hain");

  // Signal candle band hone par aata hai — trade agli candle khulte hi lagta hai.
  const barMs = intervalMinutes(timeframe) * 60_000;
  const entries: OptionsBacktestRequest["entries"] = [];
  let wasEntry = false;
  for (let i = 60; i < candles.length; i++) {
    if (i % YIELD_EVERY === 0) {
      onProgress?.(`Signals replay ho rahe hain… ${Math.round((i / candles.length) * 100)}%`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const window = candles.slice(Math.max(0, i + 1 - REPLAY_WINDOW), i + 1);
    const { signal } = def.analyze(window, values);
    const direction = kind === "condor" ? null : signal.tone === "buy" ? "bull" : signal.tone === "sell" ? "bear" : null;
    const isEntry = kind === "condor" ? signal.entry === true : direction != null;
    // Sirf naya signal — wahi signal agle bar par bhi bana rahe to dobara entry nahi.
    if (isEntry && !wasEntry) {
      entries.push({ time: candles[i].time + barMs, direction, spot: candles[i].close });
    }
    wasEntry = isEntry;
  }

  onProgress?.(`${entries.length} signals mile — Delta se option data aa raha hai…`);
  const params: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "number" && Number.isFinite(value)) params[key] = value;
  }
  const res = await runOptionsBacktestRequest({
    kind,
    strategy_name: def.name,
    symbol,
    timeframe,
    days,
    days_covered: Math.round(candlesSpanDays(candles) * 10) / 10,
    total_candles: candles.length,
    lots: num(values, "lots", 1),
    start: candles[0].time,
    params,
    entries,
  });
  if (!res.success) throw new Error(res.error || "Options backtest fail");
  return res;
}
