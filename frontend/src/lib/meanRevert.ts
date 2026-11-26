/**
 * Mean Revert — revert.py ke tests ka TS port (backend `native_signals.spread_stats` jaisa).
 *
 * Spread = log(close) − OLS trend line (pichhli `lookback` candles). Us par ADF p-value
 * (1 lag, constant + trend, MacKinnon), Hurst exponent, OU half-life aur spread ka z-score.
 * Chart banner aur readouts isi se aate hain; trades backend engine leta hai.
 */

export interface SpreadStats {
  z: number;
  adfP: number;
  hurst: number;
  halfLife: number;
  beta: number;
  /** Trend line ki last value, price me (spread = 0 yahan). */
  meanPrice: number;
  /** Spread ka std, log units me. */
  sd: number;
}

// MacKinnon ADF p-value, constant + trend (statsmodels mackinnonp, regression "ct", N=1).
const T_MAX = 0.7;
const T_MIN = -16.18;
const T_STAR = -2.89;
const SMALLP = [3.2512, 1.6047, 0.049588];
const LARGEP = [2.5261, 0.61654, -0.37956, -0.060285];

function erf(x: number): number {
  // Abramowitz–Stegun 7.1.26
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

export function adfPValue(t: number): number {
  if (!Number.isFinite(t)) return NaN;
  if (t > T_MAX) return 1;
  if (t < T_MIN) return 0;
  const coef = t <= T_STAR ? SMALLP : LARGEP;
  const z = coef.reduce((acc, c, i) => acc + c * t ** i, 0);
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** y ~ X (columns), plain normal equations. Returns coefficients and t-stats. */
function ols(y: number[], cols: number[][]): { coef: number[]; t: number[] } {
  const k = cols.length;
  const n = y.length;
  const xtx = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  for (let r = 0; r < n; r++) {
    for (let i = 0; i < k; i++) {
      xty[i] += cols[i][r] * y[r];
      for (let j = 0; j < k; j++) xtx[i][j] += cols[i][r] * cols[j][r];
    }
  }
  const inv = invert(xtx);
  if (!inv) return { coef: new Array(k).fill(NaN), t: new Array(k).fill(NaN) };
  const coef = inv.map((row) => row.reduce((acc, v, j) => acc + v * xty[j], 0));
  let ss = 0;
  for (let r = 0; r < n; r++) {
    let fit = 0;
    for (let i = 0; i < k; i++) fit += coef[i] * cols[i][r];
    ss += (y[r] - fit) ** 2;
  }
  const s2 = n > k ? ss / (n - k) : NaN;
  const t = coef.map((c, i) => c / Math.sqrt(Math.max(0, s2 * inv[i][i])));
  return { coef, t };
}

function invert(m: number[][]): number[][] | null {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
    if (Math.abs(a[piv][c]) < 1e-12) return null;
    [a[c], a[piv]] = [a[piv], a[c]];
    const d = a[c][c];
    for (let j = 0; j < 2 * n; j++) a[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c];
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((row) => row.slice(n));
}

function std(values: number[], ddof = 0): number {
  const n = values.length;
  if (n - ddof <= 0) return NaN;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - ddof));
}

/** std(x[t+lag] − x[t]) ∝ lag^H. revert.py ka sqrt nahi — seedha std, taaki 0.5 = random walk. */
export function hurst(x: number[]): number {
  // Lags 2..n/8 (max 100), backend `_hurst_lags` jaisa — chhoti window me n/2 tak ke lag H ko neeche kheenchte.
  const maxLag = Math.max(8, Math.min(100, Math.floor(x.length / 8)));
  const lx: number[] = [];
  const ly: number[] = [];
  for (let lag = 2; lag < maxLag; lag++) {
    const d: number[] = [];
    for (let i = lag; i < x.length; i++) d.push(x[i] - x[i - lag]);
    const s = std(d);
    if (s > 0) {
      lx.push(Math.log(lag));
      ly.push(Math.log(s));
    }
  }
  if (lx.length < 3) return NaN;
  const mx = lx.reduce((a, b) => a + b, 0) / lx.length;
  const my = ly.reduce((a, b) => a + b, 0) / ly.length;
  let num = 0;
  let den = 0;
  lx.forEach((v, i) => {
    num += (v - mx) * (ly[i] - my);
    den += (v - mx) ** 2;
  });
  return num / den;
}

/** Ek window (log prices) par trend line — slope, last fitted value, spread. */
function detrend(s: number[]) {
  const n = s.length;
  const tm = (n - 1) / 2;
  const sm = s.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - tm) * (s[i] - sm);
    den += (i - tm) ** 2;
  }
  const beta = num / den;
  const res = s.map((v, i) => v - (sm + beta * (i - tm)));
  return { beta, last: sm + beta * (n - 1 - tm), res };
}

export function spreadStats(logPx: number[]): SpreadStats {
  const { beta, last, res } = detrend(logPx);
  const sd = std(res, 1);
  const z = sd > 0 ? res[res.length - 1] / sd : NaN;
  const ds = res.slice(1).map((v, i) => v - res[i]);
  // ADF: Δx_t = c + δ·t + γ·x_{t−1} + φ·Δx_{t−1} on log price (trend term = trend line).
  const dx = logPx.slice(1).map((v, i) => v - logPx[i]);
  const y = dx.slice(1);
  const adf = ols(y, [y.map(() => 1), y.map((_, i) => i + 2), logPx.slice(1, -1), dx.slice(0, -1)]);
  const ou = ols(ds, [ds.map(() => 1), res.slice(0, -1)]);
  const lam = ou.coef[1];
  return {
    z,
    adfP: adfPValue(adf.t[2]),
    hurst: hurst(logPx),
    halfLife: lam < 0 ? -Math.LN2 / lam : Infinity,
    beta,
    meanPrice: Math.exp(last),
    sd,
  };
}

/** Har candle ke liye trend line aur ±z band (price me) — chart overlay. */
export function meanRevertBands(closes: number[], lookback: number, entryZ: number) {
  const mid = new Array<number>(closes.length).fill(NaN);
  const upper = new Array<number>(closes.length).fill(NaN);
  const lower = new Array<number>(closes.length).fill(NaN);
  const lp = closes.map((c) => Math.log(c));
  for (let k = lookback - 1; k < closes.length; k++) {
    const { last, res } = detrend(lp.slice(k - lookback + 1, k + 1));
    const sd = std(res, 1);
    mid[k] = Math.exp(last);
    upper[k] = Math.exp(last + entryZ * sd);
    lower[k] = Math.exp(last - entryZ * sd);
  }
  return { mid, upper, lower };
}
