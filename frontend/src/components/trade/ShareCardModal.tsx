"use client";

import { useEffect, useRef, useState, useCallback, useId } from "react";
import {
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Flame,
  Palette,
  Send,
  Share2,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

export type ShareCardType = "pnl" | "signal" | "plan";
export type ShareTheme = "cyber" | "minimal" | "gold" | "glass";
export type ShareFormat = "landscape" | "square" | "story";

export interface ShareCardData {
  type: ShareCardType;
  title?: string;
  symbol: string;
  formattedSymbol?: string;
  side?: "long" | "short" | "buy" | "sell";
  leverage?: string;

  // P&L
  pnl?: number | null;
  roiPct?: number | null;
  entryPrice?: number | null;
  markPrice?: number | null;
  targetPrice?: number | null;
  stopLossPrice?: number | null;
  size?: number | string | null;
  margin?: number | null;
  isClosed?: boolean;
  openedAt?: string | null;
  closedAt?: string | null;

  // Signal / Screener
  bias?: "bullish" | "bearish" | "neutral";
  strength?: number | null;
  timeframe?: string;
  price?: number | null;
  change24h?: number | null;
  rsi?: number | null;
  strategyAgreement?: string;
  strategiesList?: string[];

  // Plan / Calculator
  calcName?: string;
  riskReward?: string;
  riskAmount?: number | null;
  rewardAmount?: number | null;
  breakEven?: number | null;
  netPnl?: number | null;
}

interface Props {
  data: ShareCardData | null;
  onClose: () => void;
}

const DEFAULT_TAGLINES: Record<ShareCardType, string[]> = {
  pnl: [
    "🚀 Nailed the breakout cleanly",
    "🛡️ Strict risk management, profits banked",
    "🎯 Alpha target achieved on Delta perp",
    "💎 Discipline > FOMO. Process over outcome.",
  ],
  signal: [
    "⚡ AI Quant Screener detected high-probability setup",
    "📈 Multi-strategy agreement confirmed trend",
    "🔥 Momentum & volume breakout alert",
    "🧠 Data-driven crypto edge",
  ],
  plan: [
    "📐 Calculated risk, asymmetric upside",
    "⚖️ Proper position sizing before entry",
    "🛡️ Capital preservation first, alpha second",
    "🎯 Plan the trade, trade the plan",
  ],
};

function fmtUsd(n: number | null | undefined, hide = false): string {
  if (hide) return "••••••";
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
  return `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: digits })}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

// Draw rounded rectangle helper for canvas
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Stylized QR matrix pattern for watermark
function drawStylizedQr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
) {
  ctx.save();
  ctx.fillStyle = color;
  const cellSize = size / 11;

  // 3 Finder patterns
  const drawFinder = (fx: number, fy: number) => {
    ctx.fillRect(fx, fy, cellSize * 3, cellSize * 3);
    ctx.clearRect(fx + cellSize * 0.7, fy + cellSize * 0.7, cellSize * 1.6, cellSize * 1.6);
    ctx.fillRect(fx + cellSize * 1.05, fy + cellSize * 1.05, cellSize * 0.9, cellSize * 0.9);
  };

  drawFinder(x, y);
  drawFinder(x + cellSize * 8, y);
  drawFinder(x, y + cellSize * 8);

  // Random-looking deterministic data dots
  const pattern = [
    [4, 0], [6, 0], [4, 2], [6, 2],
    [0, 4], [2, 4], [4, 4], [5, 4], [7, 4], [9, 4], [10, 4],
    [1, 5], [3, 5], [6, 5], [8, 5],
    [0, 6], [2, 6], [4, 6], [7, 6], [9, 6],
    [5, 7], [8, 7], [10, 7],
    [4, 8], [6, 8], [9, 8],
    [4, 9], [7, 9], [8, 9], [10, 9],
    [5, 10], [6, 10], [8, 10],
  ];

  pattern.forEach(([cx, cy]) => {
    ctx.fillRect(x + cx * cellSize, y + cy * cellSize, cellSize * 0.85, cellSize * 0.85);
  });

  ctx.restore();
}

export default function ShareCardModal({ data, onClose }: Props) {
  const [theme, setTheme] = useState<ShareTheme>("cyber");
  const [format, setFormat] = useState<ShareFormat>("landscape");
  const [hideAmount, setHideAmount] = useState<boolean>(false);
  const [handle, setHandle] = useState<string>("@trader");
  const [tagline, setTagline] = useState<string>("");
  const [showQr, setShowQr] = useState<boolean>(true);
  const [copiedToast, setCopiedToast] = useState<string | null>(null);
  const [rendering, setRendering] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize handle and tagline
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedHandle = localStorage.getItem("cryptomantra_share_handle");
      if (savedHandle) setHandle(savedHandle);
    }
  }, []);

  useEffect(() => {
    if (data) {
      const defaultTags = DEFAULT_TAGLINES[data.type] || DEFAULT_TAGLINES.pnl;
      setTagline(defaultTags[0]);
    }
  }, [data]);

  const updateHandle = (newVal: string) => {
    setHandle(newVal);
    if (typeof window !== "undefined") {
      localStorage.setItem("cryptomantra_share_handle", newVal);
    }
  };

  // Canvas drawing engine
  const renderToCanvas = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!data) return resolve(null);

      // Logical dimensions
      let width = 1200;
      let height = 675; // 16:9
      if (format === "square") {
        width = 1080;
        height = 1080; // 1:1
      } else if (format === "story") {
        width = 1080;
        height = 1920; // 9:16
      }

      // High-DPI 2x scaling for ultra-sharp export
      const scale = 2;
      const canvas = canvasRef.current || document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);

      ctx.save();
      ctx.scale(scale, scale);

      // Determine colors based on theme & data
      const isLong = data.side === "long" || data.side === "buy";
      const isShort = data.side === "short" || data.side === "sell";
      const isPositive =
        data.type === "pnl"
          ? (data.roiPct ?? 0) >= 0 && (data.pnl ?? 0) >= 0
          : data.bias === "bullish";

      // Theme color palettes
      let bgGradStart = "#070c14";
      let bgGradMid = "#0a1322";
      let bgGradEnd = "#05090f";
      let accentColor = "#f97316";
      let borderColor = "rgba(249, 115, 22, 0.22)";
      let cardBg = "rgba(14, 22, 36, 0.72)";
      let cardBorder = "rgba(255, 255, 255, 0.08)";
      let textMuted = "#7e8b9f";
      let textPrimary = "#ffffff";
      let glowColor = isPositive ? "rgba(0, 230, 118, 0.22)" : "rgba(255, 82, 82, 0.22)";

      if (theme === "minimal") {
        bgGradStart = "#101319";
        bgGradMid = "#141821";
        bgGradEnd = "#0d1015";
        accentColor = "#38bdf8";
        borderColor = "rgba(255, 255, 255, 0.12)";
        cardBg = "rgba(23, 28, 38, 0.85)";
        cardBorder = "rgba(255, 255, 255, 0.08)";
        textMuted = "#94a3b8";
        glowColor = isPositive ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)";
      } else if (theme === "gold") {
        bgGradStart = "#0e0f14";
        bgGradMid = "#18171f";
        bgGradEnd = "#0a0a0f";
        accentColor = "#f59e0b";
        borderColor = "rgba(245, 158, 11, 0.3)";
        cardBg = "rgba(26, 24, 30, 0.78)";
        cardBorder = "rgba(245, 158, 11, 0.15)";
        textMuted = "#a8a29e";
        glowColor = "rgba(245, 158, 11, 0.2)";
      } else if (theme === "glass") {
        bgGradStart = "#0b0816";
        bgGradMid = "#170f2f";
        bgGradEnd = "#07050f";
        accentColor = "#c084fc";
        borderColor = "rgba(192, 132, 252, 0.28)";
        cardBg = "rgba(28, 19, 52, 0.65)";
        cardBorder = "rgba(192, 132, 252, 0.18)";
        textMuted = "#a59cb8";
        glowColor = isPositive ? "rgba(168, 85, 247, 0.25)" : "rgba(244, 63, 94, 0.25)";
      }

      const greenColor = "#00e676";
      const redColor = "#ff5252";
      const trendColor = isPositive ? greenColor : redColor;

      // 1. Background fill
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, bgGradStart);
      bgGrad.addColorStop(0.5, bgGradMid);
      bgGrad.addColorStop(1, bgGradEnd);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Cyber grid lines
      if (theme === "cyber") {
        ctx.save();
        ctx.strokeStyle = "rgba(249, 115, 22, 0.04)";
        ctx.lineWidth = 1;
        const gridStep = 40;
        for (let gx = 0; gx < width; gx += gridStep) {
          ctx.beginPath();
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, height);
          ctx.stroke();
        }
        for (let gy = 0; gy < height; gy += gridStep) {
          ctx.beginPath();
          ctx.moveTo(0, gy);
          ctx.lineTo(width, gy);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 3. Dynamic radial glow in center/top
      const heroGlow = ctx.createRadialGradient(
        width * 0.35,
        height * (format === "story" ? 0.38 : 0.45),
        20,
        width * 0.35,
        height * (format === "story" ? 0.38 : 0.45),
        width * 0.5
      );
      heroGlow.addColorStop(0, glowColor);
      heroGlow.addColorStop(1, "transparent");
      ctx.fillStyle = heroGlow;
      ctx.fillRect(0, 0, width, height);

      // 4. Outer card margin & border frame
      const pad = format === "story" ? 56 : 48;
      const frameX = pad;
      const frameY = pad;
      const frameW = width - pad * 2;
      const frameH = height - pad * 2;

      ctx.save();
      drawRoundedRect(ctx, frameX, frameY, frameW, frameH, 24);
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // 5. Brand Header
      let curY = frameY + 36;
      const headerX = frameX + 36;

      // Stylized Diamond Logo
      ctx.save();
      const logoSize = 36;
      const logoX = headerX;
      const logoY = curY;
      ctx.translate(logoX + logoSize / 2, logoY + logoSize / 2);

      // Outer diamond
      ctx.beginPath();
      ctx.moveTo(0, -logoSize / 2);
      ctx.lineTo(logoSize / 2, 0);
      ctx.lineTo(0, logoSize / 2);
      ctx.lineTo(-logoSize / 2, 0);
      ctx.closePath();
      const logoGrad = ctx.createLinearGradient(-15, -15, 15, 15);
      logoGrad.addColorStop(0, accentColor);
      logoGrad.addColorStop(1, trendColor);
      ctx.fillStyle = logoGrad;
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 12;
      ctx.fill();

      // Inner delta
      ctx.beginPath();
      ctx.moveTo(0, -logoSize / 4);
      ctx.lineTo(logoSize / 4, logoSize / 4);
      ctx.lineTo(0, logoSize / 6);
      ctx.lineTo(-logoSize / 4, logoSize / 4);
      ctx.closePath();
      ctx.fillStyle = "#070c14";
      ctx.shadowBlur = 0;
      ctx.fill();
      ctx.restore();

      // Brand Title & Tagline
      ctx.fillStyle = textPrimary;
      ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
      ctx.fillText("CRYPTOMANTRA", headerX + logoSize + 14, curY + 20);

      ctx.fillStyle = textMuted;
      ctx.font = "600 10.5px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
      ctx.letterSpacing = "1.5px";
      ctx.fillText(
        data.type === "signal"
          ? "AI QUANT SCREENER"
          : data.type === "plan"
          ? "RISK ARCHITECT"
          : "PAPER TRADING DESK",
        headerX + logoSize + 14,
        curY + 35
      );
      ctx.letterSpacing = "0px";

      // Top Right Type Badge
      const badgeText =
        data.type === "pnl"
          ? (data.isClosed ? "CLOSED TRADE" : "LIVE POSITION")
          : data.type === "signal"
          ? "VERIFIED SIGNAL"
          : "QUANT PLAN";
      ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
      const badgeW = ctx.measureText(badgeText).width + 24;
      const badgeX = frameX + frameW - 36 - badgeW;
      const badgeY = curY + 6;

      ctx.save();
      drawRoundedRect(ctx, badgeX, badgeY, badgeW, 26, 13);
      ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
      ctx.fill();
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = accentColor;
      ctx.fillText(badgeText, badgeX + 12, badgeY + 17);
      ctx.restore();

      // 6. Trader Handle Tag (under header)
      curY += 60;
      if (handle) {
        ctx.save();
        ctx.font = "500 12.5px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
        const hText = `${handle} · Verified Trader`;
        const hW = ctx.measureText(hText).width + 30;
        drawRoundedRect(ctx, headerX, curY, hW, 26, 13);
        ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.stroke();

        // Green verified check dot
        ctx.beginPath();
        ctx.arc(headerX + 13, curY + 13, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = greenColor;
        ctx.fill();

        ctx.fillStyle = textMuted;
        ctx.fillText(hText, headerX + 22, curY + 17.5);
        ctx.restore();
      }

      // 7. Hero Section
      curY += format === "story" ? 64 : 44;

      // Pair and Side line
      const pairText = data.formattedSymbol || data.symbol || "BTC/USDT";
      ctx.fillStyle = textPrimary;
      ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
      ctx.fillText(pairText, headerX, curY + 24);

      const pairW = ctx.measureText(pairText).width;

      // Side Chip (LONG / SHORT / BULLISH / BEARISH)
      const sideText =
        data.type === "signal"
          ? (data.bias ? data.bias.toUpperCase() : "NEUTRAL")
          : isLong
          ? `LONG ${data.leverage || "1x"}`
          : isShort
          ? `SHORT ${data.leverage || "1x"}`
          : "TRADE";

      ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
      const sideW = ctx.measureText(sideText).width + 20;
      const sideX = headerX + pairW + 16;
      const sideY = curY + 4;

      ctx.save();
      drawRoundedRect(ctx, sideX, sideY, sideW, 26, 6);
      ctx.fillStyle = isPositive ? "rgba(0, 230, 118, 0.15)" : "rgba(255, 82, 82, 0.15)";
      ctx.fill();
      ctx.strokeStyle = isPositive ? "rgba(0, 230, 118, 0.4)" : "rgba(255, 82, 82, 0.4)";
      ctx.stroke();
      ctx.fillStyle = trendColor;
      ctx.fillText(sideText, sideX + 10, sideY + 17);
      ctx.restore();

      // Huge Main Stat: ROI % or Signal Strength or Risk:Reward
      curY += 44;

      let bigStat = "+0.00%";
      let bigStatLabel = "RETURN ON INVESTMENT (ROI)";
      let subStat = "";

      if (data.type === "pnl") {
        const roi = data.roiPct ?? 0;
        bigStat = `${roi > 0 ? "+" : ""}${roi.toFixed(2)}%`;
        bigStatLabel = "RETURN ON INVESTMENT (ROI)";
        subStat = `Net P&L: ${fmtUsd(data.pnl, hideAmount)}`;
      } else if (data.type === "signal") {
        bigStat = `${data.strength ?? 0} / 100`;
        bigStatLabel = `AI SIGNAL STRENGTH (${data.timeframe || "1h"
          .toUpperCase()})`;
        subStat = data.strategyAgreement
          ? `${data.strategyAgreement} agreement`
          : `Market Bias: ${data.bias?.toUpperCase() || "BULLISH"}`;
      } else if (data.type === "plan") {
        bigStat = data.riskReward || "1 : 3.0";
        bigStatLabel = "RISK TO REWARD RATIO (R : R)";
        subStat = `Target Move: ${fmtPct(data.roiPct)} · Capital: ${fmtUsd(
          data.riskAmount,
          hideAmount
        )}`;
      }

      // Draw Big Stat Label
      ctx.fillStyle = textMuted;
      ctx.font = "600 11.5px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
      ctx.letterSpacing = "1px";
      ctx.fillText(bigStatLabel, headerX, curY + 18);
      ctx.letterSpacing = "0px";

      // Draw Big Stat
      curY += 28;
      ctx.save();
      const bigFontSize = format === "story" ? 82 : format === "square" ? 76 : 72;
      ctx.font = `900 ${bigFontSize}px -apple-system, BlinkMacSystemFont, 'Inter', 'JetBrains Mono', sans-serif`;
      ctx.fillStyle = trendColor;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 24;
      ctx.fillText(bigStat, headerX, curY + bigFontSize * 0.82);
      ctx.restore();

      // Draw Sub Stat (P&L amount pill)
      curY += bigFontSize * 0.95;
      if (subStat) {
        ctx.fillStyle = isPositive ? "#86efac" : "#fca5a5";
        ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, 'Inter', 'JetBrains Mono', monospace";
        ctx.fillText(subStat, headerX, curY + 12);
      }

      // 8. Key Metrics Grid
      curY += format === "story" ? 54 : 36;
      const metrics: { label: string; value: string; tone?: string }[] = [];

      if (data.type === "pnl") {
        metrics.push({ label: "ENTRY PRICE", value: fmtPrice(data.entryPrice) });
        metrics.push({
          label: data.isClosed ? "EXIT PRICE" : "MARK PRICE",
          value: fmtPrice(data.markPrice),
        });
        if (data.targetPrice) {
          metrics.push({
            label: "TARGET (TP)",
            value: fmtPrice(data.targetPrice),
            tone: greenColor,
          });
        }
        if (data.stopLossPrice) {
          metrics.push({
            label: "STOP LOSS (SL)",
            value: fmtPrice(data.stopLossPrice),
            tone: redColor,
          });
        }
        if (data.size) {
          metrics.push({
            label: "POSITION SIZE",
            value: hideAmount ? "••••••" : `${data.size} units`,
          });
        }
        if (data.margin) {
          metrics.push({
            label: "MARGIN",
            value: fmtUsd(data.margin, hideAmount),
          });
        }
      } else if (data.type === "signal") {
        metrics.push({ label: "CURRENT PRICE", value: fmtPrice(data.price) });
        metrics.push({
          label: "24H CHANGE",
          value: fmtPct(data.change24h),
          tone: (data.change24h ?? 0) >= 0 ? greenColor : redColor,
        });
        metrics.push({
          label: "RSI (14)",
          value: data.rsi != null ? `${data.rsi.toFixed(1)}` : "—",
        });
        metrics.push({
          label: "STRATEGIES",
          value: data.strategyAgreement || "Consensus",
        });
      } else if (data.type === "plan") {
        metrics.push({ label: "ENTRY LEVEL", value: fmtPrice(data.entryPrice) });
        metrics.push({
          label: "TARGET",
          value: fmtPrice(data.targetPrice),
          tone: greenColor,
        });
        metrics.push({
          label: "STOP LOSS",
          value: fmtPrice(data.stopLossPrice),
          tone: redColor,
        });
        metrics.push({
          label: "BREAK-EVEN",
          value: fmtPrice(data.breakEven),
        });
      }

      // Render metrics cards
      const cols = format === "story" ? 2 : Math.min(metrics.length, 4);
      const gap = 12;
      const totalGridW = frameW - 72;
      const cardW = (totalGridW - (cols - 1) * gap) / cols;
      const cardH = 58;

      metrics.slice(0, cols * 2).forEach((m, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const cx = headerX + col * (cardW + gap);
        const cy = curY + row * (cardH + gap);

        ctx.save();
        drawRoundedRect(ctx, cx, cy, cardW, cardH, 10);
        ctx.fillStyle = cardBg;
        ctx.fill();
        ctx.strokeStyle = cardBorder;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = textMuted;
        ctx.font = "600 9.5px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
        ctx.letterSpacing = "0.5px";
        ctx.fillText(m.label, cx + 12, cy + 18);

        ctx.fillStyle = m.tone || textPrimary;
        ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, 'Inter', 'JetBrains Mono', monospace";
        ctx.fillText(m.value, cx + 12, cy + 42);
        ctx.restore();
      });

      const metricsRows = Math.ceil(Math.min(metrics.length, cols * 2) / cols);
      curY += metricsRows * (cardH + gap);

      // 9. Brag Quote / Tagline Pill
      if (tagline) {
        curY += format === "story" ? 40 : 16;
        ctx.save();
        ctx.font = "italic 500 13px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
        const tagText = `"${tagline}"`;
        const tagW = Math.min(ctx.measureText(tagText).width + 32, frameW - 72);

        drawRoundedRect(ctx, headerX, curY, tagW, 30, 8);
        ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.stroke();

        ctx.fillStyle = textPrimary;
        ctx.fillText(tagText, headerX + 16, curY + 20);
        ctx.restore();
      }

      // 10. Footer Section (pinned at bottom of frame)
      const footerY = frameY + frameH - 36;
      ctx.save();

      // Left: URL & Disclaimer
      ctx.fillStyle = accentColor;
      ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
      ctx.fillText("cryptomantra.tech", headerX, footerY - 8);

      ctx.fillStyle = textMuted;
      ctx.font = "400 10.5px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
      const nowStr = new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      ctx.fillText(
        `Verified Paper Desk · ${nowStr} · Not financial advice`,
        headerX,
        footerY + 10
      );

      // Right: QR Watermark
      if (showQr) {
        const qrSize = 42;
        const qrX = frameX + frameW - 36 - qrSize;
        const qrY = footerY - 26;
        drawStylizedQr(ctx, qrX, qrY, qrSize, accentColor);
      }
      ctx.restore();

      ctx.restore();

      canvas.toBlob((blob) => {
        resolve(blob);
      }, "image/png");
    });
  }, [data, theme, format, hideAmount, handle, tagline, showQr]);

  // Handle Download PNG
  const handleDownload = async () => {
    setRendering(true);
    try {
      const blob = await renderToCanvas();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const sym = (data?.symbol || "trade").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      a.download = `cryptomantra-${sym}-${data?.type || "card"}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setRendering(false);
    }
  };

  // Handle Copy to Clipboard
  const handleCopy = async () => {
    setRendering(true);
    try {
      const blob = await renderToCanvas();
      if (!blob) return;

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopiedToast("Image copied! Paste directly (Ctrl+V) into Telegram, Twitter, or Discord.");
        setTimeout(() => setCopiedToast(null), 4000);
      } else {
        // Fallback: download
        handleDownload();
      }
    } catch {
      handleDownload();
    } finally {
      setRendering(false);
    }
  };

  // Share to 𝕏 (Twitter)
  const handleShareTwitter = () => {
    if (!data) return;
    const pair = data.formattedSymbol || data.symbol || "Crypto";
    let text = "";

    if (data.type === "pnl") {
      const roi = data.roiPct ?? 0;
      text = `Nailed ${pair} on @cryptomantra! 🚀 ${roi > 0 ? "+" : ""}${roi.toFixed(
        2
      )}% ROI\n\nTrade smarter with AI signals & real-time Paper Trading:`;
    } else if (data.type === "signal") {
      text = `🚨 AI Screener Alert on ${pair}: ${data.bias?.toUpperCase() || "BULLISH"} Setup · Strength ${data.strength || 0}/100\n\nScanned live on @cryptomantra:`;
    } else {
      text = `Risk & Reward planning on ${pair} with @cryptomantra Desk. Calculated risk, clean execution.\n\nCheck it out:`;
    }

    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      text
    )}&url=${encodeURIComponent("https://cryptomantra.tech")}&hashtags=Crypto,Trading,Alpha,Delta`;
    window.open(url, "_blank");
  };

  // Share to Telegram
  const handleShareTelegram = () => {
    if (!data) return;
    const pair = data.formattedSymbol || data.symbol || "Crypto";
    const roi = data.roiPct ?? 0;
    const text =
      data.type === "pnl"
        ? `🔥 ${pair} Trade Result: ${roi > 0 ? "+" : ""}${roi.toFixed(2)}% ROI on Cryptomantra Paper Desk!`
        : `🚨 AI Setup: ${pair} ${data.bias?.toUpperCase() || "BULLISH"} (Strength: ${data.strength || 0}/100)`;
    const url = `https://t.me/share/url?url=${encodeURIComponent(
      "https://cryptomantra.tech"
    )}&text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  // Share to WhatsApp
  const handleShareWhatsApp = () => {
    if (!data) return;
    const pair = data.formattedSymbol || data.symbol || "Crypto";
    const roi = data.roiPct ?? 0;
    const text =
      data.type === "pnl"
        ? `*${pair} Trade Result:* ${roi > 0 ? "+" : ""}${roi.toFixed(2)}% ROI on Cryptomantra Paper Desk!\nhttps://cryptomantra.tech`
        : `*AI Setup:* ${pair} ${data.bias?.toUpperCase() || "BULLISH"}\nhttps://cryptomantra.tech`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  // Native Mobile Web Share API
  const handleNativeShare = async () => {
    if (!data) return;
    setRendering(true);
    try {
      const blob = await renderToCanvas();
      if (!blob) return;

      if (navigator.canShare) {
        const file = new File([blob], `cryptomantra-${data.symbol}.png`, {
          type: "image/png",
        });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "Cryptomantra Trade Card",
            text: `Trade verified on cryptomantra.tech`,
          });
          return;
        }
      }
      handleDownload();
    } catch {
      handleDownload();
    } finally {
      setRendering(false);
    }
  };

  if (!data) return null;

  const isLong = data.side === "long" || data.side === "buy";
  const isPositive =
    data.type === "pnl"
      ? (data.roiPct ?? 0) >= 0 && (data.pnl ?? 0) >= 0
      : data.bias === "bullish";

  return (
    <div
      className="cm-dialog-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ zIndex: 1000 }}
    >
      <div
        className="cm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Export Aesthetic Trade Card"
        style={{
          width: "min(1080px, 96vw)",
          height: "min(860px, calc(100dvh - 32px))",
          maxHeight: "92dvh",
          display: "flex",
          flexDirection: "column",
          background: "#181716",
          borderColor: "#222c3d",
        }}
      >
        {/* Header */}
        <div className="cm-dialog-head" style={{ borderBottomColor: "#1d2636" }}>
          <div>
            <h2 className="flex items-center gap-2.5 text-[19px] font-bold tracking-tight text-white">
              <Sparkles className="w-5 h-5 text-[#f97316]" />
              1-Click Aesthetic Trade Card
            </h2>
            <p className="text-[12px] text-slate-400 mt-0.5">
              Create branded, viral flex cards for 𝕏, Telegram, Instagram &amp; Discord.
            </p>
          </div>
          <button
            type="button"
            className="cm-dialog-x"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Split 2 Columns on Desktop */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
          {/* Left Column: Interactive Live Card Preview */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center">
            <div className="w-full flex items-center justify-between mb-2 px-1">
              <span className="text-[11.5px] font-semibold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Card Preview
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {format === "landscape"
                  ? "1200 × 675 (16:9)"
                  : format === "square"
                  ? "1080 × 1080 (1:1)"
                  : "1080 × 1920 (9:16)"}
              </span>
            </div>

            {/* Visual Card Frame */}
            <div
              className={`w-full max-w-[540px] relative rounded-2xl p-5 md:p-6 border transition-all duration-300 shadow-2xl flex flex-col justify-between overflow-hidden ${
                format === "square"
                  ? "aspect-square"
                  : format === "story"
                  ? "aspect-[9/16] max-h-[580px]"
                  : "aspect-[16/9]"
              }`}
              style={{
                background:
                  theme === "cyber"
                    ? "radial-gradient(ellipse at 40% 30%, rgba(0, 230, 118, 0.12), transparent 60%), linear-gradient(135deg, #070c14 0%, #0a1322 50%, #05090f 100%)"
                    : theme === "minimal"
                    ? "linear-gradient(135deg, #101319 0%, #151a24 100%)"
                    : theme === "gold"
                    ? "radial-gradient(ellipse at 35% 25%, rgba(245, 158, 11, 0.15), transparent 60%), linear-gradient(135deg, #0e0f14 0%, #17161f 100%)"
                    : "radial-gradient(ellipse at 40% 30%, rgba(168, 85, 247, 0.16), transparent 60%), linear-gradient(135deg, #0b0816 0%, #170f2f 100%)",
                borderColor:
                  theme === "cyber"
                    ? "rgba(249, 115, 22, 0.28)"
                    : theme === "gold"
                    ? "rgba(245, 158, 11, 0.35)"
                    : theme === "glass"
                    ? "rgba(192, 132, 252, 0.3)"
                    : "rgba(255, 255, 255, 0.12)",
              }}
            >
              {/* Subtle Grid overlay for cyber */}
              {theme === "cyber" && (
                <div
                  className="absolute inset-0 pointer-events-none opacity-20"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(249, 115, 22, 0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(249, 115, 22, 0.15) 1px, transparent 1px)",
                    backgroundSize: "28px 28px",
                  }}
                />
              )}

              {/* Card Header */}
              <div className="relative z-10 flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-black text-sm shadow-md"
                    style={{
                      background:
                        theme === "gold"
                          ? "linear-gradient(135deg, #fbbf24, #d97706)"
                          : "linear-gradient(135deg, #ff827a, #ffa825)",
                    }}
                  >
                    ⚡
                  </div>
                  <div>
                    <div className="text-[14px] font-bold text-white tracking-wider flex items-center gap-1.5">
                      CRYPTOMANTRA
                    </div>
                    <div className="text-[9px] tracking-widest uppercase text-slate-400 font-semibold">
                      {data.type === "signal"
                        ? "AI QUANT SCREENER"
                        : data.type === "plan"
                        ? "RISK ARCHITECT"
                        : "PAPER TRADING DESK"}
                    </div>
                  </div>
                </div>

                <div
                  className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase border backdrop-blur-sm"
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    borderColor:
                      theme === "gold"
                        ? "rgba(245, 158, 11, 0.4)"
                        : "rgba(249, 115, 22, 0.4)",
                    color: theme === "gold" ? "#fbbf24" : "#38bdf8",
                  }}
                >
                  {data.type === "pnl"
                    ? data.isClosed
                      ? "CLOSED"
                      : "LIVE POSITION"
                    : data.type === "signal"
                    ? "ALPHA SETUP"
                    : "QUANT PLAN"}
                </div>
              </div>

              {/* Card Center: Hero Stats */}
              <div className="relative z-10 my-auto py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[18px] md:text-[22px] font-bold text-white tracking-tight">
                    {data.formattedSymbol || data.symbol}
                  </span>
                  <span
                    className={`text-[10.5px] font-bold px-2 py-0.5 rounded border uppercase ${
                      isPositive
                        ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                        : "bg-red-500/15 border-red-500/40 text-red-400"
                    }`}
                  >
                    {data.type === "signal"
                      ? data.bias
                      : isLong
                      ? `LONG ${data.leverage || "1x"}`
                      : `SHORT ${data.leverage || "1x"}`}
                  </span>
                </div>

                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {data.type === "pnl"
                    ? "RETURN ON INVESTMENT (ROI)"
                    : data.type === "signal"
                    ? `AI SIGNAL STRENGTH (${data.timeframe || "1h"})`
                    : "RISK TO REWARD RATIO"}
                </div>

                {/* Big Stat Value */}
                <div
                  className="text-[40px] md:text-[50px] font-black tracking-tight leading-none my-1 font-mono"
                  style={{
                    color: isPositive ? "#00e676" : "#ff5252",
                    textShadow: isPositive
                      ? "0 0 24px rgba(0, 230, 118, 0.35)"
                      : "0 0 24px rgba(255, 82, 82, 0.35)",
                  }}
                >
                  {data.type === "pnl"
                    ? `${(data.roiPct ?? 0) > 0 ? "+" : ""}${(data.roiPct ?? 0).toFixed(2)}%`
                    : data.type === "signal"
                    ? `${data.strength ?? 0} / 100`
                    : data.riskReward || "1 : 3.0"}
                </div>

                {/* Substat (Net P&L) */}
                <div className="text-[12px] font-bold text-emerald-300 font-mono flex items-center gap-2">
                  {data.type === "pnl" ? (
                    <span>Net P&amp;L: {fmtUsd(data.pnl, hideAmount)}</span>
                  ) : data.type === "signal" ? (
                    <span>{data.strategyAgreement || "Consensus confirmed"}</span>
                  ) : (
                    <span>Target: {fmtPct(data.roiPct)} Move</span>
                  )}
                </div>

                {/* Tagline / Brag pill */}
                {tagline && (
                  <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium italic text-slate-300 bg-white/5 border border-white/10 max-w-full truncate">
                    <span>{tagline}</span>
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="relative z-10 flex items-end justify-between border-t border-white/10 pt-3">
                <div>
                  <div className="text-[11.5px] font-bold text-[#f97316]">
                    cryptomantra.tech
                  </div>
                  <div className="text-[9.5px] text-slate-400">
                    {handle} · Verified Paper Desk
                  </div>
                </div>

                {showQr && (
                  <div className="flex flex-col items-center gap-0.5 opacity-80">
                    <div className="w-7 h-7 bg-white/10 border border-white/20 rounded p-1 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-[#f97316]" />
                    </div>
                    <span className="text-[7.5px] text-slate-500 font-mono">SCAN</span>
                  </div>
                )}
              </div>
            </div>

            {/* Toast Notification */}
            {copiedToast && (
              <div className="mt-3 px-3.5 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[12px] font-medium flex items-center gap-2 animate-bounce">
                <Check className="w-4 h-4" />
                {copiedToast}
              </div>
            )}
          </div>

          {/* Right Column: Customization Controls & Action Buttons */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              {/* Theme Selector */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Palette className="w-3.5 h-3.5 text-[#f97316]" />
                  Visual Theme
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "cyber", name: "Cyber Neon", desc: "Binance Pro Matrix" },
                    { id: "minimal", name: "TV Minimal", desc: "TradingView Charcoal" },
                    { id: "gold", name: "VIP Gold", desc: "Hedge Fund Luxury" },
                    { id: "glass", name: "Midnight Glass", desc: "Neon Violet Aurora" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id as ShareTheme)}
                      className={`text-left p-2.5 rounded-xl border transition-all ${
                        theme === t.id
                          ? "bg-[#f97316]/15 border-[#f97316] text-white shadow-sm"
                          : "bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="text-[12px] font-semibold">{t.name}</div>
                      <div className="text-[10px] text-slate-400">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Format / Aspect Ratio */}
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 block">
                  Card Aspect Ratio
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "landscape", label: "𝕏 / Telegram", sub: "16:9 Banner" },
                    { id: "square", label: "Instagram", sub: "1:1 Square" },
                    { id: "story", label: "Stories", sub: "9:16 Full" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFormat(f.id as ShareFormat)}
                      className={`py-2 px-2 rounded-xl border text-center transition-all ${
                        format === f.id
                          ? "bg-[#f97316]/15 border-[#f97316] text-white"
                          : "bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.06]"
                      }`}
                    >
                      <div className="text-[11.5px] font-semibold">{f.label}</div>
                      <div className="text-[9.5px] text-slate-400">{f.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Privacy & Handle Settings */}
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                {/* Privacy Toggle */}
                {data.type === "pnl" && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-300 flex items-center gap-2">
                      {hideAmount ? (
                        <EyeOff className="w-4 h-4 text-amber-400" />
                      ) : (
                        <Eye className="w-4 h-4 text-emerald-400" />
                      )}
                      Hide Dollar ($) Amount
                    </span>
                    <button
                      type="button"
                      onClick={() => setHideAmount(!hideAmount)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        hideAmount ? "bg-[#f97316]" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                          hideAmount ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                )}

                {/* Trader Handle */}
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Trader Handle (Watermark)
                  </label>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => updateHandle(e.target.value)}
                    placeholder="@yourhandle"
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#f97316]"
                  />
                </div>

                {/* Tagline Picker */}
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">
                    Brag Tagline
                  </label>
                  <select
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[12px] text-white focus:outline-none focus:border-[#f97316] mb-1.5"
                  >
                    {(DEFAULT_TAGLINES[data.type] || DEFAULT_TAGLINES.pnl).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="Or type custom quote..."
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[11.5px] text-white focus:outline-none focus:border-[#f97316]"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons: 1-Click Export & Direct Socials */}
            <div className="space-y-2.5 pt-2">
              <div className="grid grid-cols-2 gap-2">
                {/* Download PNG */}
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={rendering}
                  className="w-full py-2.5 px-3 rounded-xl bg-[#f97316] hover:bg-[#fb923c] text-black font-bold text-[12.5px] flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#f97316]/20 cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  Download PNG
                </button>

                {/* Copy Image to Clipboard */}
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={rendering}
                  className="w-full py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-[12.5px] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Copy className="w-4 h-4" />
                  Copy Image
                </button>
              </div>

              {/* Direct Social Media Share Bar */}
              <div className="grid grid-cols-3 gap-2">
                {/* 𝕏 / Twitter */}
                <button
                  type="button"
                  onClick={handleShareTwitter}
                  className="py-2 px-2.5 rounded-xl bg-black/60 hover:bg-black border border-white/15 text-white font-medium text-[11.5px] flex items-center justify-center gap-1.5 transition-all"
                  title="Share to 𝕏 / Twitter"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Share on 𝕏
                </button>

                {/* Telegram */}
                <button
                  type="button"
                  onClick={handleShareTelegram}
                  className="py-2 px-2.5 rounded-xl bg-[#229ED9]/15 hover:bg-[#229ED9]/25 border border-[#229ED9]/30 text-[#229ED9] font-medium text-[11.5px] flex items-center justify-center gap-1.5 transition-all"
                  title="Share to Telegram"
                >
                  <Send className="w-3.5 h-3.5" />
                  Telegram
                </button>

                {/* WhatsApp */}
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="py-2 px-2.5 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/30 text-[#25D366] font-medium text-[11.5px] flex items-center justify-center gap-1.5 transition-all"
                  title="Share to WhatsApp"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
              </div>

              {/* Native Mobile Share if supported */}
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="w-full py-1.5 text-center text-[11px] text-slate-400 hover:text-white transition-colors"
                >
                  Share via device apps...
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Hidden offscreen canvas element */}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
    </div>
  );
}
