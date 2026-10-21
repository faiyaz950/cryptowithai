/**
 * Max Drawdown Calculator
 * Peak-to-trough calculation for backtesting & portfolio analytics.
 *
 * Formula:
 * Drawdown % = (Peak - Current Equity) / Peak * 100
 * Max Drawdown = maximum historical drawdown from peak to subsequent trough
 */

export interface MaxDrawdownPoint {
  step: number;
  equity: number;
  peak: number;
  drawdownAmount: number;
  drawdownPct: number;
  isPeak: boolean;
  isMaxDrawdownTrough: boolean;
}

export interface MaxDrawdownResult {
  initialEquity: number;
  finalEquity: number;
  allTimeHigh: number;
  allTimeHighStep: number;
  maxDrawdownPct: number;
  maxDrawdownAmount: number;
  peakBeforeMaxDD: number;
  peakStep: number;
  troughEquity: number;
  troughStep: number;
  currentDrawdownPct: number;
  currentDrawdownAmount: number;
  isRecovered: boolean;
  recoveryStep?: number;
  gainNeededToRecoverFromMaxDD: number;
  gainNeededToRecoverCurrent: number;
  points: MaxDrawdownPoint[];
  netReturnPct: number;
  netReturnAmount: number;
}

export type MaxDrawdownOutcome =
  | { ok: true; result: MaxDrawdownResult }
  | { ok: false; error: string };

export function parseEquitySeries(text: string): number[] {
  return text
    .split(/[\s,;\n\r\t]+/)
    .map((s) => s.trim().replace(/[$,₹]/g, ""))
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n >= 0);
}

export function computeMaxDrawdown(equitySeries: number[]): MaxDrawdownOutcome | null {
  if (!equitySeries || equitySeries.length === 0) return null;
  if (equitySeries.length < 2) {
    return { ok: false, error: "Drawdown calculate karne ke liye kam se kam 2 equity points hone chahiye." };
  }

  const initialEquity = equitySeries[0];
  if (initialEquity <= 0) {
    return { ok: false, error: "Starting equity 0 se zyada honi chahiye." };
  }

  let runningPeak = equitySeries[0];
  let runningPeakStep = 1;
  let maxDDPct = 0;
  let maxDDAmount = 0;
  let maxPeakVal = runningPeak;
  let maxPeakStep = 1;
  let maxTroughVal = runningPeak;
  let maxTroughStep = 1;

  let allTimeHigh = runningPeak;
  let allTimeHighStep = 1;

  const points: MaxDrawdownPoint[] = [];

  for (let i = 0; i < equitySeries.length; i++) {
    const val = equitySeries[i];
    const step = i + 1;

    let isPeak = false;
    if (val >= runningPeak) {
      runningPeak = val;
      runningPeakStep = step;
      isPeak = true;
    }

    if (val > allTimeHigh) {
      allTimeHigh = val;
      allTimeHighStep = step;
    }

    const ddAmount = runningPeak - val;
    const ddPct = runningPeak > 0 ? (ddAmount / runningPeak) * 100 : 0;

    if (ddPct > maxDDPct) {
      maxDDPct = ddPct;
      maxDDAmount = ddAmount;
      maxPeakVal = runningPeak;
      maxPeakStep = runningPeakStep;
      maxTroughVal = val;
      maxTroughStep = step;
    }

    points.push({
      step,
      equity: val,
      peak: runningPeak,
      drawdownAmount: ddAmount,
      drawdownPct: ddPct,
      isPeak,
      isMaxDrawdownTrough: false,
    });
  }

  if (maxTroughStep >= 1 && maxTroughStep <= points.length) {
    points[maxTroughStep - 1].isMaxDrawdownTrough = true;
  }

  const finalEquity = equitySeries[equitySeries.length - 1];
  const currentDrawdownAmount = runningPeak - finalEquity;
  const currentDrawdownPct = runningPeak > 0 ? (currentDrawdownAmount / runningPeak) * 100 : 0;

  let isRecovered = false;
  let recoveryStep: number | undefined;
  for (let i = maxTroughStep; i < equitySeries.length; i++) {
    if (equitySeries[i] >= maxPeakVal) {
      isRecovered = true;
      recoveryStep = i + 1;
      break;
    }
  }

  const gainNeededToRecoverFromMaxDD =
    maxDDPct >= 100 ? Infinity : maxDDPct > 0 && maxTroughVal > 0 ? ((maxPeakVal - maxTroughVal) / maxTroughVal) * 100 : 0;

  const gainNeededToRecoverCurrent =
    currentDrawdownPct >= 100
      ? Infinity
      : currentDrawdownPct > 0 && finalEquity > 0
        ? ((runningPeak - finalEquity) / finalEquity) * 100
        : 0;

  const netReturnAmount = finalEquity - initialEquity;
  const netReturnPct = (netReturnAmount / initialEquity) * 100;

  return {
    ok: true,
    result: {
      initialEquity,
      finalEquity,
      allTimeHigh,
      allTimeHighStep,
      maxDrawdownPct: maxDDPct,
      maxDrawdownAmount: maxDDAmount,
      peakBeforeMaxDD: maxPeakVal,
      peakStep: maxPeakStep,
      troughEquity: maxTroughVal,
      troughStep: maxTroughStep,
      currentDrawdownPct,
      currentDrawdownAmount,
      isRecovered,
      recoveryStep,
      gainNeededToRecoverFromMaxDD,
      gainNeededToRecoverCurrent,
      points,
      netReturnPct,
      netReturnAmount,
    },
  };
}
