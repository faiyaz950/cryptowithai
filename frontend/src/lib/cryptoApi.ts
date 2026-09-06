const CRYPTO_API = process.env.NEXT_PUBLIC_CRYPTO_API_URL || "http://127.0.0.1:8000/api";

/**
 * Delta India ke live perpetuals — turnover ke hisaab se chune gaye majors.
 * Backend ka SCREENER_UNIVERSE isi list se match karta hai.
 */
export const CRYPTO_SYMBOLS = [
  { value: "BTCUSDT", label: "BTC/USDT" },
  { value: "ETHUSDT", label: "ETH/USDT" },
  { value: "SOLUSDT", label: "SOL/USDT" },
  { value: "XRPUSDT", label: "XRP/USDT" },
  { value: "BNBUSDT", label: "BNB/USDT" },
  { value: "DOGEUSDT", label: "DOGE/USDT" },
  { value: "ADAUSDT", label: "ADA/USDT" },
  { value: "AVAXUSDT", label: "AVAX/USDT" },
  { value: "LINKUSDT", label: "LINK/USDT" },
  { value: "LTCUSDT", label: "LTC/USDT" },
  { value: "UNIUSDT", label: "UNI/USDT" },
  { value: "AAVEUSDT", label: "AAVE/USDT" },
  { value: "ARBUSDT", label: "ARB/USDT" },
  { value: "ZECUSDT", label: "ZEC/USDT" },
  { value: "BCHUSDT", label: "BCH/USDT" },
  { value: "DASHUSDT", label: "DASH/USDT" },
  { value: "ENAUSDT", label: "ENA/USDT" },
  { value: "TRUMPUSDT", label: "TRUMP/USDT" },
  { value: "DOTUSDT", label: "DOT/USDT" },
  { value: "SUIUSDT", label: "SUI/USDT" },
  { value: "FILUSDT", label: "FIL/USDT" },
  { value: "TRXUSDT", label: "TRX/USDT" },
  { value: "APTUSDT", label: "APT/USDT" },
  { value: "INJUSDT", label: "INJ/USDT" },
  { value: "NEARUSDT", label: "NEAR/USDT" },
  { value: "XLMUSDT", label: "XLM/USDT" },
  { value: "TIAUSDT", label: "TIA/USDT" },
  { value: "POLUSDT", label: "POL/USDT" },
  { value: "1000PEPEUSDT", label: "1000PEPE/USDT" },
  { value: "PENGUUSDT", label: "PENGU/USDT" },
] as const;

export const CRYPTO_INTERVALS = [
  { value: "1m", label: "1 Minute" },
  { value: "3m", label: "3 Minutes" },
  { value: "5m", label: "5 Minutes" },
  { value: "15m", label: "15 Minutes" },
  { value: "30m", label: "30 Minutes" },
  { value: "1h", label: "1 Hour" },
  { value: "4h", label: "4 Hours" },
  { value: "1d", label: "1 Day" },
] as const;

export type CryptoSymbol = (typeof CRYPTO_SYMBOLS)[number]["value"];
export type CryptoInterval = (typeof CRYPTO_INTERVALS)[number]["value"];

const INTERVAL_MINUTES: Record<string, number> = {
  "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30,
  "1h": 60, "2h": 120, "4h": 240, "6h": 360, "12h": 720, "1d": 1440,
};

/**
 * Delta ek request mein itni hi candles deta hai — isse zyada maangne par bhi
 * utni hi aati hain, isliye UI ko clamp aur actual coverage dikhana padta hai.
 */
export const MAX_CHART_CANDLES = 4000;

/** Chart "kitne din pehle tak" ke presets. */
export const CHART_RANGES = [
  { days: 1, label: "1D" },
  { days: 3, label: "3D" },
  { days: 7, label: "7D" },
  { days: 30, label: "30D" },
  { days: 90, label: "90D" },
  { days: 180, label: "180D" },
  { days: 365, label: "1Y" },
] as const;

export function intervalMinutes(interval: string): number {
  return INTERVAL_MINUTES[interval] ?? 60;
}

/** N din ko us timeframe ki candle count mein badlo (exchange limit tak clamped). */
export function barsForDays(days: number, interval: string): number {
  const wanted = Math.ceil((days * 24 * 60) / intervalMinutes(interval));
  return Math.max(2, Math.min(wanted, MAX_CHART_CANDLES));
}

/** Us timeframe par ek request se zyada se zyada kitne din mil sakte hain. */
export function maxDaysForInterval(interval: string): number {
  return (MAX_CHART_CANDLES * intervalMinutes(interval)) / (24 * 60);
}

/** Candles actually kitne din cover karti hain (pehli se aakhri candle tak). */
export function candlesSpanDays(candles: Candle[]): number {
  if (candles.length < 2) return 0;
  return (candles[candles.length - 1].time - candles[0].time) / (24 * 60 * 60 * 1000);
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema_9?: number | null;
  ema_21?: number | null;
  ema_50?: number | null;
  rsi?: number | null;
  // EMA periods are configurable, so the backend may return any `ema_<period>` key.
  [emaKey: `ema_${number}`]: number | null | undefined;
}

export interface CandlesResponse {
  success: boolean;
  symbol: string;
  interval: string;
  candles: Candle[];
  ema_periods: number[];
  total_candles: number;
  error?: string;
}

export interface MarketInfo {
  success: boolean;
  symbol: string;
  current_price: number;
  high_24h: number;
  low_24h: number;
  volume_24h: number;
  change_24h: number;
  error?: string;
}

export interface DemoOrder {
  order_id: string;
  symbol: string;
  side: string;
  order_type: string;
  quantity: number;
  price: number | null;
  status: string;
  timestamp?: string;
  size?: number;
  limit_price?: number;
}

export interface DeltaPosition {
  symbol?: string;
  size?: number;
  entry_price?: number;
  mark_price?: number;
  unrealized_pnl?: number;
}

/**
 * Positions ke saath ye bhi batata hai ki list khali kyun hai.
 * `configured: false` => Delta API keys set/usable nahi hain (ye "no open positions" nahi hai).
 */
export interface DeltaPositionsResult {
  positions: DeltaPosition[];
  configured: boolean;
  reason: string | null;
  message: string | null;
}

export interface BacktestTrade {
  entry_time: number;
  exit_time: number;
  side: string;
  entry_price: number;
  exit_price: number;
  stop_loss?: number;
  target?: number;
  pnl: number;
  pnl_points: number;
  status: string;
}

export interface BacktestResult {
  success: boolean;
  strategy?: string;
  symbol?: string;
  timeframe?: string;
  days_requested?: number;
  days_covered?: number;
  total_candles?: number;
  total_trades?: number;
  total_signals?: number;
  winning_trades?: number;
  losing_trades?: number;
  sl_hits?: number;
  target_hits?: number;
  win_rate?: number;
  total_profit?: number;
  lots?: number;
  sl_points?: number;
  target_points?: number;
  trades?: BacktestTrade[];
  exchange?: string;
  use_no_entry_window?: boolean;
  ema_periods?: { ema9: number; ema21: number; ema50: number } | null;
  rsi_settings?: { enabled: boolean; period: number; overbought: number; oversold: number };
  range_settings?: {
    timezone: string;
    start: string;
    end: string;
    sl_points: number;
    target_points: number;
  } | null;
  error?: string;
}

export interface BacktestParams {
  strategy: "ema-crossover" | "range-breakout";
  symbol: string;
  timeframe: string;
  days: number;
  sl_points: number;
  target_points: number;
  lots: number;
  ema9: number;
  ema21: number;
  ema50: number;
  use_rsi_filter: boolean;
  rsi_period: number;
  rsi_overbought: number;
  rsi_oversold: number;
  use_no_entry_window: boolean;
  /** Range breakout window (HH:MM) — sirf `range-breakout` strategy use karti hai. */
  range_start: string;
  range_end: string;
  range_timezone: string;
}

async function cryptoFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CRYPTO_API}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; success?: boolean };
  if (!res.ok) {
    throw new Error(data.error || `Crypto API error ${res.status}`);
  }
  return data;
}

export async function fetchCandles(params: {
  symbol: string;
  interval: string;
  limit: number;
  emaPeriods?: number[];
}): Promise<CandlesResponse> {
  const q = new URLSearchParams({
    symbol: params.symbol,
    interval: params.interval,
    limit: String(params.limit),
    ema_periods: (params.emaPeriods ?? [9, 21, 50]).join(","),
    include_rsi: "true",
    exchange: "delta",
  });
  return cryptoFetch<CandlesResponse>(`/candles?${q}`);
}

export function candleEma(candle: Candle, period: number): number | null {
  const raw = candle[`ema_${period}`];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export async function fetchMarketInfo(symbol: string): Promise<MarketInfo> {
  const q = new URLSearchParams({ symbol, exchange: "delta" });
  return cryptoFetch<MarketInfo>(`/market-info?${q}`);
}

/**
 * Free hosting tiers (Render waghairah) instance ko inactivity ke baad so jaane
 * dete hain, aur jagne mein 50-90 second lag jaate hain. Pehle yahan 3s ka
 * timeout tha — jo localhost par theek tha, par sote hue backend par hamesha
 * fail hota tha aur UI "Backend offline" dikha deta tha jabki backend bilkul
 * theek hota tha, bas jag raha hota tha.
 */
const HEALTH_TIMEOUT_MS = 90_000;

/** Local dev backend hai ya deployed? Error messages isse tay hote hain. */
export function isLocalBackend(): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(CRYPTO_API);
}

export async function checkCryptoHealth(timeoutMs = HEALTH_TIMEOUT_MS): Promise<boolean> {
  try {
    const res = await fetch(`${CRYPTO_API}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function placeDemoOrder(payload: {
  symbol: string;
  side: "buy" | "sell";
  order_type: "market" | "limit";
  quantity: number;
  price?: number | null;
}): Promise<{ success: boolean; order_id?: string; error?: string }> {
  return cryptoFetch("/place-order", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchDemoOrders(): Promise<DemoOrder[]> {
  const data = await cryptoFetch<{ success: boolean; data: DemoOrder[] }>("/orders");
  return data.data ?? [];
}

/** Backend flat array bhejta hai; purana `{ result: [...] }` envelope bhi handle karo. */
function extractPositions(raw: unknown): DeltaPosition[] {
  if (Array.isArray(raw)) return raw as DeltaPosition[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { result?: unknown }).result)) {
    return (raw as { result: DeltaPosition[] }).result;
  }
  return [];
}

export async function fetchDeltaPositions(symbol?: string): Promise<DeltaPositionsResult> {
  try {
    const q = symbol ? `?${new URLSearchParams({ symbol })}` : "";
    const data = await cryptoFetch<{
      success: boolean;
      configured?: boolean;
      reason?: string | null;
      message?: string | null;
      data?: unknown;
    }>(`/delta/positions${q}`);

    return {
      positions: extractPositions(data.data),
      // Purana backend `configured` nahi bhejta — us case mein assume karo keys theek hain.
      configured: data.configured !== false,
      reason: data.reason ?? null,
      message: data.message ?? null,
    };
  } catch (err) {
    // Backend down ya unexpected error — chup-chaap khali list dikhane ke bajaye reason surface karo.
    return {
      positions: [],
      configured: false,
      reason: "unreachable",
      message: err instanceof Error ? err.message : "Delta positions load nahi hui",
    };
  }
}

export async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  const q = new URLSearchParams({
    strategy: params.strategy,
    symbol: params.symbol,
    timeframe: params.timeframe,
    days: String(params.days),
    sl_points: String(params.sl_points),
    target_points: String(params.target_points),
    lots: String(params.lots),
    ema9: String(params.ema9),
    ema21: String(params.ema21),
    ema50: String(params.ema50),
    use_rsi_filter: String(params.use_rsi_filter),
    rsi_period: String(params.rsi_period),
    rsi_overbought: String(params.rsi_overbought),
    rsi_oversold: String(params.rsi_oversold),
    use_no_entry_window: String(params.use_no_entry_window),
    range_start: params.range_start,
    range_end: params.range_end,
    range_timezone: params.range_timezone,
    exchange: "delta",
  });
  return cryptoFetch<BacktestResult>(`/backtest?${q}`);
}

export interface ScreenerCandles {
  symbol: string;
  candles: Candle[];
}

export interface ScreenerResponse {
  success: boolean;
  interval: string;
  limit: number;
  requested: number;
  results: ScreenerCandles[];
  failed: { symbol: string; error: string }[];
  error?: string;
}

/**
 * Kai symbols ki candles ek request mein — backend parallel fetch karke 60s cache karta hai.
 * Signals frontend par nikalte hain taaki wahi math chale jo strategy pages par chalta hai.
 */
export async function fetchScreener(params: {
  symbols?: string[];
  interval: string;
  limit?: number;
}): Promise<ScreenerResponse> {
  const q = new URLSearchParams({
    interval: params.interval,
    limit: String(params.limit ?? 150),
  });
  if (params.symbols?.length) q.set("symbols", params.symbols.join(","));
  return cryptoFetch<ScreenerResponse>(`/screener?${q}`);
}

export function symbolLabel(symbol: string): string {
  return CRYPTO_SYMBOLS.find((s) => s.value === symbol)?.label ?? symbol.replace("USDT", "/USDT");
}
