/**
 * Crypto Breakout Distance Calculator — pure math.
 *
 * Purpose: Current price kisi selected resistance ya support level se kitna door hai,
 * range position percentage, aur ATR (Average True Range) normalization calculate karna.
 *
 * Logic:
 *   Distance to Resistance % = ((Resistance - Current Price) / Current Price) × 100
 *   Distance to Support % = ((Current Price - Support) / Current Price) × 100
 *   Range Width = Resistance - Support
 *   Current Position in Range % = ((Current Price - Support) / Range Width) × 100
 *   Distance in ATR = Absolute Price Distance / ATR
 */

export interface BreakoutDistancePreset {
  id: string;
  name: string;
  symbol: string;
  currentPrice: number;
  supportLevel: number;
  resistanceLevel: number;
  atr: number;
  alertThresholdPct: number;
  note: string;
}

export const BREAKOUT_DISTANCE_PRESETS: BreakoutDistancePreset[] = [
  {
    id: "btc-4h-channel",
    name: "BTC 4H Consolidation Channel",
    symbol: "BTC/USDT",
    currentPrice: 64200,
    supportLevel: 62000,
    resistanceLevel: 66000,
    atr: 950,
    alertThresholdPct: 1.5,
    note: "BTC trading in a $4,000 range, currently at 55% mid-channel position",
  },
  {
    id: "eth-resistance-test",
    name: "ETH Approaching Key Resistance",
    symbol: "ETH/USDT",
    currentPrice: 3470,
    supportLevel: 3200,
    resistanceLevel: 3500,
    atr: 75,
    alertThresholdPct: 1.2,
    note: "Just 0.86% (0.4 ATR) away from major $3,500 psychological resistance",
  },
  {
    id: "sol-active-breakout",
    name: "SOL Confirmed Breakout Mode",
    symbol: "SOL/USDT",
    currentPrice: 164.5,
    supportLevel: 142,
    resistanceLevel: 160,
    atr: 6.8,
    alertThresholdPct: 2.0,
    note: "Trading above resistance level (+2.81% extension beyond $160 level)",
  },
  {
    id: "altcoin-support-test",
    name: "Altcoin Danger: Testing Support",
    symbol: "LINK/USDT",
    currentPrice: 11.2,
    supportLevel: 11.0,
    resistanceLevel: 13.5,
    atr: 0.45,
    alertThresholdPct: 2.5,
    note: "Trading right on critical support boundary (1.82% / 0.44 ATR distance)",
  },
];

export interface BreakoutDistanceInput {
  currentPrice: number;
  supportLevel: number;
  resistanceLevel: number;
  atr?: number;
  alertThresholdPct?: number;
  symbol?: string;
}

export type RangeStatus =
  | "breakout_above"
  | "breakdown_below"
  | "near_resistance"
  | "near_support"
  | "inside_range";

export interface BreakoutDistanceOutcome {
  currentPrice: number;
  supportLevel: number;
  resistanceLevel: number;
  atr: number;
  alertThresholdPct: number;
  symbol: string;
  distToResistanceAbs: number;
  distToResistancePct: number;
  distToSupportAbs: number;
  distToSupportPct: number;
  rangeSpanAbs: number;
  rangeSpanPct: number;
  positionInRangePct: number;
  distToResistanceAtr: number | null;
  distToSupportAtr: number | null;
  rangeSpanAtr: number | null;
  status: RangeStatus;
  isBreakout: boolean;
  isBreakdown: boolean;
  isAlertTriggered: boolean;
  statusLabel: string;
  headlineSummary: string;
}

export function computeBreakoutDistance(
  input: BreakoutDistanceInput
): BreakoutDistanceOutcome | null {
  const {
    currentPrice,
    supportLevel,
    resistanceLevel,
    atr = 0,
    alertThresholdPct = 1.5,
    symbol = "ASSET",
  } = input;

  if (
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    !Number.isFinite(supportLevel) ||
    supportLevel <= 0 ||
    !Number.isFinite(resistanceLevel) ||
    resistanceLevel <= 0 ||
    resistanceLevel <= supportLevel
  ) {
    return null;
  }

  const validAtr = Number.isFinite(atr) && atr > 0 ? atr : 0;
  const validThreshold =
    Number.isFinite(alertThresholdPct) && alertThresholdPct >= 0
      ? alertThresholdPct
      : 1.5;

  // Distances to resistance
  const distToResistanceAbs = resistanceLevel - currentPrice;
  const distToResistancePct = (distToResistanceAbs / currentPrice) * 100;

  // Distances to support
  const distToSupportAbs = currentPrice - supportLevel;
  const distToSupportPct = (distToSupportAbs / currentPrice) * 100;

  // Range metrics
  const rangeSpanAbs = resistanceLevel - supportLevel;
  const rangeSpanPct = (rangeSpanAbs / supportLevel) * 100;
  const positionInRangePct = ((currentPrice - supportLevel) / rangeSpanAbs) * 100;

  // ATR Normalization
  const distToResistanceAtr =
    validAtr > 0 ? Math.abs(distToResistanceAbs) / validAtr : null;
  const distToSupportAtr =
    validAtr > 0 ? Math.abs(distToSupportAbs) / validAtr : null;
  const rangeSpanAtr = validAtr > 0 ? rangeSpanAbs / validAtr : null;

  // Status classification
  let status: RangeStatus = "inside_range";
  let statusLabel = "Inside Range";
  let isBreakout = false;
  let isBreakdown = false;
  let isAlertTriggered = false;

  if (currentPrice > resistanceLevel) {
    status = "breakout_above";
    statusLabel = "Bullish Breakout Above Resistance";
    isBreakout = true;
    isAlertTriggered = true;
  } else if (currentPrice < supportLevel) {
    status = "breakdown_below";
    statusLabel = "Bearish Breakdown Below Support";
    isBreakdown = true;
    isAlertTriggered = true;
  } else if (distToResistancePct <= validThreshold) {
    status = "near_resistance";
    statusLabel = "Near Resistance (Breakout Watch)";
    isAlertTriggered = true;
  } else if (distToSupportPct <= validThreshold) {
    status = "near_support";
    statusLabel = "Near Support (Bounce or Breakdown Watch)";
    isAlertTriggered = true;
  } else {
    status = "inside_range";
    statusLabel = "Consolidating Mid-Range";
    isAlertTriggered = false;
  }

  let headlineSummary = "";
  if (isBreakout) {
    headlineSummary = `${symbol} is +${Math.abs(distToResistancePct).toFixed(2)}% above resistance (${resistanceLevel}). Confirmed breakout mode.`;
  } else if (isBreakdown) {
    headlineSummary = `${symbol} is -${Math.abs(distToSupportPct).toFixed(2)}% below support (${supportLevel}). Downside breakdown alert.`;
  } else {
    headlineSummary = `Distance: +${distToResistancePct.toFixed(2)}% to Resistance (${resistanceLevel}) | -${distToSupportPct.toFixed(2)}% to Support (${supportLevel}).`;
  }

  return {
    currentPrice,
    supportLevel,
    resistanceLevel,
    atr: validAtr,
    alertThresholdPct: validThreshold,
    symbol,
    distToResistanceAbs,
    distToResistancePct,
    distToSupportAbs,
    distToSupportPct,
    rangeSpanAbs,
    rangeSpanPct,
    positionInRangePct,
    distToResistanceAtr,
    distToSupportAtr,
    rangeSpanAtr,
    status,
    isBreakout,
    isBreakdown,
    isAlertTriggered,
    statusLabel,
    headlineSummary,
  };
}
