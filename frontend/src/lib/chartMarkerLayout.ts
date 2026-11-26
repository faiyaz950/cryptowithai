/**
 * Chart marks ke label text ki jagah. Mark ka text lightweight-charts mark ke beech mein
 * likhta hai — 4h jaise bade timeframe par candle ~25px chaudi aur label ~150px lamba, to
 * bagal ki candles ke label ek doosre par chadh jaate the. Yahan bheed wali candle ka text
 * hata dete hain (gola / square rehta hai) aur hover par legend mein poora likh dete hain.
 */

export interface LaidMarker {
  /** Unix seconds — chart ki candle ka time. */
  time: number;
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  text?: string;
}

/** Do label ke beech kam se kam itni khaali jagah (px). */
const LABEL_GAP = 10;

/**
 * Har lane (candle ke upar / neeche) mein naye se purane ki taraf chalo: label tabhi likho jab
 * pichhle likhe label se itni door ho ki dono na takrayein. Taaza trade ka label pehle jagah
 * paata hai. Ek candle ke ek lane ke saare marks ek saath — ya sab ka text, ya kisi ka nahi.
 */
export function declutterMarkers<T extends LaidMarker>(
  list: T[],
  barIndex: ReadonlyMap<number, number>,
  spacingPx: number,
  textWidth: (text: string) => number,
): T[] {
  const lanes = new Map<string, Map<number, number>>();
  for (const m of list) {
    if (!m.text) continue;
    const idx = barIndex.get(m.time);
    if (idx == null) continue;
    const lane = lanes.get(m.position) ?? new Map<number, number>();
    lane.set(idx, Math.max(lane.get(idx) ?? 0, textWidth(m.text)));
    lanes.set(m.position, lane);
  }
  const hidden = new Set<string>();
  for (const [position, bars] of lanes) {
    let lastIdx: number | null = null;
    let lastW = 0;
    for (const idx of [...bars.keys()].sort((a, b) => b - a)) {
      const w = bars.get(idx) ?? 0;
      if (lastIdx == null || (lastIdx - idx) * spacingPx >= lastW / 2 + w / 2 + LABEL_GAP) {
        lastIdx = idx;
        lastW = w;
      } else {
        hidden.add(`${position}|${idx}`);
      }
    }
  }
  if (!hidden.size) return list;
  return list.map((m) => {
    const idx = barIndex.get(m.time);
    return m.text && idx != null && hidden.has(`${m.position}|${idx}`) ? { ...m, text: undefined } : m;
  });
}

/** Candle ka time (ms, sorted) jiske andar `t` (ms) aata hai; pehli candle se pehle ho to null. */
export function snapToBar(barTimesMs: number[], t: number): number | null {
  if (!barTimesMs.length || t < barTimesMs[0]) return null;
  let lo = 0;
  let hi = barTimesMs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (barTimesMs[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return barTimesMs[lo];
}

/** Hover legend ke liye: candle (unix seconds) → us par ke label, poore text ke saath. */
export function markerTextsByBar(
  markers: { time: number; color: string; text?: string }[],
  barTimesMs: number[],
): Map<number, { text: string; color: string }[]> {
  const out = new Map<number, { text: string; color: string }[]>();
  for (const m of markers) {
    if (!m.text) continue;
    const at = snapToBar(barTimesMs, m.time);
    if (at == null) continue;
    const key = Math.floor(at / 1000);
    const list = out.get(key) ?? [];
    list.push({ text: m.text, color: m.color });
    out.set(key, list);
  }
  return out;
}
