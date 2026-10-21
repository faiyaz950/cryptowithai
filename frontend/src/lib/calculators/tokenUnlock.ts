/**
 * Crypto Token Unlock Dilution Calculator — pure math.
 *
 * Purpose: Upcoming token unlock se circulating supply aur potential dilution ka impact samajhna.
 *
 * Logic:
 *   Current Market Cap = Price × Circulating Supply
 *   New Circulating Supply = Circulating Supply + Unlock Amount
 *   Unlock % of Circulating = Unlock Amount / Circulating Supply × 100
 *   New Circulating Ratio % = New Circulating Supply / Total Supply × 100
 *   Equilibrium Price (Constant Market Cap) = Current Market Cap / New Circulating Supply
 *   Price Drop at Flat MC % = ((Equilibrium Price / Current Price) - 1) × 100
 */

export type UnlockCategory = "investors" | "team" | "ecosystem" | "advisors" | "community";

export interface TokenUnlockPreset {
  id: string;
  symbol: string;
  name: string;
  price: number;
  circulatingSupply: number;
  unlockAmount: number;
  totalSupply: number;
  category: UnlockCategory;
  unlockDateNote: string;
}

export const TOKEN_UNLOCK_PRESETS: TokenUnlockPreset[] = [
  {
    id: "tia",
    symbol: "TIA",
    name: "Celestia",
    price: 5.4,
    circulatingSupply: 220_000_000,
    unlockAmount: 35_000_000,
    totalSupply: 1_060_000_000,
    category: "investors",
    unlockDateNote: "Series A & Seed Investors Cliff",
  },
  {
    id: "arb",
    symbol: "ARB",
    name: "Arbitrum",
    price: 0.58,
    circulatingSupply: 3_600_000_000,
    unlockAmount: 92_650_000,
    totalSupply: 10_000_000_000,
    category: "team",
    unlockDateNote: "Monthly Team & Advisor Unlock",
  },
  {
    id: "sui",
    symbol: "SUI",
    name: "Sui Network",
    price: 1.95,
    circulatingSupply: 2_850_000_000,
    unlockAmount: 64_200_000,
    totalSupply: 10_000_000_000,
    category: "community",
    unlockDateNote: "Community Access & Early Contributors",
  },
  {
    id: "op",
    symbol: "OP",
    name: "Optimism",
    price: 1.62,
    circulatingSupply: 1_250_000_000,
    unlockAmount: 31_340_000,
    totalSupply: 4_294_967_296,
    category: "investors",
    unlockDateNote: "Core Contributors & Investors Tranche",
  },
];

export interface TokenUnlockInput {
  price: number;
  circulatingSupply: number;
  unlockAmount: number;
  totalSupply: number;
  category?: UnlockCategory;
  scenarioPrice?: number; // optional custom target price
}

export type UnlockRiskLevel = "low" | "moderate" | "high" | "severe";

export interface TokenUnlockResult {
  price: number;
  circulatingSupply: number;
  unlockAmount: number;
  totalSupply: number;
  category: UnlockCategory;
  currentMarketCap: number;
  currentFdv: number;
  newCirculatingSupply: number;
  unlockValueDollar: number;
  unlockPctOfCirculating: number; // Unlock / Circulating * 100
  currentCirculatingRatioPct: number; // Circulating / Total * 100
  newCirculatingRatioPct: number; // New Circulating / Total * 100
  dilutionFactor: number; // New Circ / Old Circ
  equilibriumPrice: number; // Price if Market Cap stays exact same
  equilibriumPriceDropPct: number; // Drop % at flat MC
  riskLevel: UnlockRiskLevel;
  riskLevelLabel: string;
  scenarioPrice?: number;
  scenarioMarketCap?: number;
}

export type TokenUnlockOutcome =
  | { ok: true; result: TokenUnlockResult }
  | { ok: false; error: string };

export function computeTokenUnlock(input: TokenUnlockInput): TokenUnlockOutcome | null {
  const {
    price,
    circulatingSupply,
    unlockAmount,
    totalSupply,
    category = "investors",
    scenarioPrice,
  } = input;

  if (
    !Number.isFinite(price) ||
    !Number.isFinite(circulatingSupply) ||
    !Number.isFinite(unlockAmount) ||
    !Number.isFinite(totalSupply)
  ) {
    return null;
  }

  if (price <= 0) return { ok: false, error: "Price 0 se bada hona chahiye." };
  if (circulatingSupply <= 0) return { ok: false, error: "Circulating supply 0 se badi honi chahiye." };
  if (unlockAmount <= 0) return { ok: false, error: "Unlock amount 0 se bada hona chahiye." };
  if (totalSupply < circulatingSupply) {
    return { ok: false, error: "Total supply circulating supply se kam nahi ho sakti." };
  }

  const currentMarketCap = price * circulatingSupply;
  const currentFdv = price * totalSupply;
  const newCirculatingSupply = circulatingSupply + unlockAmount;
  const unlockValueDollar = unlockAmount * price;

  const unlockPctOfCirculating = (unlockAmount / circulatingSupply) * 100;
  const currentCirculatingRatioPct = (circulatingSupply / totalSupply) * 100;
  const newCirculatingRatioPct = (newCirculatingSupply / totalSupply) * 100;

  const dilutionFactor = newCirculatingSupply / circulatingSupply;
  const equilibriumPrice = currentMarketCap / newCirculatingSupply;
  const equilibriumPriceDropPct = ((equilibriumPrice - price) / price) * 100;

  let riskLevel: UnlockRiskLevel = "moderate";
  let riskLevelLabel = "Moderate Dilution (3% – 8%)";

  if (unlockPctOfCirculating < 3) {
    riskLevel = "low";
    riskLevelLabel = "Low Impact (< 3% of Circulating Supply)";
  } else if (unlockPctOfCirculating <= 8) {
    riskLevel = "moderate";
    riskLevelLabel = "Moderate Impact (3% – 8% of Circulating Supply)";
  } else if (unlockPctOfCirculating <= 15) {
    riskLevel = "high";
    riskLevelLabel = "High Dilution Pressure (8% – 15% of Circulating Supply)";
  } else {
    riskLevel = "severe";
    riskLevelLabel = "Severe Dilution Shock (> 15% of Circulating Supply)";
  }

  let scenarioMarketCap: number | undefined;
  if (Number.isFinite(scenarioPrice) && (scenarioPrice as number) > 0) {
    scenarioMarketCap = (scenarioPrice as number) * newCirculatingSupply;
  }

  return {
    ok: true,
    result: {
      price,
      circulatingSupply,
      unlockAmount,
      totalSupply,
      category,
      currentMarketCap,
      currentFdv,
      newCirculatingSupply,
      unlockValueDollar,
      unlockPctOfCirculating,
      currentCirculatingRatioPct,
      newCirculatingRatioPct,
      dilutionFactor,
      equilibriumPrice,
      equilibriumPriceDropPct,
      riskLevel,
      riskLevelLabel,
      scenarioPrice,
      scenarioMarketCap,
    },
  };
}
