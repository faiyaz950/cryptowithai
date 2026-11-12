"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  HEAT_SPAN_PCT,
  fmtPct,
  fmtPrice,
  fmtUsdCompact,
  type OverviewCoin,
} from "@/lib/marketOverview";

/**
 * Live bubble map — canvas + halki physics. Bubble ka size = 24H volume,
 * ring ki chamak = 24H move kitna bada hai. Bubbles dheere-dheere tairte
 * rehte hain, ek-doosre se takraate hain, aur hover par ruk jaate hain
 * taaki click/tooltip aasaan rahe.
 */

/** Frame ka kitna hissa bubbles bharein — baaki jagah tairne ke liye. */
const FILL = 0.46;
const GAP = 3;
const WANDER = 0.035;
const DAMPING = 0.982;
const MAX_SPEED = 0.6;
/** Bahut halka — sirf itna ki bubbles deewaron se chipke na rahein. */
const CENTER_PULL = 0.000006;
const RESTITUTION = 0.55;

type Node = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  tr: number;
};

const UP: [number, number, number] = [34, 197, 94];
const DOWN: [number, number, number] = [255, 82, 82];
const FLAT: [number, number, number] = [150, 145, 140];
const UP_TEXT = "#4ade80";
const DOWN_TEXT = "#ff7b7b";

const terminalHref = (symbol: string) => `/trade?tab=markets&symbol=${encodeURIComponent(symbol)}`;

/** Jittered grid (random order) + collision relax — bina center bias ke layout. */
function scatter(coins: OverviewCoin[], radii: Map<string, number>, w: number, h: number): Node[] {
  const order = [...coins].sort(() => Math.random() - 0.5);
  const cols = Math.max(1, Math.round(Math.sqrt((order.length * w) / h)));
  const rows = Math.max(1, Math.ceil(order.length / cols));
  const cw = w / cols;
  const ch = h / rows;
  const nodes: Node[] = order.map((c, i) => {
    const r = radii.get(c.symbol) ?? 8;
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id: c.symbol,
      x: (col + 0.5 + (Math.random() - 0.5) * 0.5) * cw,
      y: (row + 0.5 + (Math.random() - 0.5) * 0.5) * ch,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r,
      tr: r,
    };
  });
  for (let iter = 0; iter < 120; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r + GAP;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) / 2;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      }
    }
    for (const n of nodes) {
      n.x = Math.min(w - n.r - 2, Math.max(n.r + 2, n.x));
      n.y = Math.min(h - n.r - 2, Math.max(n.r + 2, n.y));
    }
  }
  return nodes;
}

function rgba([r, g, b]: [number, number, number], a: number) {
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

function targetRadii(coins: OverviewCoin[], w: number, h: number): Map<string, number> {
  const out = new Map<string, number>();
  if (!coins.length || !w || !h) return out;
  const max = Math.max(...coins.map((c) => c.volumeUsd || 1), 1);
  const rel = coins.map((c) => 0.3 + 0.7 * Math.sqrt((c.volumeUsd || 1) / max));
  const area = rel.reduce((s, r) => s + Math.PI * r * r, 0);
  const k = Math.sqrt((w * h * FILL) / area);
  const cap = Math.min(w, h) * 0.2;
  coins.forEach((c, i) => out.set(c.symbol, Math.min(cap, rel[i] * k)));
  return out;
}

export default function BubbleMap({ coins, loading }: { coins: OverviewCoin[]; loading: boolean }) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Map<string, Node>>(new Map());
  const coinsRef = useRef<Map<string, OverviewCoin>>(new Map());
  const sizeRef = useRef({ w: 0, h: 0 });
  const hoverRef = useRef<string | null>(null);
  const fontRef = useRef({ sans: "Inter, system-ui, sans-serif", mono: "ui-monospace, Menlo, monospace" });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ id: string; x: number; y: number; r: number } | null>(null);

  const bySymbol = useMemo(() => new Map(coins.map((c) => [c.symbol, c])), [coins]);

  // Container size + canvas backing store (retina ke liye DPR).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const mono = cs.getPropertyValue("--tr-mono").trim();
    fontRef.current = { sans: cs.fontFamily || fontRef.current.sans, mono: mono || fontRef.current.mono };
    const ro = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (!box) return;
      const w = Math.round(box.width);
      const h = Math.round(box.height);
      sizeRef.current = { w, h };
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Universe / data / size badle to nodes sync — purane bubbles apni jagah rehte hain.
  useEffect(() => {
    coinsRef.current = bySymbol;
    const { w, h } = size;
    if (!w || !h) return;
    const radii = targetRadii(coins, w, h);
    const nodes = nodesRef.current;

    if (!nodes.size) {
      // Pehli baar: poore frame par bikhra ke overlaps hata do — shuru se hi
      // corners tak bubbles, aur pehle frame mein koi dhamaka nahi.
      for (const n of scatter(coins, radii, w, h)) nodes.set(n.id, n);
      return;
    }

    for (const id of [...nodes.keys()]) {
      if (!radii.has(id)) nodes.delete(id);
    }
    for (const [id, tr] of radii) {
      const n = nodes.get(id);
      if (n) {
        n.tr = tr;
        n.x = Math.min(w - n.r, Math.max(n.r, n.x));
        n.y = Math.min(h - n.r, Math.max(n.r, n.y));
      } else {
        // Naya bubble chhota shuru hota hai aur badh kar jagah banata hai.
        nodes.set(id, {
          id,
          x: tr + Math.random() * Math.max(1, w - 2 * tr),
          y: tr + Math.random() * Math.max(1, h - 2 * tr),
          vx: 0,
          vy: 0,
          r: 0.5,
          tr,
        });
      }
    }
  }, [coins, bySymbol, size]);

  // Animation loop — sirf jab card screen par dikh raha ho.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    let last = performance.now();

    const tick = (dt: number) => {
      const { w, h } = sizeRef.current;
      const list = [...nodesRef.current.values()];
      const wander = reduceMotion ? 0 : WANDER;
      for (const n of list) {
        n.r += (n.tr - n.r) * Math.min(1, 0.08 * dt);
        n.vx += (Math.random() - 0.5) * wander * dt + (w / 2 - n.x) * CENTER_PULL * dt;
        n.vy += (Math.random() - 0.5) * wander * dt + (h / 2 - n.y) * CENTER_PULL * 1.6 * dt;
        n.vx *= DAMPING;
        n.vy *= DAMPING;
        const sp = Math.hypot(n.vx, n.vy);
        if (sp > MAX_SPEED) {
          n.vx *= MAX_SPEED / sp;
          n.vy *= MAX_SPEED / sp;
        }
        n.x += n.vx * dt;
        n.y += n.vy * dt;
      }

      // Collisions — mass ∝ r², halka elastic bounce.
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = a.r + b.r + GAP;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01;
          const nx = dx / d;
          const ny = dy / d;
          const ma = a.r * a.r;
          const mb = b.r * b.r;
          const overlap = min - d;
          const fa = mb / (ma + mb);
          const fb = ma / (ma + mb);
          a.x -= nx * overlap * fa;
          a.y -= ny * overlap * fa;
          b.x += nx * overlap * fb;
          b.y += ny * overlap * fb;
          const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (vn < 0) {
            const jImp = (-(1 + RESTITUTION) * vn) / (1 / ma + 1 / mb);
            a.vx -= (jImp / ma) * nx;
            a.vy -= (jImp / ma) * ny;
            b.vx += (jImp / mb) * nx;
            b.vy += (jImp / mb) * ny;
          }
        }
      }

      // Deewaron se bounce.
      for (const n of list) {
        if (n.x < n.r + 2) {
          n.x = n.r + 2;
          n.vx = Math.abs(n.vx) * 0.8;
        } else if (n.x > w - n.r - 2) {
          n.x = w - n.r - 2;
          n.vx = -Math.abs(n.vx) * 0.8;
        }
        if (n.y < n.r + 2) {
          n.y = n.r + 2;
          n.vy = Math.abs(n.vy) * 0.8;
        } else if (n.y > h - n.r - 2) {
          n.y = h - n.r - 2;
          n.vy = -Math.abs(n.vy) * 0.8;
        }
      }
    };

    const draw = () => {
      const { w, h } = sizeRef.current;
      const dpr = canvas.width / Math.max(1, w);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { sans, mono } = fontRef.current;
      const hoverId = hoverRef.current;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (const n of nodesRef.current.values()) {
        const coin = coinsRef.current.get(n.id);
        if (!coin || n.r < 1) continue;
        const chg = coin.change24h;
        const base = chg == null || !Number.isFinite(chg) || chg === 0 ? FLAT : chg > 0 ? UP : DOWN;
        const t = chg == null ? 0 : Math.pow(Math.min(1, Math.abs(chg) / HEAT_SPAN_PCT), 0.7);
        const isHover = hoverId === n.id;
        const R = n.r;

        // Andar dark glass, kinare par rangeen ring — bada move = tez chamak.
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, R);
        g.addColorStop(0, rgba(base, 0.03 + 0.05 * t));
        g.addColorStop(0.6, rgba(base, 0.08 + 0.1 * t));
        g.addColorStop(0.84, rgba(base, 0.26 + 0.3 * t));
        g.addColorStop(1, rgba(base, 0.55 + 0.4 * t));
        ctx.beginPath();
        ctx.arc(n.x, n.y, R, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        ctx.lineWidth = Math.max(1.2, R * 0.05);
        ctx.strokeStyle = isHover ? "rgba(255,255,255,0.95)" : rgba(base, 0.45 + 0.55 * t);
        ctx.stroke();

        // Upar-baayein halka gloss.
        const gl = ctx.createRadialGradient(n.x - R * 0.35, n.y - R * 0.45, 0, n.x - R * 0.35, n.y - R * 0.45, R * 0.7);
        gl.addColorStop(0, "rgba(255,255,255,0.10)");
        gl.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gl;
        ctx.fill();

        if (R < 15) continue;
        const sym = coin.base;
        const pct = fmtPct(chg, 1);
        const pctColor = base === UP ? UP_TEXT : base === DOWN ? DOWN_TEXT : "#bdb8b3";

        if (R >= 34) {
          // Coin mark + symbol + % (reference jaisa stacked layout).
          const markR = R * 0.2;
          const my = n.y - R * 0.4;
          ctx.beginPath();
          ctx.arc(n.x, my, markR, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.09)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255,255,255,0.14)";
          ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.75)";
          ctx.font = `700 ${Math.round(markR * 0.62)}px ${sans}`;
          ctx.fillText(sym.slice(0, 3), n.x, my + 0.5);

          let fs = Math.min(24, R * 0.3);
          ctx.font = `750 ${fs}px ${sans}`;
          const tw = ctx.measureText(sym).width;
          if (tw > R * 1.55) {
            fs *= (R * 1.55) / tw;
            ctx.font = `750 ${fs}px ${sans}`;
          }
          ctx.fillStyle = "#fff";
          ctx.fillText(sym, n.x, n.y + R * 0.06);
          ctx.font = `650 ${Math.min(15, R * 0.2)}px ${mono}`;
          ctx.fillStyle = pctColor;
          ctx.fillText(pct, n.x, n.y + R * 0.4);
        } else {
          let fs = R * 0.38;
          ctx.font = `750 ${fs}px ${sans}`;
          const tw = ctx.measureText(sym).width;
          if (tw > R * 1.6) {
            fs *= (R * 1.6) / tw;
            ctx.font = `750 ${fs}px ${sans}`;
          }
          ctx.fillStyle = "#fff";
          const showPct = R >= 22;
          ctx.fillText(sym, n.x, showPct ? n.y - R * 0.14 : n.y);
          if (showPct) {
            ctx.font = `650 ${R * 0.25}px ${mono}`;
            ctx.fillStyle = pctColor;
            ctx.fillText(pct, n.x, n.y + R * 0.32);
          }
        }
      }
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(3, (now - last) / 16.667);
      last = now;
      // Hover par simulation ruk jaati hai — bubble pakadna aasaan.
      if (!hoverRef.current) tick(dt);
      draw();
      if (visible) raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting;
      if (visible && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(wrap);
    raf = requestAnimationFrame(frame);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const pick = (clientX: number, clientY: number): string | null => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return null;
    const x = clientX - box.left;
    const y = clientY - box.top;
    let best: string | null = null;
    let bestD = Infinity;
    for (const n of nodesRef.current.values()) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= n.r + 2 && d < bestD) {
        best = n.id;
        bestD = d;
      }
    }
    return best;
  };

  const setHoverId = (id: string | null) => {
    if (hoverRef.current === id) return;
    hoverRef.current = id;
    // Hover par sim ruki rehti hai, isliye position yahin snapshot kar lete hain.
    const n = id ? nodesRef.current.get(id) : null;
    setHover(n ? { id: n.id, x: n.x, y: n.y, r: n.r } : null);
  };

  const hoverCoin = hover ? bySymbol.get(hover.id) : null;

  return (
    <div className="mo-bubbles" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="mo-bubbles-canvas"
        data-hover={hover ? "1" : undefined}
        aria-hidden
        onPointerMove={(e) => setHoverId(pick(e.clientX, e.clientY))}
        onPointerLeave={() => setHoverId(null)}
        onClick={(e) => {
          const id = pick(e.clientX, e.clientY);
          if (id) router.push(terminalHref(id));
        }}
      />

      {loading && <span className="mo-skel mo-tree-skel" />}
      {!loading && !coins.length && <div className="mo-empty">The market feed returned no rows yet.</div>}

      {/* Keyboard / screen-reader ke liye: har bubble ek asli link. Focus = highlight. */}
      <ul className="mo-sr-list">
        {coins.map((c) => (
          <li key={c.symbol}>
            <Link
              href={terminalHref(c.symbol)}
              onFocus={() => setHoverId(c.symbol)}
              onBlur={() => setHoverId(null)}
            >
              {c.base}: {fmtPct(c.change24h)} over 24H, volume {fmtUsdCompact(c.volumeUsd)}
            </Link>
          </li>
        ))}
      </ul>

      {hoverCoin && hover && (
        <BubbleTip
          x={hover.x}
          y={hover.y}
          r={hover.r}
          boxW={size.w}
          boxH={size.h}
          coin={hoverCoin}
        />
      )}
    </div>
  );
}

function BubbleTip({
  x,
  y,
  r,
  boxW,
  boxH,
  coin,
}: {
  x: number;
  y: number;
  r: number;
  boxW: number;
  boxH: number;
  coin: OverviewCoin;
}) {
  const TW = 200;
  const TH = 120;
  const right = x + r + 12;
  const left = right + TW > boxW ? x - r - 12 - TW : right;
  const top = Math.min(Math.max(4, y - TH / 2), Math.max(4, boxH - TH - 4));
  const tone = (coin.change24h ?? 0) > 0 ? "mo-up" : (coin.change24h ?? 0) < 0 ? "mo-down" : "";
  return (
    <div className="mo-tip" style={{ left: Math.max(4, left), top }} aria-hidden>
      <div className="mo-tip-head">
        <span className="mo-coin" style={{ width: 24, height: 24, fontSize: 8 }}>
          {coin.base.slice(0, 3)}
        </span>
        <strong>{coin.base}/USDT</strong>
        <span className={`mo-tip-chg ${tone}`}>{fmtPct(coin.change24h)}</span>
      </div>
      <dl>
        <dt>Price</dt>
        <dd>{fmtPrice(coin.price)}</dd>
        <dt>24H volume</dt>
        <dd>{fmtUsdCompact(coin.volumeUsd)}</dd>
        <dt>Sector</dt>
        <dd>{coin.sector}</dd>
      </dl>
      <div className="mo-tip-foot">Click → open in terminal</div>
    </div>
  );
}
