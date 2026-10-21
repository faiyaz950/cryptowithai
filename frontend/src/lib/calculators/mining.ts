/**
 * Crypto Mining Profitability Calculator — pure math.
 *
 * Logic:
 *   Daily Electricity Cost = (Power Watts / 1000) × 24 × Electricity Rate ($/kWh)
 *   Daily Mining Revenue   = Estimated Coins Mined per Day × Coin Price
 *   Daily Profit           = Daily Revenue - Daily Electricity Cost - Pool Fees
 *   Break-even Period      = Hardware Cost / Daily Net Profit
 */

export interface MiningPreset {
  id: string;
  name: string;
  coin: string;
  hashrateTh: number;
  powerWatts: number;
  hardwareCost: number;
  dailyCoinsPerTh: number;
  coinPrice: number;
}

export const MINING_PRESETS: MiningPreset[] = [
  {
    id: "antminer_s21",
    name: "Antminer S21 (Bitcoin)",
    coin: "BTC",
    hashrateTh: 200,
    powerWatts: 3500,
    hardwareCost: 4800,
    dailyCoinsPerTh: 0.00000078, // ~0.000156 BTC/day for 200 TH/s
    coinPrice: 66500,
  },
  {
    id: "whatsminer_m50",
    name: "Whatsminer M50 (Bitcoin)",
    coin: "BTC",
    hashrateTh: 120,
    powerWatts: 3480,
    hardwareCost: 2800,
    dailyCoinsPerTh: 0.00000078,
    coinPrice: 66500,
  },
  {
    id: "antminer_l7",
    name: "Antminer L7 (Litecoin/Doge Scrypt)",
    coin: "LTC/DOGE",
    hashrateTh: 9.05, // 9.05 GH/s normalized
    powerWatts: 3260,
    hardwareCost: 5200,
    dailyCoinsPerTh: 0.026,
    coinPrice: 68,
  },
];

export interface MiningInput {
  hashrate: number; // in TH/s
  powerWatts: number;
  electricityRateKwh: number; // e.g. 0.06 $/kWh
  poolFeePct?: number; // e.g. 1.5%
  hardwareCost?: number; // e.g. 4000 $
  dailyCoinsMined?: number;
  coinPrice: number;
}

export interface MiningResult {
  hashrate: number;
  powerWatts: number;
  dailyKwh: number;
  monthlyKwh: number;
  electricityRateKwh: number;
  dailyElectricityCost: number;
  monthlyElectricityCost: number;
  dailyCoinsMined: number;
  coinPrice: number;
  dailyRevenue: number;
  monthlyRevenue: number;
  poolFeePct: number;
  dailyPoolFee: number;
  dailyNetProfit: number;
  monthlyNetProfit: number;
  yearlyNetProfit: number;
  hardwareCost: number;
  paybackDays: number | null;
  paybackMonths: number | null;
  annualRoiPct: number | null;
  isProfitable: boolean;
}

export type MiningOutcome = { ok: true; result: MiningResult } | { ok: false; error: string };

export function computeMining(input: MiningInput): MiningOutcome | null {
  const {
    hashrate,
    powerWatts,
    electricityRateKwh,
    poolFeePct = 1.5,
    hardwareCost = 0,
    dailyCoinsMined: customDailyCoins,
    coinPrice,
  } = input;

  if (
    !Number.isFinite(hashrate) ||
    !Number.isFinite(powerWatts) ||
    !Number.isFinite(electricityRateKwh) ||
    !Number.isFinite(coinPrice)
  ) {
    return null;
  }

  if (hashrate <= 0) return { ok: false, error: "Hashrate 0 se zyada hona chahiye." };
  if (powerWatts < 0) return { ok: false, error: "Power consumption negative nahi ho sakti." };
  if (electricityRateKwh < 0) return { ok: false, error: "Electricity rate negative nahi ho sakti." };
  if (coinPrice <= 0) return { ok: false, error: "Coin price 0 se zyada honi chahiye." };

  const dailyKwh = (powerWatts / 1000) * 24;
  const monthlyKwh = dailyKwh * 30.5;
  const dailyElectricityCost = dailyKwh * electricityRateKwh;
  const monthlyElectricityCost = monthlyKwh * electricityRateKwh;

  // If dailyCoinsMined not provided, use baseline estimated BTC rate per TH/s
  const dailyCoins =
    Number.isFinite(customDailyCoins) && (customDailyCoins as number) > 0
      ? (customDailyCoins as number)
      : hashrate * 0.00000078;

  const dailyRevenue = dailyCoins * coinPrice;
  const monthlyRevenue = dailyRevenue * 30.5;

  const pf = Math.max(0, poolFeePct) / 100;
  const dailyPoolFee = dailyRevenue * pf;

  const dailyNetProfit = dailyRevenue - dailyElectricityCost - dailyPoolFee;
  const monthlyNetProfit = dailyNetProfit * 30.5;
  const yearlyNetProfit = dailyNetProfit * 365;

  const isProfitable = dailyNetProfit > 0;

  let paybackDays: number | null = null;
  let paybackMonths: number | null = null;
  let annualRoiPct: number | null = null;

  if (hardwareCost > 0) {
    if (dailyNetProfit > 0) {
      paybackDays = Math.ceil(hardwareCost / dailyNetProfit);
      paybackMonths = Number((paybackDays / 30.5).toFixed(1));
      annualRoiPct = (yearlyNetProfit / hardwareCost) * 100;
    }
  }

  return {
    ok: true,
    result: {
      hashrate,
      powerWatts,
      dailyKwh,
      monthlyKwh,
      electricityRateKwh,
      dailyElectricityCost,
      monthlyElectricityCost,
      dailyCoinsMined: dailyCoins,
      coinPrice,
      dailyRevenue,
      monthlyRevenue,
      poolFeePct,
      dailyPoolFee,
      dailyNetProfit,
      monthlyNetProfit,
      yearlyNetProfit,
      hardwareCost,
      paybackDays,
      paybackMonths,
      annualRoiPct,
      isProfitable,
    },
  };
}
