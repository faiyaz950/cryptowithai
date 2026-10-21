/**
 * Crypto Volatility Calculator — pure math.
 *
 * Purpose: Crypto coin ki price volatility measure karna (current & annualized).
 *
 * Calculation:
 *   Return % = ((Current Close - Previous Close) / Previous Close) × 100
 *   Period Volatility = Standard Deviation of Returns
 *   Annualized Volatility = Period Volatility × √(Periods Per Year)
 *
 * Periods Per Year (Crypto 24/7/365):
 *   - 1D: 365
 *   - 4H: 365 × 6 = 2,190
 *   - 1H: 365 × 24 = 8,760
 */

export type VolatilityTimeframe = "1h" | "4h" | "1d";

export interface VolatilityPreset {
  id: string;
  name: string;
  symbol: string;
  typicalAnnualizedVol: number;
  samplePrices: number[];
}

export const VOLATILITY_PRESETS: VolatilityPreset[] = [
  {
    id: "btc",
    name: "Bitcoin (BTC/USDT)",
    symbol: "BTC",
    typicalAnnualizedVol: 48,
    samplePrices: [
      64200, 65100, 64800, 66300, 65800, 67200, 66900,
      67800, 66400, 65900, 66800, 67500, 68200, 67900
    ],
  },
  {
    id: "eth",
    name: "Ethereum (ETH/USDT)",
    symbol: "ETH",
    typicalAnnualizedVol: 58,
    samplePrices: [
      3320, 3410, 3380, 3490, 3440, 3560, 3510,
      3590, 3480, 3420, 3500, 3580, 3640, 3610
    ],
  },
  {
    id: "sol",
    name: "Solana (SOL/USDT)",
    symbol: "SOL",
    typicalAnnualizedVol: 78,
    samplePrices: [
      142, 149, 144, 155, 151, 163, 158,
      166, 154, 148, 157, 164, 171, 168
    ],
  },
  {
    id: "doge",
    name: "Dogecoin (DOGE/USDT)",
    symbol: "DOGE",
    typicalAnnualizedVol: 98,
    samplePrices: [
      0.112, 0.121, 0.116, 0.128, 0.123, 0.135, 0.129,
      0.138, 0.125, 0.119, 0.129, 0.136, 0.144, 0.140
    ],
  },
  {
    id: "pepe",
    name: "Pepe (PEPE/USDT)",
    symbol: "PEPE",
    typicalAnnualizedVol: 145,
    samplePrices: [
      0.0000082, 0.0000095, 0.0000088, 0.0000104, 0.0000097, 0.0000115, 0.0000106,
      0.0000121, 0.0000103, 0.0000094, 0.0000109, 0.0000119, 0.0000132, 0.0000125
    ],
  },
];

export interface VolatilityInput {
  timeframe: VolatilityTimeframe;
  lookbackPeriods: number; // e.g. 7, 14, 30
  prices: number[];
}

export type VolatilityLevel = "low" | "moderate" | "high" | "extreme";

export interface VolatilityResult {
  timeframe: VolatilityTimeframe;
  lookbackPeriods: number;
  dataPointsCount: number;
  returns: number[]; // percentage returns
  periodVolatilityPct: number; // StdDev of returns (%)
  annualizedVolatilityPct: number;
  periodsPerYear: number;
  meanReturnPct: number;
  avgAbsoluteMovePct: number;
  highestMovePct: number;
  lowestMovePct: number;
  volatilityLevel: VolatilityLevel;
  volatilityLevelLabel: string;
}

export type VolatilityOutcome =
  | { ok: true; result: VolatilityResult }
  | { ok: false; error: string };

export function computeVolatility(input: VolatilityInput): VolatilityOutcome | null {
  const { timeframe, lookbackPeriods, prices } = input;

  if (!prices || prices.length < 2) {
    return { ok: false, error: "Kam se kam 2 price points hone chahiye volatility calculate karne ke liye." };
  }

  // Slice to lookback + 1 prices to calculate lookback returns
  const sliceLength = Math.min(prices.length, Math.max(3, lookbackPeriods + 1));
  const activePrices = prices.slice(prices.length - sliceLength);

  if (activePrices.some((p) => !Number.isFinite(p) || p <= 0)) {
    return { ok: false, error: "Price values valid positive numbers hone chahiye." };
  }

  // Calculate percentage returns
  const returns: number[] = [];
  for (let i = 1; i < activePrices.length; i++) {
    const prev = activePrices[i - 1];
    const curr = activePrices[i];
    const ret = ((curr - prev) / prev) * 100;
    returns.push(ret);
  }

  if (returns.length < 2) {
    return { ok: false, error: "Returns calculate karne ke liye minimum 2 intervals required hain." };
  }

  // Mean return
  const n = returns.length;
  const meanReturnPct = returns.reduce((sum, r) => sum + r, 0) / n;

  // Standard Deviation (sample standard deviation: N - 1)
  const sumSquaredDiffs = returns.reduce((sum, r) => sum + Math.pow(r - meanReturnPct, 2), 0);
  const variance = sumSquaredDiffs / (n - 1);
  const periodVolatilityPct = Math.sqrt(variance);

  // Periods per year based on 24/7 crypto markets
  let periodsPerYear = 365;
  if (timeframe === "4h") periodsPerYear = 365 * 6; // 2190
  if (timeframe === "1h") periodsPerYear = 365 * 24; // 8760

  const annualizedVolatilityPct = periodVolatilityPct * Math.sqrt(periodsPerYear);

  // Stats
  const avgAbsoluteMovePct = returns.reduce((sum, r) => sum + Math.abs(r), 0) / n;
  const highestMovePct = Math.max(...returns);
  const lowestMovePct = Math.min(...returns);

  // Volatility Level categorization based on annualized volatility
  let volatilityLevel: VolatilityLevel = "moderate";
  let volatilityLevelLabel = "Moderate Volatility (35% – 65%)";

  if (annualizedVolatilityPct < 35) {
    volatilityLevel = "low";
    volatilityLevelLabel = "Low Volatility (< 35% Annualized)";
  } else if (annualizedVolatilityPct <= 65) {
    volatilityLevel = "moderate";
    volatilityLevelLabel = "Moderate Volatility (35% – 65% Annualized)";
  } else if (annualizedVolatilityPct <= 100) {
    volatilityLevel = "high";
    volatilityLevelLabel = "High Volatility (65% – 100% Annualized)";
  } else {
    volatilityLevel = "extreme";
    volatilityLevelLabel = "Extreme / Meme Volatility (> 100% Annualized)";
  }

  return {
    ok: true,
    result: {
      timeframe,
      lookbackPeriods: n,
      dataPointsCount: activePrices.length,
      returns,
      periodVolatilityPct,
      annualizedVolatilityPct,
      periodsPerYear,
      meanReturnPct,
      avgAbsoluteMovePct,
      highestMovePct,
      lowestMovePct,
      volatilityLevel,
      volatilityLevelLabel,
    },
  };
}
