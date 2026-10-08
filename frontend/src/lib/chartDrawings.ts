"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type {
  IChartApiBase,
  ISeriesApi,
  ISeriesPrimitive,
  ISeriesPrimitivePaneRenderer,
  ISeriesPrimitivePaneView,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

export type DrawingType = "trend" | "ray" | "hline" | "vline" | "rect" | "fib" | "fibext" | "brush" | "text";
export type DrawTool = "cursor" | DrawingType;

/** `t` unix seconds (aakhri candle ke aage bhi ho sakta hai), `p` price. */
export interface DrawPoint {
  t: number;
  p: number;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  pts: DrawPoint[];
  color: string;
  width: number;
  text?: string;
}

export const DRAW_COLORS = ["#f472b6", "#38bdf8", "#facc15", "#4ade80", "#f87171", "#a78bfa", "#e2e8f0"];
export const DRAW_WIDTHS = [1, 2, 3, 4];
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
/** Trend-based extension: C + (B − A) × level. */
const FIB_EXT_LEVELS = [0, 0.382, 0.618, 1, 1.272, 1.618, 2, 2.618];
/** Kheench kar / click-click se bante hain. fibext mein teesra point (C) bhi. */
const MULTI_POINT: DrawingType[] = ["trend", "ray", "rect", "fib", "fibext"];
const pointsNeeded = (t: DrawingType) => (t === "fibext" ? 3 : 2);
const HIT_PX = 6;
const HANDLE_PX = 8;
const STORE_KEY = "cm.drawings.v1";

type Px = { x: number; y: number };
type RenderTarget = Parameters<ISeriesPrimitivePaneRenderer["draw"]>[0];
type Bar = { time: number };
export type DrawHit = { id: string; handle: number | null };

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function distToSegment(p: Px, a: Px, b: Px, ray = false): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let k = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  k = ray ? Math.max(0, k) : Math.min(1, Math.max(0, k));
  return Math.hypot(p.x - (a.x + k * dx), p.y - (a.y + k * dy));
}

function newId(): string {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Chart ke andar drawings — lightweight-charts ka series primitive.
 *
 * Points time/price mein rakhe jaate hain, pixel mein nahi, taaki scroll,
 * zoom, timeframe ya history load hone par drawing apni jagah tiki rahe.
 */
export class DrawingsPrimitive implements ISeriesPrimitive<Time> {
  drawings: Drawing[] = [];
  draft: Drawing | null = null;
  selectedId: string | null = null;
  /** Cursor mode mein hi drawing par hover/drag hota hai. */
  interactive = true;
  size = { width: 0, height: 0 };

  private chart: IChartApiBase<Time> | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private textBoxes = new Map<string, { x: number; y: number; w: number; h: number }>();
  private readonly view: ISeriesPrimitivePaneView;

  constructor(private readonly barsRef: { readonly current: Bar[] }) {
    this.view = {
      zOrder: () => "top",
      renderer: () => ({ draw: (target: RenderTarget) => this.draw(target) }),
    };
  }

  private getBars(): Bar[] {
    return this.barsRef.current;
  }

  setInteractive(on: boolean) {
    this.interactive = on;
    if (!on && this.draft) {
      this.draft = null;
      this.update();
    }
  }

  /** Nayi list lagao (coin badla / clear) — selection aur adhoori drawing hat jaati hai. */
  reset(drawings: Drawing[]) {
    this.drawings = drawings;
    this.selectedId = null;
    this.draft = null;
    this.update();
  }

  select(id: string | null) {
    this.selectedId = id;
    this.update();
  }

  patchSelected(patch: Partial<Pick<Drawing, "color" | "width" | "text">>): boolean {
    const d = this.drawings.find((x) => x.id === this.selectedId);
    if (!d) return false;
    Object.assign(d, patch);
    return true;
  }

  removeSelected(): boolean {
    if (!this.selectedId) return false;
    this.drawings = this.drawings.filter((d) => d.id !== this.selectedId);
    this.selectedId = null;
    return true;
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this.chart = param.chart;
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
  }

  get ready(): boolean {
    return Boolean(this.chart && this.series && this.getBars().length > 1);
  }

  update() {
    this.requestUpdate?.();
  }

  paneViews() {
    return [this.view];
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    if (!this.interactive) return null;
    const hit = this.hit(x, y);
    if (!hit) return null;
    return { externalId: hit.id, zOrder: "top", cursorStyle: hit.handle != null ? "grab" : "pointer" };
  }

  // ── time/price <-> pixel ────────────────────────────────

  private barSec(i: number): number {
    return Math.floor(this.getBars()[i].time / 1000);
  }

  private barX(i: number): number | null {
    return this.chart?.timeScale().timeToCoordinate(this.barSec(i) as UTCTimestamp) ?? null;
  }

  /** Candles ke beech ka time bhi — do candles ke pixel ke beech seedhi rekha. */
  xOf(t: number): number | null {
    const n = this.getBars().length;
    if (!this.chart || n < 2) return null;
    const first = this.barSec(0);
    const last = this.barSec(n - 1);
    if (t <= first || t >= last) {
      const [i, j] = t <= first ? [0, 1] : [n - 2, n - 1];
      const xi = this.barX(i);
      const xj = this.barX(j);
      if (xi == null || xj == null) return null;
      const step = this.barSec(j) - this.barSec(i) || 1;
      const anchor = t <= first ? { x: xi, t: first } : { x: xj, t: last };
      return anchor.x + ((t - anchor.t) / step) * (xj - xi);
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.barSec(mid) <= t) lo = mid;
      else hi = mid;
    }
    const xa = this.barX(lo);
    const xb = this.barX(hi);
    if (xa == null || xb == null) return null;
    const ta = this.barSec(lo);
    const tb = this.barSec(hi);
    return xa + ((xb - xa) * (t - ta)) / (tb - ta || 1);
  }

  tOf(x: number): number | null {
    const n = this.getBars().length;
    if (!this.chart || n < 2) return null;
    const x0 = this.barX(0);
    const x1 = this.barX(1);
    const xl = this.barX(n - 1);
    const xp = this.barX(n - 2);
    if (x0 == null || x1 == null || xl == null || xp == null) return null;
    if (x <= x0) return this.barSec(0) + ((x - x0) / (x1 - x0 || 1)) * (this.barSec(1) - this.barSec(0));
    if (x >= xl) return this.barSec(n - 1) + ((x - xl) / (xl - xp || 1)) * (this.barSec(n - 1) - this.barSec(n - 2));
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      const xm = this.barX(mid);
      if (xm != null && xm <= x) lo = mid;
      else hi = mid;
    }
    const xa = this.barX(lo) ?? x0;
    const xb = this.barX(hi) ?? xl;
    const ta = this.barSec(lo);
    const tb = this.barSec(hi);
    return ta + ((x - xa) / (xb - xa || 1)) * (tb - ta);
  }

  yOf(p: number): number | null {
    return this.series?.priceToCoordinate(p) ?? null;
  }

  pOf(y: number): number | null {
    const p = this.series?.coordinateToPrice(y);
    return p == null || !Number.isFinite(p) ? null : p;
  }

  pointAt(x: number, y: number): DrawPoint | null {
    const t = this.tOf(x);
    const p = this.pOf(y);
    return t == null || p == null ? null : { t, p };
  }

  private fmtPrice(p: number): string {
    try {
      return this.series?.priceFormatter().format(p) ?? p.toFixed(2);
    } catch {
      return p.toFixed(2);
    }
  }

  /** Har point ka pixel; hline ko x nahi chahiye, vline ko y nahi. */
  pixels(d: Drawing): (Px | null)[] {
    const { width, height } = this.size;
    return d.pts.map((pt) => {
      const x = d.type === "hline" ? null : this.xOf(pt.t);
      const y = d.type === "vline" ? null : this.yOf(pt.p);
      if (d.type === "hline") return y == null ? null : { x: this.xOf(pt.t) ?? width / 2, y };
      if (d.type === "vline") return x == null ? null : { x, y: height / 2 };
      return x == null || y == null ? null : { x, y };
    });
  }

  // ── hit test ────────────────────────────────────────────

  hit(x: number, y: number): DrawHit | null {
    const p = { x, y };
    for (let k = this.drawings.length - 1; k >= 0; k--) {
      const d = this.drawings[k];
      const px = this.pixels(d);
      if (d.type !== "brush") {
        for (let i = 0; i < px.length; i++) {
          const h = px[i];
          if (h && Math.hypot(h.x - x, h.y - y) <= HANDLE_PX) return { id: d.id, handle: i };
        }
      }
      if (this.hitBody(d, px, p)) return { id: d.id, handle: null };
    }
    return null;
  }

  private hitBody(d: Drawing, px: (Px | null)[], p: Px): boolean {
    const [a, b] = px;
    switch (d.type) {
      case "hline":
        return a != null && Math.abs(p.y - a.y) <= HIT_PX;
      case "vline":
        return a != null && Math.abs(p.x - a.x) <= HIT_PX;
      case "trend":
        return a != null && b != null && distToSegment(p, a, b) <= HIT_PX;
      case "ray":
        return a != null && b != null && distToSegment(p, a, b, true) <= HIT_PX;
      case "rect":
      case "fib": {
        if (!a || !b) return false;
        const pad = HIT_PX;
        return (
          p.x >= Math.min(a.x, b.x) - pad &&
          p.x <= Math.max(a.x, b.x) + pad &&
          p.y >= Math.min(a.y, b.y) - pad &&
          p.y <= Math.max(a.y, b.y) + pad
        );
      }
      case "fibext": {
        const c = px[2];
        if (a && b && distToSegment(p, a, b) <= HIT_PX) return true;
        if (!b || !c) return false;
        if (distToSegment(p, b, c) <= HIT_PX) return true;
        const band = this.fibExtBand(d, px);
        return Boolean(band && p.x >= band.x1 && p.x <= band.x2 && p.y >= band.top - HIT_PX && p.y <= band.bottom + HIT_PX);
      }
      case "brush":
        for (let i = 1; i < px.length; i++) {
          const s = px[i - 1];
          const e = px[i];
          if (s && e && distToSegment(p, s, e) <= HIT_PX + d.width / 2) return true;
        }
        return false;
      case "text": {
        const box = this.textBoxes.get(d.id);
        return Boolean(box && p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h);
      }
    }
  }

  /** Extension levels kahan tak (x) aur kis price par (y) — draw aur hit dono isi se. */
  private fibExtBand(d: Drawing, px: (Px | null)[]) {
    const [a, b, c] = px;
    if (!a || !b || !c || d.pts.length < 3) return null;
    const [pa, pb, pc] = [d.pts[0].p, d.pts[1].p, d.pts[2].p];
    const levels = FIB_EXT_LEVELS.map((lv) => {
      const price = pc + (pb - pa) * lv;
      return { lv, price, y: this.yOf(price) };
    });
    const ys = levels.flatMap((l) => (l.y == null ? [] : [l.y]));
    if (!ys.length) return null;
    const x1 = Math.min(b.x, c.x);
    const x2 = Math.max(a.x, b.x, c.x) + Math.max(60, Math.abs(b.x - a.x) * 0.6);
    return { x1, x2, levels, top: Math.min(...ys), bottom: Math.max(...ys) };
  }

  // ── draw ────────────────────────────────────────────────

  private draw(target: RenderTarget) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      this.size = { width: mediaSize.width, height: mediaSize.height };
      const list = this.draft ? [...this.drawings, this.draft] : this.drawings;
      for (const d of list) {
        ctx.save();
        try {
          this.drawOne(ctx, d, d.id === this.selectedId || d === this.draft);
        } finally {
          ctx.restore();
        }
      }
    });
  }

  private drawOne(ctx: CanvasRenderingContext2D, d: Drawing, selected: boolean) {
    const { width: W, height: H } = this.size;
    const px = this.pixels(d);
    const [a, b] = px;
    ctx.strokeStyle = d.color;
    ctx.fillStyle = d.color;
    ctx.lineWidth = d.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const line = (s: Px, e: Px) => {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    };
    const label = (text: string, x: number, y: number, align: CanvasTextAlign) => {
      ctx.font = "600 11px Inter, system-ui, sans-serif";
      ctx.textAlign = align;
      ctx.textBaseline = "bottom";
      ctx.fillText(text, x, y - 3);
    };

    switch (d.type) {
      case "hline":
        if (!a) return;
        line({ x: 0, y: a.y }, { x: W, y: a.y });
        label(this.fmtPrice(d.pts[0].p), W - 6, a.y, "right");
        break;
      case "vline":
        if (!a) return;
        line({ x: a.x, y: 0 }, { x: a.x, y: H });
        break;
      case "trend":
        if (a && b) line(a, b);
        break;
      case "ray":
        if (a && b) {
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const k = ((W + H) * 2) / len;
          line(a, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
        }
        break;
      case "rect":
        if (a && b) {
          ctx.fillStyle = rgba(d.color, 0.12);
          ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
          ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        }
        break;
      case "fib":
        if (a && b) {
          const x1 = Math.min(a.x, b.x);
          const x2 = Math.max(a.x, b.x);
          const [pa, pb] = [d.pts[0].p, d.pts[1].p];
          let prevY: number | null = null;
          FIB_LEVELS.forEach((lv, i) => {
            const price = pb + (pa - pb) * lv;
            const y = this.yOf(price);
            if (y == null) return;
            if (prevY != null) {
              ctx.fillStyle = rgba(d.color, i % 2 ? 0.07 : 0.04);
              ctx.fillRect(x1, Math.min(prevY, y), x2 - x1, Math.abs(y - prevY));
            }
            prevY = y;
            ctx.strokeStyle = rgba(d.color, lv === 0 || lv === 1 ? 1 : 0.75);
            line({ x: x1, y }, { x: x2, y });
            ctx.fillStyle = d.color;
            label(`${lv} (${this.fmtPrice(price)})`, x1 + 4, y, "left");
          });
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = rgba(d.color, 0.5);
          ctx.lineWidth = 1;
          line(a, b);
          ctx.setLineDash([]);
        }
        break;
      case "fibext": {
        const c = px[2];
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = rgba(d.color, 0.6);
        ctx.lineWidth = 1;
        if (a && b) line(a, b);
        if (b && c) line(b, c);
        ctx.setLineDash([]);
        const band = this.fibExtBand(d, px);
        if (!band) break;
        ctx.lineWidth = d.width;
        let prevY: number | null = null;
        band.levels.forEach(({ lv, price, y }, i) => {
          if (y == null) return;
          if (prevY != null) {
            ctx.fillStyle = rgba(d.color, i % 2 ? 0.07 : 0.04);
            ctx.fillRect(band.x1, Math.min(prevY, y), band.x2 - band.x1, Math.abs(y - prevY));
          }
          prevY = y;
          ctx.strokeStyle = rgba(d.color, lv === 0 || lv === 1 || lv === 1.618 ? 1 : 0.7);
          line({ x: band.x1, y }, { x: band.x2, y });
          ctx.fillStyle = d.color;
          label(`${lv} (${this.fmtPrice(price)})`, band.x1 + 4, y, "left");
        });
        break;
      }
      case "brush": {
        const pts = px.filter((p): p is Px => p != null);
        if (pts.length < 2) return;
        if (selected) {
          ctx.save();
          ctx.strokeStyle = rgba(d.color, 0.3);
          ctx.lineWidth = d.width + 6;
          this.polyline(ctx, pts);
          ctx.restore();
        }
        this.polyline(ctx, pts);
        break;
      }
      case "text": {
        if (!a || !d.text) return;
        const size = 11 + d.width * 2;
        ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        const w = ctx.measureText(d.text).width + 12;
        const h = size + 10;
        const box = { x: a.x, y: a.y - h / 2, w, h };
        this.textBoxes.set(d.id, box);
        ctx.fillStyle = "rgba(10, 14, 20, 0.78)";
        ctx.strokeStyle = rgba(d.color, selected ? 0.9 : 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(box.x, box.y, box.w, box.h, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = d.color;
        ctx.fillText(d.text, a.x + 6, a.y + 1);
        return;
      }
    }

    if (selected && d.type !== "brush") {
      for (const h of px) {
        if (!h) continue;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#0a0e14";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = d.color;
        ctx.stroke();
      }
    }
  }

  private polyline(ctx: CanvasRenderingContext2D, pts: Px[]) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
}

// ── storage ──────────────────────────────────────────────

function loadAll(): Record<string, Drawing[]> {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveFor(key: string, drawings: Drawing[]) {
  try {
    const all = loadAll();
    if (drawings.length) all[key] = drawings;
    else delete all[key];
    window.localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    /* storage full / private mode */
  }
}

// ── interaction hook ─────────────────────────────────────

type Gesture =
  | { kind: "move"; id: string; start: Px; orig: Drawing; origPx: (Px | null)[] }
  | { kind: "handle"; id: string; index: number }
  | { kind: "create"; start: Px }
  | { kind: "brush"; last: Px };

interface Options {
  primitive: DrawingsPrimitive;
  /** Chart ka container — mouse events yahin pakde jaate hain. */
  hostRef: RefObject<HTMLElement | null>;
  tool: DrawTool;
  onToolChange?: (tool: DrawTool) => void;
  /** Har coin ki drawings alag. Na ho to drawings band. */
  storageKey: string | null;
  clearKey: number;
}

/**
 * Mouse/touch se drawing banana, chunna, kheenchna. Chart khud bhi mousedown
 * par pan karta hai, isliye jab gesture hamara ho tab event capture phase
 * mein hi rok diya jaata hai — chart tak pahunchta hi nahi.
 */
export function useChartDrawings({ primitive, hostRef, tool, onToolChange, storageKey, clearKey }: Options) {
  // Selection jis coin ki hai uske naam ke saath — coin badla to apne aap null.
  const [picked, setPicked] = useState<{ key: string | null; drawing: Drawing } | null>(null);
  const selected = picked && picked.key === storageKey ? picked.drawing : null;
  const toolRef = useRef(tool);
  const keyRef = useRef(storageKey);
  const onToolRef = useRef(onToolChange);
  const lastClear = useRef(clearKey);

  useEffect(() => {
    toolRef.current = tool;
    onToolRef.current = onToolChange;
    primitive.setInteractive(tool === "cursor");
    const host = hostRef.current;
    if (host) host.style.cursor = tool === "cursor" ? "" : "crosshair";
  }, [tool, onToolChange, primitive, hostRef]);

  const sync = useCallback(
    (persist: boolean) => {
      const sel = primitive.drawings.find((d) => d.id === primitive.selectedId) ?? null;
      setPicked(sel ? { key: keyRef.current, drawing: { ...sel } } : null);
      if (persist && keyRef.current) saveFor(keyRef.current, primitive.drawings);
      primitive.update();
    },
    [primitive],
  );

  useEffect(() => {
    keyRef.current = storageKey;
    primitive.reset(storageKey ? loadAll()[storageKey] ?? [] : []);
  }, [storageKey, primitive]);

  useEffect(() => {
    if (lastClear.current === clearKey) return;
    lastClear.current = clearKey;
    primitive.reset([]);
    sync(true);
  }, [clearKey, primitive, sync]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let gesture: Gesture | null = null;

    const local = (clientX: number, clientY: number): Px => {
      const r = host.getBoundingClientRect();
      return { x: clientX - r.left, y: clientY - r.top };
    };
    const inPane = (p: Px) => p.x >= 0 && p.y >= 0 && p.x <= primitive.size.width && p.y <= primitive.size.height;

    const add = (d: Drawing, keepTool = false) => {
      primitive.drawings = [...primitive.drawings, d];
      primitive.selectedId = keepTool ? null : d.id;
      primitive.draft = null;
      sync(true);
      if (!keepTool) onToolRef.current?.("cursor");
    };

    const finishDraft = () => {
      const d = primitive.draft;
      if (!d) return;
      const px = primitive.pixels(d);
      const a = px[px.length - 2];
      const b = px[px.length - 1];
      if (a && b && Math.hypot(a.x - b.x, a.y - b.y) < 3) {
        // Pehla hissa hi khaali (A = B) to drawing raddh; C wahin pada to bhi chalega.
        if (d.pts.length === 2) {
          primitive.draft = null;
          primitive.update();
          return;
        }
      }
      if (d.pts.length < pointsNeeded(d.type)) {
        // Agla point ab mouse ke saath chalega (fibext ka C).
        d.pts.push({ ...d.pts[d.pts.length - 1] });
        primitive.update();
        return;
      }
      add(d);
    };

    const begin = (p: Px): boolean => {
      if (!keyRef.current || !primitive.ready || !inPane(p)) return false;
      const t = toolRef.current;

      if (t === "cursor") {
        const hit = primitive.hit(p.x, p.y);
        if (!hit) {
          if (primitive.selectedId) {
            primitive.selectedId = null;
            sync(false);
          }
          return false;
        }
        primitive.selectedId = hit.id;
        const d = primitive.drawings.find((x) => x.id === hit.id)!;
        gesture =
          hit.handle != null
            ? { kind: "handle", id: hit.id, index: hit.handle }
            : { kind: "move", id: hit.id, start: p, orig: structuredClone(d), origPx: primitive.pixels(d) };
        sync(false);
        return true;
      }

      const pt = primitive.pointAt(p.x, p.y);
      if (!pt) return true;
      const base = { id: newId(), color: DRAW_COLORS[0], width: 2 };

      if (t === "hline" || t === "vline") {
        add({ ...base, type: t, pts: [pt] });
        return true;
      }
      if (t === "text") {
        const text = window.prompt("Chart par kya likhna hai?")?.trim();
        if (text) add({ ...base, type: "text", pts: [pt], text, color: "#e2e8f0", width: 1 });
        return true;
      }
      if (t === "brush") {
        primitive.draft = { ...base, type: "brush", pts: [pt] };
        gesture = { kind: "brush", last: p };
        primitive.update();
        return true;
      }
      if (MULTI_POINT.includes(t)) {
        if (primitive.draft) {
          // Click-click mode: agla click chalta hua point wahin tika deta hai.
          primitive.draft.pts[primitive.draft.pts.length - 1] = pt;
          finishDraft();
          return true;
        }
        primitive.draft = { ...base, type: t, pts: [pt, { ...pt }] };
        gesture = { kind: "create", start: p };
        primitive.update();
        return true;
      }
      return false;
    };

    const moveTo = (p: Px) => {
      if (!gesture) {
        if (primitive.draft && MULTI_POINT.includes(primitive.draft.type)) {
          const pt = primitive.pointAt(p.x, p.y);
          if (pt) {
            primitive.draft.pts[primitive.draft.pts.length - 1] = pt;
            primitive.update();
          }
        }
        return;
      }
      const g = gesture;
      if (g.kind === "create" || g.kind === "brush") {
        const pt = primitive.pointAt(p.x, p.y);
        const d = primitive.draft;
        if (!pt || !d) return;
        if (g.kind === "create") d.pts[d.pts.length - 1] = pt;
        else if (Math.hypot(p.x - g.last.x, p.y - g.last.y) >= 2) {
          d.pts.push(pt);
          g.last = p;
        }
        primitive.update();
        return;
      }
      const d = primitive.drawings.find((x) => x.id === g.id);
      if (!d) return;
      if (g.kind === "handle") {
        const pt = primitive.pointAt(p.x, p.y);
        if (!pt) return;
        if (d.type === "hline") d.pts[g.index] = { ...d.pts[g.index], p: pt.p };
        else if (d.type === "vline") d.pts[g.index] = { ...d.pts[g.index], t: pt.t };
        else d.pts[g.index] = pt;
      } else {
        const dx = p.x - g.start.x;
        const dy = p.y - g.start.y;
        d.pts = g.orig.pts.map((orig, i) => {
          const o = g.origPx[i];
          if (!o) return orig;
          const t = d.type === "hline" ? orig.t : primitive.tOf(o.x + dx);
          const pr = d.type === "vline" ? orig.p : primitive.pOf(o.y + dy);
          return t == null || pr == null ? orig : { t, p: pr };
        });
      }
      primitive.update();
    };

    const end = () => {
      const g = gesture;
      gesture = null;
      if (!g) return;
      if (g.kind === "brush") {
        const d = primitive.draft;
        if (d && d.pts.length > 1) add(d, true);
        else {
          primitive.draft = null;
          primitive.update();
        }
        return;
      }
      if (g.kind === "create") {
        const d = primitive.draft;
        const px = d ? primitive.pixels(d) : [];
        const a = px[px.length - 2];
        const b = px[px.length - 1];
        // Drag kiya to wahin khatam; sirf click kiya to doosre click ka intezaar.
        if (a && b && Math.hypot(a.x - b.x, a.y - b.y) > 4) finishDraft();
        return;
      }
      sync(true);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const p = local(e.clientX, e.clientY);
      if (!begin(p)) return;
      e.stopPropagation();
      e.preventDefault();
      window.addEventListener("mousemove", onWinMove);
      window.addEventListener("mouseup", onWinUp);
    };
    const onWinMove = (e: MouseEvent) => moveTo(local(e.clientX, e.clientY));
    const onWinUp = () => {
      window.removeEventListener("mousemove", onWinMove);
      window.removeEventListener("mouseup", onWinUp);
      end();
    };
    const onHover = (e: MouseEvent) => {
      if (!gesture && primitive.draft) moveTo(local(e.clientX, e.clientY));
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!begin(local(t.clientX, t.clientY))) return;
      e.stopPropagation();
      e.preventDefault();
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onTouchEnd);
      window.addEventListener("touchcancel", onTouchEnd);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (t) moveTo(local(t.clientX, t.clientY));
    };
    const onTouchEnd = () => {
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      end();
    };

    const onDblClick = (e: MouseEvent) => {
      if (toolRef.current !== "cursor") return;
      const p = local(e.clientX, e.clientY);
      const hit = primitive.hit(p.x, p.y);
      const d = hit && primitive.drawings.find((x) => x.id === hit.id);
      if (!d || d.type !== "text") return;
      e.stopPropagation();
      const text = window.prompt("Text badlein", d.text ?? "")?.trim();
      if (text) {
        d.text = text;
        sync(true);
      }
    };

    host.addEventListener("mousedown", onMouseDown, true);
    host.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
    host.addEventListener("mousemove", onHover);
    host.addEventListener("dblclick", onDblClick, true);
    return () => {
      host.removeEventListener("mousedown", onMouseDown, true);
      host.removeEventListener("touchstart", onTouchStart, true);
      host.removeEventListener("mousemove", onHover);
      host.removeEventListener("dblclick", onDblClick, true);
      onWinUp();
      onTouchEnd();
    };
  }, [hostRef, primitive, sync]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key === "Escape") {
        if (primitive.draft) {
          primitive.draft = null;
          primitive.update();
        } else if (toolRef.current !== "cursor") {
          onToolRef.current?.("cursor");
        } else if (primitive.selectedId) {
          primitive.selectedId = null;
          sync(false);
        }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && primitive.selectedId) {
        e.preventDefault();
        primitive.drawings = primitive.drawings.filter((d) => d.id !== primitive.selectedId);
        primitive.selectedId = null;
        sync(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [primitive, sync]);

  const edit = useCallback(
    (patch: Partial<Pick<Drawing, "color" | "width" | "text">>) => {
      if (primitive.patchSelected(patch)) sync(true);
    },
    [primitive, sync],
  );

  const remove = useCallback(() => {
    if (primitive.removeSelected()) sync(true);
  }, [primitive, sync]);

  const deselect = useCallback(() => {
    primitive.select(null);
    sync(false);
  }, [primitive, sync]);

  return { selected, edit, remove, deselect };
}
