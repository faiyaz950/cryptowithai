/**
 * Crypto Grid Bot Profitability Calculator — pure math.
 *
 * Purpose: Grid trading strategy ke potential profit, fees, spacing aur breakeven ko estimate karna.
 *
 * Types:
 *   - Arithmetic: Fixed dollar price difference between each level
 *   - Geometric: Fixed percentage price difference between each level
 */

export type GridType = "arithmetic" | "geometric";

export interface GridBotInput {
  lowerPrice: number;
  upperPrice: number;
  gridLevels: number;
  investmentAmount: number;
  feePct: number; // maker/taker fee per trade % (e.g. 0.075%)
  gridType?: GridType;
  cyclesPerDay?: number; // estimated completed buy-sell cycles per day
}

export interface GridBotResult {
  lowerPrice: number;
  upperPrice: number;
  gridLevels: number;
  gridIntervals: number; // levels - 1
  gridType: GridType;
  investmentAmount: number;
  allocationPerGrid: number;
  feePct: number;
  gridSpacingDollar: number; // arithmetic spacing or average spacing
  gridSpacingPct: number; // fixed for geometric, average for arithmetic
  priceLevels: number[];
  grossProfitPerCycle: number;
  grossProfitPctPerCycle: number;
  tradingFeesPerCycle: number;
  netProfitPerCycle: number;
  netProfitPctPerCycle: number;
  breakevenCyclesForFullCapital: number;
  cyclesPerDay: number;
  dailyProjectedProfit: number;
  monthlyProjectedProfit: number;
  projectedAprPct: number;
  isProfitablePerCycle: boolean;
}

export type GridBotOutcome =
  | { ok: true; result: GridBotResult }
  | { ok: false; error: string };

export function computeGridBot(input: GridBotInput): GridBotOutcome | null {
  const {
    lowerPrice,
    upperPrice,
    gridLevels,
    investmentAmount,
    feePct = 0.075,
    gridType = "arithmetic",
    cyclesPerDay = 5,
  } = input;

  if (
    !Number.isFinite(lowerPrice) ||
    !Number.isFinite(upperPrice) ||
    !Number.isFinite(gridLevels) ||
    !Number.isFinite(investmentAmount)
  ) {
    return null;
  }

  if (lowerPrice <= 0) return { ok: false, error: "Lower price 0 se badi honi chahiye." };
  if (upperPrice <= lowerPrice) {
    return { ok: false, error: "Upper price lower price se zyada honi chahiye." };
  }
  if (gridLevels < 2 || gridLevels > 200) {
    return { ok: false, error: "Grid levels 2 se 200 ke beech hone chahiye." };
  }
  if (investmentAmount <= 0) {
    return { ok: false, error: "Investment amount 0 se bada hona chahiye." };
  }

  const intervals = gridLevels - 1;
  const allocationPerGrid = investmentAmount / intervals;
  const priceLevels: number[] = [];

  let gridSpacingDollar = 0;
  let gridSpacingPct = 0;

  if (gridType === "geometric") {
    // Geometric: P_k = Lower * ratio^k
    const ratio = Math.pow(upperPrice / lowerPrice, 1 / intervals);
    gridSpacingPct = (ratio - 1) * 100;
    for (let k = 0; k < gridLevels; k++) {
      priceLevels.push(lowerPrice * Math.pow(ratio, k));
    }
    gridSpacingDollar = (upperPrice - lowerPrice) / intervals;
  } else {
    // Arithmetic: P_k = Lower + k * spacing
    gridSpacingDollar = (upperPrice - lowerPrice) / intervals;
    for (let k = 0; k < gridLevels; k++) {
      priceLevels.push(lowerPrice + k * gridSpacingDollar);
    }
    const midPrice = (lowerPrice + upperPrice) / 2;
    gridSpacingPct = (gridSpacingDollar / midPrice) * 100;
  }

  // Profit per cycle: Buy at level k, Sell at level k+1
  // Average return % across grid
  const avgProfitPct = gridSpacingPct;
  const grossProfitPerCycle = allocationPerGrid * (avgProfitPct / 100);

  // Roundtrip fees:
  // Buy Fee = Allocation * feeRate
  // Sell Fee = (Allocation + GrossProfit) * feeRate
  const feeRate = Math.max(0, feePct) / 100;
  const buyFee = allocationPerGrid * feeRate;
  const sellFee = (allocationPerGrid + grossProfitPerCycle) * feeRate;
  const tradingFeesPerCycle = buyFee + sellFee;

  const netProfitPerCycle = grossProfitPerCycle - tradingFeesPerCycle;
  const netProfitPctPerCycle = allocationPerGrid > 0 ? (netProfitPerCycle / allocationPerGrid) * 100 : 0;
  const isProfitablePerCycle = netProfitPerCycle > 0;

  // Cycles required to recover 100% of the invested capital through grid profits alone
  const breakevenCyclesForFullCapital =
    netProfitPerCycle > 0 ? Math.ceil(investmentAmount / netProfitPerCycle) : 0;

  // Frequency projections
  const effectiveCycles = Math.max(0, cyclesPerDay);
  const dailyProjectedProfit = netProfitPerCycle * effectiveCycles;
  const monthlyProjectedProfit = dailyProjectedProfit * 30.5;
  const projectedAprPct =
    investmentAmount > 0 ? ((dailyProjectedProfit * 365) / investmentAmount) * 100 : 0;

  return {
    ok: true,
    result: {
      lowerPrice,
      upperPrice,
      gridLevels,
      gridIntervals: intervals,
      gridType,
      investmentAmount,
      allocationPerGrid,
      feePct,
      gridSpacingDollar,
      gridSpacingPct,
      priceLevels,
      grossProfitPerCycle,
      grossProfitPctPerCycle: avgProfitPct,
      tradingFeesPerCycle,
      netProfitPerCycle,
      netProfitPctPerCycle,
      breakevenCyclesForFullCapital,
      cyclesPerDay: effectiveCycles,
      dailyProjectedProfit,
      monthlyProjectedProfit,
      projectedAprPct,
      isProfitablePerCycle,
    },
  };
}
