/**
 * Position size calculator — pure math.
 *
 *   Risk amount   = Balance × Risk%
 *   Risk per unit = |Entry − Stop|
 *   Quantity      = Risk amount ÷ Risk per unit
 *
 * Fee aur slippage de diye hon to wo stop-loss par hone wale loss mein jud jate hain
 * (entry aur stop dono fill par, nuksaan ki taraf), isliye total loss phir bhi risk
 * amount ke andar rehta hai. Leverage yahan sirf margin badalta hai — quantity ya loss nahi.
 */

export interface PositionSizeInput {
  balance: number;
  riskPct: number;
  entry: number;
  stopLoss: number;
  /** Per side, % mein. Optional — 0. */
  feePct: number;
  /** Har fill par nuksaan ki taraf, % mein. Optional — 0. */
  slippagePct: number;
  /** Optional — sirf margin dikhane ke liye. NaN / 0 = nahi diya. */
  leverage: number;
}

export interface PositionSizeResult {
  side: "long" | "short";
  riskAmount: number;
  /** |Entry − Stop| */
  riskPerUnit: number;
  /** Fee + slippage jod kar — quantity isi se nikalti hai. Costs 0 ho to riskPerUnit ke barabar. */
  effectiveRiskPerUnit: number;
  quantity: number;
  /** Entry × Quantity */
  positionValue: number;
  positionPct: number;
  stopDistancePct: number;
  feesAtStop: number;
  slippageAtStop: number;
  /** Position value ÷ balance — isse kam leverage par poori position nahi khulegi. */
  minLeverage: number;
  margin: number | null;
  marginPctOfBalance: number | null;
  /** Diye leverage par margin balance se bada hai. */
  marginExceedsBalance: boolean;
}

export type PositionSizeOutcome =
  | { ok: true; result: PositionSizeResult }
  | { ok: false; error: string };

/** null = abhi input poora nahi (UI kuch nahi dikhata); ok:false = galat input, wajah ke saath. */
export function computePositionSize(i: PositionSizeInput): PositionSizeOutcome | null {
  const { balance, riskPct, entry, stopLoss, feePct, slippagePct, leverage } = i;
  if (![balance, riskPct, entry, stopLoss].every(Number.isFinite)) return null;
  if (!Number.isFinite(feePct) || !Number.isFinite(slippagePct)) return { ok: false, error: "Fee aur slippage number hone chahiye." };

  if (balance <= 0) return { ok: false, error: "Account balance 0 se bada hona chahiye." };
  if (riskPct <= 0 || riskPct > 100) return { ok: false, error: "Risk % 0 se bada aur 100 se kam ya barabar hona chahiye." };
  if (entry <= 0 || stopLoss <= 0) return { ok: false, error: "Entry aur stop loss price 0 se bade hone chahiye." };
  if (entry === stopLoss) return { ok: false, error: "Stop loss entry ke barabar nahi ho sakta — risk per unit 0 ho jayega." };
  if (feePct < 0 || slippagePct < 0) return { ok: false, error: "Fee aur slippage negative nahi ho sakte." };
  if (feePct >= 100) return { ok: false, error: "Fee 100% se kam hona chahiye." };

  const side = stopLoss < entry ? "long" : "short";
  const f = feePct / 100;
  const s = slippagePct / 100;
  // Long: mehnga kharidna, sasta bechna. Short: ulta.
  const fillEntry = side === "long" ? entry * (1 + s) : entry * (1 - s);
  const fillStop = side === "long" ? stopLoss * (1 - s) : stopLoss * (1 + s);

  const riskAmount = (balance * riskPct) / 100;
  const riskPerUnit = Math.abs(entry - stopLoss);
  const feePerUnit = f * (fillEntry + fillStop);
  const slipPerUnit = Math.abs(fillEntry - entry) + Math.abs(fillStop - stopLoss);
  const effectiveRiskPerUnit = Math.abs(fillEntry - fillStop) + feePerUnit;
  if (!(effectiveRiskPerUnit > 0)) return { ok: false, error: "Risk per unit nikal nahi paya — inputs check karein." };

  const quantity = riskAmount / effectiveRiskPerUnit;
  const positionValue = quantity * entry;
  const hasLev = Number.isFinite(leverage) && leverage > 0;
  const margin = hasLev ? positionValue / leverage : null;

  return {
    ok: true,
    result: {
      side,
      riskAmount,
      riskPerUnit,
      effectiveRiskPerUnit,
      quantity,
      positionValue,
      positionPct: (positionValue / balance) * 100,
      stopDistancePct: (riskPerUnit / entry) * 100,
      feesAtStop: quantity * feePerUnit,
      slippageAtStop: quantity * slipPerUnit,
      minLeverage: positionValue / balance,
      margin,
      marginPctOfBalance: margin == null ? null : (margin / balance) * 100,
      marginExceedsBalance: margin != null && margin > balance,
    },
  };
}
