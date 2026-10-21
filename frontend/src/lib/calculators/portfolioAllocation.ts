/**
 * Portfolio Allocation Calculator — Pure Math Engine.
 *
 *   Asset Amount = Total Capital × (Allocation % ÷ 100)
 *
 * Validation:
 *   Total Allocation must equal 100%.
 *
 * Example from spec:
 *   Total Capital = 100,000
 *   BTC = 50% -> 50,000
 *   ETH = 30% -> 30,000
 *   SOL = 20% -> 20,000
 *   Total Allocation = 100%
 */

export interface AssetAllocationItem {
  id: string;
  name: string;
  pct: number;
  amount: number;
}

export interface PortfolioAllocationInput {
  totalCapital: number;
  assets: Array<{ id: string; name: string; pct: number }>;
}

export interface PortfolioAllocationResult {
  totalCapital: number;
  totalAllocatedPct: number;
  totalAllocatedAmount: number;
  unallocatedPct: number;
  unallocatedAmount: number;
  isValid: boolean;
  validationError: string | null;
  items: AssetAllocationItem[];
}

export type PortfolioAllocationOutcome =
  | { ok: true; result: PortfolioAllocationResult }
  | { ok: false; error: string };

export function computePortfolioAllocation(
  i: PortfolioAllocationInput,
): PortfolioAllocationOutcome | null {
  const { totalCapital, assets } = i;

  if (!Number.isFinite(totalCapital)) return null;
  if (totalCapital <= 0) return { ok: false, error: "Total capital 0 se bada hona chahiye." };

  const validAssets = assets.filter((a) => a.name.trim() !== "");
  if (validAssets.length === 0) {
    return { ok: false, error: "Kam se kam ek asset ka naam aur percentage hona chahiye." };
  }

  let totalAllocatedPct = 0;
  for (const a of validAssets) {
    const p = Number.isFinite(a.pct) ? a.pct : 0;
    if (p < 0) return { ok: false, error: `${a.name || "Asset"} ki allocation negative nahi ho sakti.` };
    totalAllocatedPct += p;
  }

  // Rounded to 2 decimals to avoid floating point issues (e.g. 99.999999999999)
  totalAllocatedPct = Math.round(totalAllocatedPct * 100) / 100;
  const isExact100 = Math.abs(totalAllocatedPct - 100) < 0.01;

  let validationError: string | null = null;
  if (!isExact100) {
    if (totalAllocatedPct < 100) {
      validationError = `Allocation must equal 100%. Abhi kul ${totalAllocatedPct}% hai (${(100 - totalAllocatedPct).toFixed(1)}% unallocated hai).`;
    } else {
      validationError = `Allocation must equal 100%. Abhi kul ${totalAllocatedPct}% hai (${(totalAllocatedPct - 100).toFixed(1)}% limit se zyada hai).`;
    }
  }

  const items: AssetAllocationItem[] = validAssets.map((a) => {
    const p = Number.isFinite(a.pct) ? a.pct : 0;
    const amount = totalCapital * (p / 100);
    return {
      id: a.id,
      name: a.name.toUpperCase().trim() || "ASSET",
      pct: p,
      amount,
    };
  });

  const totalAllocatedAmount = (totalCapital * totalAllocatedPct) / 100;
  const unallocatedAmount = totalCapital - totalAllocatedAmount;
  const unallocatedPct = 100 - totalAllocatedPct;

  return {
    ok: true,
    result: {
      totalCapital,
      totalAllocatedPct,
      totalAllocatedAmount,
      unallocatedPct,
      unallocatedAmount,
      isValid: isExact100,
      validationError,
      items,
    },
  };
}
