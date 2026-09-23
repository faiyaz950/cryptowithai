const CRYPTO_API = process.env.NEXT_PUBLIC_CRYPTO_API_URL || "http://127.0.0.1:8000/api";

/**
 * Delta India ke live perpetuals — turnover ke hisaab se chune gaye majors.
 * Backend ka SCREENER_UNIVERSE isi list se match karta hai.
 *
 * `value` API ka key hai (backend "BTCUSDT" -> Delta "BTCUSD" map karta hai),
 * isliye wo waisa hi rehta hai. `label` wo hai jo screen par dikhta hai, aur
 * wahan pehle "BTC/USDT" likha tha — jabki Delta ka ye contract USD mein quote,
 * settle aur margin hota hai, USDT mein nahi. Upar se header "Spot" kehta tha,
 * jabki ye perpetual future hai. Isi galat label ki wajah se chart ko Coinbase
 * ke BTC/USD spot se compare kiya jaata tha aur ~0.05% ka farak "bug" lagta tha.
 */
export const CRYPTO_SYMBOLS = [
  { value: "BTCUSDT", label: "BTC/USD" },
  { value: "ETHUSDT", label: "ETH/USD" },
  { value: "SOLUSDT", label: "SOL/USD" },
  { value: "XRPUSDT", label: "XRP/USD" },
  { value: "BNBUSDT", label: "BNB/USD" },
  { value: "DOGEUSDT", label: "DOGE/USD" },
  { value: "ADAUSDT", label: "ADA/USD" },
  { value: "AVAXUSDT", label: "AVAX/USD" },
  { value: "LINKUSDT", label: "LINK/USD" },
  { value: "LTCUSDT", label: "LTC/USD" },
  { value: "UNIUSDT", label: "UNI/USD" },
  { value: "AAVEUSDT", label: "AAVE/USD" },
  { value: "ARBUSDT", label: "ARB/USD" },
  { value: "ZECUSDT", label: "ZEC/USD" },
  { value: "BCHUSDT", label: "BCH/USD" },
  { value: "DASHUSDT", label: "DASH/USD" },
  { value: "ENAUSDT", label: "ENA/USD" },
  { value: "TRUMPUSDT", label: "TRUMP/USD" },
  { value: "DOTUSDT", label: "DOT/USD" },
  { value: "SUIUSDT", label: "SUI/USD" },
  { value: "FILUSDT", label: "FIL/USD" },
  { value: "TRXUSDT", label: "TRX/USD" },
  { value: "APTUSDT", label: "APT/USD" },
  { value: "INJUSDT", label: "INJ/USD" },
  { value: "NEARUSDT", label: "NEAR/USD" },
  { value: "XLMUSDT", label: "XLM/USD" },
  { value: "TIAUSDT", label: "TIA/USD" },
  { value: "POLUSDT", label: "POL/USD" },
  { value: "1000PEPEUSDT", label: "1000PEPE/USD" },
  { value: "PENGUUSDT", label: "PENGU/USD" },
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
  /** Chart ka asal source — delta / coindcx / bybit. */
  exchange?: string;
  exchange_name?: string;
  error?: string;
}

export interface MarketInfo {
  success: boolean;
  symbol: string;
  current_price: number;
  high_24h: number;
  low_24h: number;
  /** Base asset mein (BTC, ETH…) — exchange ka rolling 24h volume. */
  volume_24h: number;
  /** Wahi volume USD mein. Coins ke beech compare karne layak number yahi hai. */
  turnover_24h?: number | null;
  mark_price?: number | null;
  change_24h: number;
  /** "ticker" = exchange ke apne 24h stats, "candles" = fallback. */
  source?: "ticker" | "candles";
  exchange?: string;
  exchange_name?: string;
  error?: string;
}

/** Chart kis exchange se aa sakta hai — backend `/api/market/sources` se. */
export interface MarketSourceInfo {
  id: string;
  name: string;
  intervals: string[];
}

export const DEFAULT_MARKET_SOURCES: MarketSourceInfo[] = [
  {
    id: "delta",
    name: "Delta Exchange India",
    intervals: ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"],
  },
  {
    id: "coindcx",
    name: "CoinDCX",
    intervals: ["1m", "5m", "15m", "30m", "1h", "4h", "1d"],
  },
  {
    id: "bybit",
    name: "Bybit",
    intervals: ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"],
  },
];

export function venueShort(exchangeId: string | null | undefined): string {
  const id = (exchangeId || "delta").toLowerCase();
  if (id === "coindcx") return "CoinDCX";
  if (id === "bybit") return "Bybit";
  if (id === "delta") return "Delta";
  return id;
}

export function venueName(exchangeId: string | null | undefined): string {
  const hit = DEFAULT_MARKET_SOURCES.find((s) => s.id === (exchangeId || "delta").toLowerCase());
  return hit?.name ?? venueShort(exchangeId);
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
  /** Chart ka source — connected exchange. Default delta. */
  exchange?: string;
}): Promise<CandlesResponse> {
  const q = new URLSearchParams({
    symbol: params.symbol,
    interval: params.interval,
    limit: String(params.limit),
    ema_periods: (params.emaPeriods ?? [9, 21, 50]).join(","),
    include_rsi: "true",
    exchange: params.exchange || "delta",
  });
  return cryptoFetch<CandlesResponse>(`/candles?${q}`);
}

export function candleEma(candle: Candle, period: number): number | null {
  const raw = candle[`ema_${period}`];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export async function fetchMarketInfo(
  symbol: string,
  exchange = "delta",
): Promise<MarketInfo> {
  const q = new URLSearchParams({ symbol, exchange });
  return cryptoFetch<MarketInfo>(`/market-info?${q}`);
}

export async function fetchMarketSources(): Promise<MarketSourceInfo[]> {
  try {
    const res = await cryptoFetch<{ success: boolean; data: MarketSourceInfo[] }>("/market/sources");
    return res.data?.length ? res.data : DEFAULT_MARKET_SOURCES;
  } catch {
    return DEFAULT_MARKET_SOURCES;
  }
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

/**
 * Paper (demo) order — exchange par nahi jaata, sirf user ke naam se record
 * hota hai. Token zaroori hai: pehle ye khula tha aur sabke orders ek hi
 * common list mein chale jaate the.
 */
export async function placeDemoOrder(
  token: string,
  payload: {
    symbol: string;
    side: "buy" | "sell";
    order_type: "market" | "limit";
    quantity: number;
    price?: number | null;
  },
): Promise<{ success: boolean; order_id?: string; error?: string }> {
  return cryptoFetch("/place-order", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function fetchDemoOrders(token: string): Promise<DemoOrder[]> {
  const data = await cryptoFetch<{ success: boolean; data: DemoOrder[] }>("/orders", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.data ?? [];
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

export interface OptionContract {
  symbol: string;
  strike: number;
  spot: number | null;
  expiry: string | null;
  hours_to_expiry: number | null;
  delta: number;
  abs_delta: number;
  /** Per din premium decay (USD). OTM buying mein sabse bada risk. */
  theta: number | null;
  /** Per 1% IV point premium change. */
  vega: number | null;
  /** Per $1 spot move delta kitna badlega. */
  gamma: number | null;
  rho: number | null;
  iv: number | null;
  premium: number | null;
  best_bid: number | null;
  best_ask: number | null;
  spread_pct: number | null;
  oi: number;
  oi_value_usd: number;
  volume: number;
  turnover_usd: number;
  rejected_for: string[];
}

export interface OptionChainResponse {
  success: boolean;
  underlying: string;
  option_type: "call" | "put";
  delta_band: [number, number];
  selected: OptionContract | null;
  candidates: OptionContract[];
  rejected: OptionContract[];
  total_scanned: number;
  error?: string;
}

/** Underlying symbol se option chain ka underlying nikalo: BTCUSDT -> BTC. */
export function optionUnderlying(symbol: string): string {
  return symbol.toUpperCase().replace(/USDT?$/, "").replace(/^1000/, "");
}

/**
 * Directional option buying ke liye chain — backend delta band aur liquidity
 * filters laga kar ek `selected` strike bhi de deta hai.
 */
export async function fetchOptionChain(params: {
  underlying: string;
  optionType: "call" | "put";
  minDelta: number;
  maxDelta: number;
  maxSpreadPct?: number;
}): Promise<OptionChainResponse> {
  const q = new URLSearchParams({
    underlying: params.underlying,
    option_type: params.optionType,
    min_delta: String(params.minDelta),
    max_delta: String(params.maxDelta),
  });
  if (params.maxSpreadPct != null) q.set("max_spread_pct", String(params.maxSpreadPct));
  return cryptoFetch<OptionChainResponse>(`/options/chain?${q}`);
}

export interface SpreadLeg extends OptionContract {
  expiry_key: string;
}

export interface DebitSpread {
  expiry: string | null;
  hours_to_expiry: number | null;
  spot: number | null;
  long_leg: SpreadLeg;
  short_leg: SpreadLeg;
  width: number;
  net_debit: number;
  net_debit_mark: number;
  max_loss: number;
  max_profit: number;
  risk_reward: number | null;
  breakeven: number;
  net_delta: number | null;
  net_theta: number | null;
  net_vega: number | null;
  net_gamma: number | null;
  liquidity_usd: number;
}

export interface SpreadResponse {
  success: boolean;
  underlying: string;
  option_type: "call" | "put";
  strategy: "bull_call_spread" | "bear_put_spread";
  requested_width: number;
  selected: DebitSpread | null;
  alternatives: DebitSpread[];
  expiries_scanned: number;
  error?: string;
}

/** Debit spread (Strategy B) ke liye dono legs — backend hi strikes chunta hai. */
export async function fetchOptionSpread(params: {
  underlying: string;
  optionType: "call" | "put";
  width: number;
  longDelta: number;
  maxSpreadPct?: number;
}): Promise<SpreadResponse> {
  const q = new URLSearchParams({
    underlying: params.underlying,
    option_type: params.optionType,
    width: String(params.width),
    long_delta: String(params.longDelta),
  });
  if (params.maxSpreadPct != null) q.set("max_spread_pct", String(params.maxSpreadPct));
  return cryptoFetch<SpreadResponse>(`/options/spread?${q}`);
}

export interface IronCondor {
  expiry: string | null;
  hours_to_expiry: number | null;
  spot: number | null;
  short_call: SpreadLeg;
  long_call: SpreadLeg;
  short_put: SpreadLeg;
  long_put: SpreadLeg;
  call_wing: number;
  put_wing: number;
  net_credit: number;
  net_credit_mark: number;
  max_profit: number;
  max_loss: number;
  risk_reward: number | null;
  breakeven_low: number;
  breakeven_high: number;
  profit_zone_low: number;
  profit_zone_high: number;
  net_delta: number | null;
  net_theta: number | null;
  net_vega: number | null;
  net_gamma: number | null;
  liquidity_usd: number;
}

export interface CondorResponse {
  success: boolean;
  underlying: string;
  short_delta_target: number;
  long_delta_target: number;
  selected: IronCondor | null;
  alternatives: IronCondor[];
  expiries_scanned: number;
  error?: string;
}

/** Iron condor (Strategy C) ke chaaron legs — backend delta bands se chunta hai. */
export async function fetchIronCondor(params: {
  underlying: string;
  shortDelta: number;
  longDelta: number;
  maxSpreadPct?: number;
}): Promise<CondorResponse> {
  const q = new URLSearchParams({
    underlying: params.underlying,
    short_delta: String(params.shortDelta),
    long_delta: String(params.longDelta),
  });
  if (params.maxSpreadPct != null) q.set("max_spread_pct", String(params.maxSpreadPct));
  return cryptoFetch<CondorResponse>(`/options/condor?${q}`);
}

export interface StrikeRow {
  strike: number;
  call_iv: number | null;
  put_iv: number | null;
  call_oi: number;
  put_oi: number;
}

export interface OptionChainStats {
  expiry_key: string;
  expiry: string | null;
  hours_to_expiry: number;
  atm_strike: number | null;
  atm_iv: number | null;
  call_oi: number;
  put_oi: number;
  call_volume: number;
  put_volume: number;
  pcr_oi: number | null;
  pcr_volume: number | null;
  max_pain: { strike: number; value: number } | null;
  strikes: StrikeRow[];
}

export interface OptionsAnalytics {
  success: boolean;
  underlying: string;
  spot: number | null;
  totals: {
    call_oi: number;
    put_oi: number;
    pcr_oi: number | null;
    call_volume: number;
    put_volume: number;
    pcr_volume: number | null;
    contracts: number;
  };
  term_structure: { expiry_key: string; hours_to_expiry: number; atm_iv: number | null }[];
  chains: OptionChainStats[];
  error?: string;
}

export interface FundingRow {
  symbol: string;
  mark_price: number | null;
  funding_rate: number | null;
  mark_basis: number | null;
  oi_value_usd: number;
  turnover_usd: number;
  change_24h: number | null;
}

export interface FundingResponse {
  success: boolean;
  count: number;
  rates: FundingRow[];
  error?: string;
}

/** Poore option chain ka aggregate — IV smile, term structure, OI, PCR, max pain. */
export async function fetchOptionsAnalytics(underlying: string): Promise<OptionsAnalytics> {
  return cryptoFetch<OptionsAnalytics>(`/options/analytics?${new URLSearchParams({ underlying })}`);
}

/** Perpetuals ka funding rate — crowd kis taraf jhuki hai. */
export async function fetchFunding(symbols?: string[]): Promise<FundingResponse> {
  const q = new URLSearchParams();
  if (symbols?.length) q.set("symbols", symbols.join(","));
  const qs = q.toString();
  return cryptoFetch<FundingResponse>(`/funding${qs ? `?${qs}` : ""}`);
}

function fundingBase(symbol: string): string {
  return symbol.toUpperCase().replace(/USDT$|USD$/, "");
}

/**
 * Ek symbol ka funding rate. Filtered call purane backends par fail ho jaati hai,
 * isliye fallback poori list par base-asset se match karta hai. Wo list sabse
 * tez funding wale coins tak cut hoti hai, to null ka matlab "pata nahi" hai —
 * "zero funding" nahi.
 */
export async function fetchFundingFor(symbol: string): Promise<FundingRow | null> {
  const base = fundingBase(symbol);
  const pick = (rows: FundingRow[] | undefined) =>
    rows?.find((r) => fundingBase(r.symbol) === base) ?? null;

  const filtered = await fetchFunding([symbol]).catch(() => null);
  const hit = filtered?.success ? pick(filtered.rates) : null;
  if (hit) return hit;

  const all = await fetchFunding().catch(() => null);
  return all?.success ? pick(all.rates) : null;
}

/**
 * Poore desk ka timezone — ek hi jagah.
 *
 * Ye India ka desk hai (Delta India ke perpetuals), aur chart ka axis, backtest
 * ki range windows aur strategies ke defaults pehle se IST par the. Sirf header
 * clock aur sync stamps UTC dikha rahe the, to abhi-abhi aaya data bagal ke
 * clock se 5:30 peeche lagta tha — aur aadhi raat cross karte hi 18 ghante
 * purana. Ab sab yahi constant use karte hain.
 *
 * Sirf VWAP ka daily reset UTC par rehta hai (dekho `indicators.ts`) — wo
 * display nahi, signal ka hissa hai.
 */
/**
 * Desk ka default market. User ne exchange joda ho to chart usi ka dikhta
 * hai (kyunki har exchange ka bhaav alag hota hai). Manual override bhi hai.
 */
export const DESK_VENUE = "Delta Exchange India";
export const DESK_VENUE_SHORT = "Delta";
export const DESK_CONTRACT = "Perpetual";

export const DESK_TZ = "Asia/Kolkata";
export const DESK_TZ_LABEL = "IST";

/** Desk clock ke liye HH:MM:SS. */
export function deskClock(at: Date = new Date()): string {
  return at.toLocaleTimeString("en-GB", { hour12: false, timeZone: DESK_TZ });
}

/** Sync / scan timestamps — clock ke saath same timezone mein. */
export function syncStamp(at: Date = new Date()): string {
  return deskClock(at);
}

export function symbolLabel(symbol: string): string {

  return CRYPTO_SYMBOLS.find((s) => s.value === symbol)?.label ?? symbol.replace(/USDT?$/, "/USD");
}
