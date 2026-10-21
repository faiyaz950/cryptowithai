/**
 * Crypto Correlation Calculator — pure math.
 *
 * Purpose: BTC, ETH, SOL jaise coins ke price movements kitne similar hain, ye measure karna.
 *
 * Formula:
 *   Pearson correlation coefficient r:
 *   r = Cov(Return A, Return B) / (StdDev A × StdDev B)
 *
 * Range:
 *   -1.0 (perfect inverse) to +1.0 (perfect sync)
 */

export interface CorrelationPreset {
  id: string;
  coinA: string;
  coinB: string;
  name: string;
  typicalCorrelation: number;
  pricesA: number[];
  pricesB: number[];
}

export const CORRELATION_PRESETS: CorrelationPreset[] = [
  {
    id: "btc-eth",
    coinA: "BTC",
    coinB: "ETH",
    name: "BTC vs ETH (Market Leaders)",
    typicalCorrelation: 0.86,
    pricesA: [62000, 63100, 62800, 64500, 64100, 65600, 65200, 66800, 65900, 67200, 66800, 68100],
    pricesB: [3150, 3230, 3190, 3320, 3280, 3420, 3380, 3510, 3440, 3560, 3520, 3630],
  },
  {
    id: "btc-sol",
    coinA: "BTC",
    coinB: "SOL",
    name: "BTC vs SOL (Layer-1 Beta)",
    typicalCorrelation: 0.76,
    pricesA: [62000, 63100, 62800, 64500, 64100, 65600, 65200, 66800, 65900, 67200, 66800, 68100],
    pricesB: [134, 142, 138, 151, 146, 162, 155, 171, 163, 178, 172, 185],
  },
  {
    id: "btc-doge",
    coinA: "BTC",
    coinB: "DOGE",
    name: "BTC vs DOGE (Meme Divergence)",
    typicalCorrelation: 0.58,
    pricesA: [62000, 63100, 62800, 64500, 64100, 65600, 65200, 66800, 65900, 67200, 66800, 68100],
    pricesB: [0.110, 0.119, 0.113, 0.132, 0.122, 0.141, 0.134, 0.155, 0.142, 0.158, 0.149, 0.165],
  },
  {
    id: "eth-usdt",
    coinA: "ETH",
    coinB: "USDT",
    name: "ETH vs Stablecoin (Uncorrelated)",
    typicalCorrelation: 0.02,
    pricesA: [3150, 3230, 3190, 3320, 3280, 3420, 3380, 3510, 3440, 3560, 3520, 3630],
    pricesB: [1.0001, 0.9998, 1.0002, 0.9999, 1.0001, 1.0000, 0.9998, 1.0002, 1.0000, 0.9999, 1.0001, 1.0000],
  },
];

export interface CorrelationInput {
  coinA: string;
  coinB: string;
  pricesA: number[];
  pricesB: number[];
}

export type CorrelationRelationship =
  | "perfect_positive"
  | "strong_positive"
  | "moderate_positive"
  | "weak"
  | "moderate_negative"
  | "strong_negative"
  | "perfect_negative";

export interface CorrelationResult {
  coinA: string;
  coinB: string;
  dataPointsCount: number;
  returnsA: number[];
  returnsB: number[];
  correlation: number; // r: -1 to +1
  rSquaredPct: number; // r^2 * 100
  relationship: CorrelationRelationship;
  relationshipLabel: string;
  diversificationBenefit: "high" | "moderate" | "low";
  stdDevA: number;
  stdDevB: number;
  betaAtoB: number; // Beta of A relative to B
}

export type CorrelationOutcome =
  | { ok: true; result: CorrelationResult }
  | { ok: false; error: string };

export function computeCorrelation(input: CorrelationInput): CorrelationOutcome | null {
  const { coinA, coinB, pricesA, pricesB } = input;

  if (!pricesA || !pricesB || pricesA.length < 3 || pricesB.length < 3) {
    return { ok: false, error: "Dono coins ke kam se kam 3 price points hone chahiye." };
  }

  const length = Math.min(pricesA.length, pricesB.length);
  const pA = pricesA.slice(pricesA.length - length);
  const pB = pricesB.slice(pricesB.length - length);

  if (pA.some((p) => !Number.isFinite(p) || p <= 0) || pB.some((p) => !Number.isFinite(p) || p <= 0)) {
    return { ok: false, error: "Price values valid positive numbers hone chahiye." };
  }

  // Calculate percentage returns
  const returnsA: number[] = [];
  const returnsB: number[] = [];

  for (let i = 1; i < length; i++) {
    const retA = ((pA[i] - pA[i - 1]) / pA[i - 1]) * 100;
    const retB = ((pB[i] - pB[i - 1]) / pB[i - 1]) * 100;
    returnsA.push(retA);
    returnsB.push(retB);
  }

  const n = returnsA.length;
  if (n < 2) {
    return { ok: false, error: "Correlation ke liye minimum 2 return intervals chahiye." };
  }

  const meanA = returnsA.reduce((sum, r) => sum + r, 0) / n;
  const meanB = returnsB.reduce((sum, r) => sum + r, 0) / n;

  let sumDiffProduct = 0;
  let sumSqDiffA = 0;
  let sumSqDiffB = 0;

  for (let i = 0; i < n; i++) {
    const diffA = returnsA[i] - meanA;
    const diffB = returnsB[i] - meanB;
    sumDiffProduct += diffA * diffB;
    sumSqDiffA += diffA * diffA;
    sumSqDiffB += diffB * diffB;
  }

  const stdDevA = Math.sqrt(sumSqDiffA / (n - 1));
  const stdDevB = Math.sqrt(sumSqDiffB / (n - 1));

  let correlation = 0;
  const denominator = Math.sqrt(sumSqDiffA * sumSqDiffB);
  if (denominator > 0) {
    correlation = sumDiffProduct / denominator;
  }

  // Clamp -1 to 1 for numerical precision safety
  correlation = Math.max(-1, Math.min(1, correlation));

  const rSquaredPct = Math.pow(correlation, 2) * 100;

  // Beta = Cov(A, B) / Var(B)
  const covariance = sumDiffProduct / (n - 1);
  const varianceB = sumSqDiffB / (n - 1);
  const betaAtoB = varianceB > 0 ? covariance / varianceB : 0;

  let relationship: CorrelationRelationship = "weak";
  let relationshipLabel = "Weak / Uncorrelated (-0.30 to +0.30)";
  let diversificationBenefit: "high" | "moderate" | "low" = "moderate";

  if (correlation >= 0.85) {
    relationship = "perfect_positive";
    relationshipLabel = "Very Strong Positive (+0.85 to +1.00)";
    diversificationBenefit = "low";
  } else if (correlation >= 0.60) {
    relationship = "strong_positive";
    relationshipLabel = "Strong Positive (+0.60 to +0.84)";
    diversificationBenefit = "low";
  } else if (correlation >= 0.30) {
    relationship = "moderate_positive";
    relationshipLabel = "Moderate Positive (+0.30 to +0.59)";
    diversificationBenefit = "moderate";
  } else if (correlation > -0.30) {
    relationship = "weak";
    relationshipLabel = "Weak / Uncorrelated (-0.29 to +0.29)";
    diversificationBenefit = "high";
  } else if (correlation > -0.60) {
    relationship = "moderate_negative";
    relationshipLabel = "Moderate Inverse (-0.30 to -0.59)";
    diversificationBenefit = "high";
  } else {
    relationship = "strong_negative";
    relationshipLabel = "Strong Inverse / Hedge (-0.60 to -1.00)";
    diversificationBenefit = "high";
  }

  return {
    ok: true,
    result: {
      coinA,
      coinB,
      dataPointsCount: length,
      returnsA,
      returnsB,
      correlation,
      rSquaredPct,
      relationship,
      relationshipLabel,
      diversificationBenefit,
      stdDevA,
      stdDevB,
      betaAtoB,
    },
  };
}
