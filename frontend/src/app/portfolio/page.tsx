"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DonutChart from "@/components/portfolio/DonutChart";
import FileCard from "@/components/portfolio/FileCard";
import HoldingCard from "@/components/portfolio/HoldingCard";
import { CHART_COLORS, PnlByHoldingChart, TopHoldingsChart } from "@/components/portfolio/PortfolioCharts";
import Logo from "@/components/Logo";
import { parsePortfolioFile } from "@/lib/portfolioFileImport";
import {
  buildPortfolioPrompt,
  calcSummary,
  clearPortfolio,
  fmtINR,
  fmtPct,
  importPortfolioFile,
  loadHoldings,
  loadPortfolioFiles,
  rebuildPortfolioAIContext,
  removePortfolioFile,
  type Holding,
  type PortfolioFile,
  type PricedHolding,
} from "@/lib/portfolio";
import {
  fetchCryptoPrices,
  fetchStockPrices,
  getUsdInrRate,
  type PriceResult,
} from "@/lib/priceApi";

const ACCEPTED_EXTENSIONS = ["csv", "txt", "xlsx", "xls", "pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_FILES_PER_UPLOAD = 5;

const AI_SUGGESTIONS = [
  "Meri portfolio diversification kaisi hai?",
  "Sabse zyada risk kis holding mein hai?",
  "Portfolio rebalance karna chahiye toh kya badlun?",
  "Mere portfolio par tax ka kya impact hoga?",
];

type UploadStatus = "idle" | "parsing" | "success" | "error";

function toPricedHolding(
  h: Holding,
  price: PriceResult | undefined,
  usdInr: number,
  loading: boolean
): PricedHolding {
  const investedINR =
    h.quantity * h.buyPrice * (h.currency === "USD" ? usdInr : 1);

  if (loading) {
    return { ...h, currentPrice: 0, currentValue: 0, currentValueINR: 0, investedINR, pnlINR: 0, pnlPct: 0, change24h: 0, priceLoading: true, priceError: false };
  }
  if (!price) {
    return { ...h, currentPrice: 0, currentValue: 0, currentValueINR: 0, investedINR, pnlINR: 0, pnlPct: 0, change24h: 0, priceLoading: false, priceError: true };
  }

  const currentPrice = price.price;
  const currentValue = h.quantity * currentPrice;
  const currentValueINR = h.type === "crypto" ? currentValue * usdInr : currentValue;
  const pnlINR = currentValueINR - investedINR;
  const pnlPct = investedINR > 0 ? (pnlINR / investedINR) * 100 : 0;

  return { ...h, currentPrice, currentValue, currentValueINR, investedINR, pnlINR, pnlPct, change24h: price.change24h, priceLoading: false, priceError: false };
}

const StatCard = ({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color?: string; icon: string }) => (
  <div className="card-elevated rounded-2xl p-5 flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-base">{icon}</span>
    </div>
    <p className="text-xl font-bold" style={{ color: color ?? "var(--text-primary)" }}>{value}</p>
    {sub && <p className="text-xs" style={{ color: color ? color + "aa" : "var(--text-muted)" }}>{sub}</p>}
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{children}</p>
);

export default function PortfolioPage() {
  const router = useRouter();
  const [files, setFiles] = useState<PortfolioFile[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [priced, setPriced] = useState<PricedHolding[]>([]);
  const [usdInr, setUsdInr] = useState(84);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<"all" | "stock" | "crypto" | "mf">("all");
  const [upload, setUpload] = useState<{ status: UploadStatus; message: string }>({ status: "idle", message: "" });
  const [dragActive, setDragActive] = useState(false);
  const [askText, setAskText] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const reloadData = useCallback(() => {
    setFiles(loadPortfolioFiles());
    setHoldings(loadHoldings());
  }, []);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  // ── Live prices ───────────────────────────────────────────────────────────

  const refreshPrices = useCallback(async (items: Holding[]) => {
    setLoadingPrices(true);
    const rate = await getUsdInrRate();
    setUsdInr(rate);

    const stocks = items.filter((h) => h.type === "stock").map((h) => h.symbol);
    const cryptos = items.filter((h) => h.type === "crypto").map((h) => h.symbol);

    let stockPrices: Record<string, PriceResult> = {};
    let cryptoPrices: Record<string, PriceResult> = {};
    try {
      [stockPrices, cryptoPrices] = await Promise.all([
        fetchStockPrices(stocks).catch(() => ({})),
        fetchCryptoPrices(cryptos).catch(() => ({})),
      ]);
    } catch { /* partial ok */ }

    setPriced(items.map((h) => {
      if (h.type === "mf") {
        return toPricedHolding(h, { symbol: h.symbol, price: h.buyPrice, priceINR: h.buyPrice, change24h: 0, name: h.name }, rate, false);
      }
      const prices = h.type === "stock" ? stockPrices : cryptoPrices;
      return toPricedHolding(h, prices[h.symbol.toUpperCase()], rate, false);
    }));
    setLoadingPrices(false);
  }, []);

  useEffect(() => {
    if (!holdings.length) { setPriced([]); setLoadingPrices(false); return; }
    setPriced(holdings.map((h) => toPricedHolding(h, undefined, usdInr, true)));
    refreshPrices(holdings);
  }, [holdings, refreshKey, refreshPrices]);

  // Live prices aane ke baad AI context ko fresh numbers ke saath rebuild karo
  useEffect(() => {
    if (loadingPrices || !holdings.length) return;
    const ready = priced.some((p) => !p.priceLoading);
    if (!ready) return;
    rebuildPortfolioAIContext(priced, usdInr);
  }, [priced, loadingPrices, usdInr, holdings.length]);

  // ── File upload ───────────────────────────────────────────────────────────

  const handleFiles = useCallback(async (list: FileList | File[]) => {
    const selected = Array.from(list).slice(0, MAX_FILES_PER_UPLOAD);
    if (!selected.length) return;

    setUpload({
      status: "parsing",
      message: selected.length > 1
        ? `${selected.length} files process ho rahi hain…`
        : `"${selected[0].name}" process ho rahi hai…`,
    });

    let holdingsAdded = 0;
    let docsConnected = 0;
    let replaced = 0;
    const failed: string[] = [];

    for (const file of selected) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        failed.push(`${file.name} — format support nahi (CSV, Excel, PDF)`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        failed.push(`${file.name} — 10MB se badi hai`);
        continue;
      }
      try {
        const result = await parsePortfolioFile(file);
        if (!result.holdingsReady.length && !result.rawText?.trim()) {
          failed.push(`${file.name} — ${result.errors[0] ?? "koi data nahi mila"}`);
          continue;
        }
        const imported = importPortfolioFile(result, file.size);
        if (imported.holdingsAdded > 0) holdingsAdded += imported.holdingsAdded;
        else docsConnected++;
        if (imported.replacedExisting) replaced++;
      } catch {
        failed.push(`${file.name} — process nahi ho payi`);
      }
    }

    reloadData();

    if (!holdingsAdded && !docsConnected) {
      setUpload({ status: "error", message: failed.join(" · ") || "File process nahi ho payi" });
      return;
    }

    const parts: string[] = [];
    if (holdingsAdded) parts.push(`✓ ${holdingsAdded} holdings import ho gayi`);
    if (docsConnected) parts.push(`✓ ${docsConnected} document AI se connect ho gaya`);
    if (replaced) parts.push("purani file replace hui");
    if (failed.length) parts.push(`skip: ${failed.join(", ")}`);
    setUpload({ status: "success", message: parts.join(" · ") });
  }, [reloadData]);

  // Success banner auto-dismiss
  useEffect(() => {
    if (upload.status !== "success") return;
    const t = setTimeout(() => setUpload({ status: "idle", message: "" }), 6000);
    return () => clearTimeout(t);
  }, [upload]);

  const openFilePicker = () => fileRef.current?.click();

  // ── Page-level drag & drop ────────────────────────────────────────────────

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounter.current++;
    setDragActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragActive(false);
    if (e.dataTransfer.files?.length && upload.status !== "parsing") {
      handleFiles(e.dataTransfer.files);
    }
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleRemoveFile = (id: string) => {
    const file = files.find((f) => f.id === id);
    const label = file ? `"${file.fileName}"` : "file";
    if (!confirm(`${label} remove karein? Iski holdings aur AI data bhi hat jayega.`)) return;
    removePortfolioFile(id);
    reloadData();
  };

  const handleClearAll = () => {
    if (!confirm("Saari files aur portfolio data remove karein? Yeh undo nahi hoga.")) return;
    clearPortfolio();
    reloadData();
  };

  const goToChat = (prompt: string) => {
    sessionStorage.setItem("arjunai_portfolio_prompt", prompt);
    router.push("/");
  };

  const handleAnalyze = () => {
    const prompt = holdings.length
      ? buildPortfolioPrompt(priced, usdInr)
      : "Meri uploaded portfolio file analyze karo — allocation, risk aur improvements batao.";
    goToChat(prompt);
  };

  const handleAsk = (question: string) => {
    const q = question.trim();
    if (!q) return;
    goToChat(q);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const summary = useMemo(() => calcSummary(priced), [priced]);
  const pnlPositive = summary.totalPnlINR >= 0;
  const hasData = files.length > 0 || holdings.length > 0;

  const chartSegments = useMemo(() => [
    { label: "Stocks", value: summary.stocksValueINR, color: CHART_COLORS.stock },
    { label: "Crypto", value: summary.cryptoValueINR, color: CHART_COLORS.crypto },
    { label: "Mutual Funds", value: summary.mfValueINR, color: CHART_COLORS.mf },
  ], [summary]);

  const filteredPriced = activeTab === "all" ? priced : priced.filter((h) => h.type === activeTab);

  const TABS = [
    { id: "all" as const, label: "All", count: priced.length },
    { id: "stock" as const, label: "Stocks", count: priced.filter((h) => h.type === "stock").length, color: CHART_COLORS.stock },
    { id: "crypto" as const, label: "Crypto", count: priced.filter((h) => h.type === "crypto").length, color: CHART_COLORS.crypto },
    { id: "mf" as const, label: "MF", count: priced.filter((h) => h.type === "mf").length, color: CHART_COLORS.mf },
  ];

  return (
    <div
      className="h-full overflow-y-auto relative"
      style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.xlsx,.xls,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Drag overlay */}
      {dragActive && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: "color-mix(in srgb, var(--bg-primary) 85%, transparent)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="rounded-3xl px-12 py-10 text-center border-2 border-dashed"
            style={{ borderColor: "var(--accent)", background: "var(--bg-card)" }}
          >
            <svg className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-base font-semibold">Portfolio file yahan drop karein</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>CSV · Excel · PDF</p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-5 py-3"
        style={{ background: "color-mix(in srgb, var(--bg-primary) 91%, transparent)", borderBottom: "1px solid var(--bg-hover)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <Logo size={24} />
          <div>
            <h1 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>My Portfolio</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {files.length} file{files.length === 1 ? "" : "s"} · {holdings.length} holdings
              {holdings.length > 0 && <> · USD/INR ₹{usdInr.toFixed(1)}</>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {holdings.length > 0 && (
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loadingPrices}
              className="p-1.5 rounded-lg transition-all"
              style={{ background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
              title="Refresh prices"
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}>
              <svg className={`w-4 h-4 ${loadingPrices ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          <button
            onClick={openFilePicker}
            disabled={upload.status === "parsing"}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, #1e40af, #2563eb)",
              color: "#ffffff",
              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.22)",
              opacity: upload.status === "parsing" ? 0.6 : 1,
            }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Add File
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── Upload status banner ── */}
        {upload.status !== "idle" && (
          <div
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm"
            style={
              upload.status === "error"
                ? { background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#dc2626" }
                : upload.status === "success"
                ? { background: "rgba(37, 99, 235, 0.1)", border: "1px solid rgba(37, 99, 235, 0.22)", color: "var(--accent)" }
                : { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-secondary)" }
            }
          >
            {upload.status === "parsing" && (
              <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            <span className="flex-1 min-w-0">{upload.message}</span>
            {upload.status !== "parsing" && (
              <button onClick={() => setUpload({ status: "idle", message: "" })} className="flex-shrink-0 opacity-70 hover:opacity-100">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {!hasData ? (
          /* ── Empty state: file connect hero ── */
          <>
            <div className="card-elevated rounded-2xl p-8 sm:p-12 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                style={{ background: "rgba(37, 99, 235, 0.1)", border: "1px solid rgba(37, 99, 235, 0.22)" }}>
                <svg className="w-8 h-8" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold mb-2">Portfolio file se connect karein</h2>
              <p className="text-sm max-w-md mx-auto mb-6" style={{ color: "var(--text-secondary)" }}>
                Apne broker ka holdings ya statement file upload karo — Finowings AI usse padh kar
                aapke portfolio ke har sawaal ka jawab dega.
              </p>

              <div
                role="button"
                tabIndex={0}
                onClick={() => upload.status !== "parsing" && openFilePicker()}
                onKeyDown={(e) => e.key === "Enter" && openFilePicker()}
                className="max-w-lg mx-auto py-10 px-6 rounded-2xl border-2 border-dashed cursor-pointer transition-all"
                style={{ borderColor: "var(--border)", background: "var(--bg-secondary)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(37, 99, 235, 0.38)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                <svg className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm font-semibold mb-1">File yahan drop karein ya click karke select karein</p>
                <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
                  Zerodha, Groww, Upstox, Angel One — kisi bhi broker ka export chalega
                </p>
                <div className="flex items-center justify-center gap-2">
                  {[
                    { label: "CSV", color: "var(--accent)" },
                    { label: "Excel", color: "#2563eb" },
                    { label: "PDF", color: "#f87171" },
                  ].map((f) => (
                    <span key={f.label} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                      style={{ background: `${f.color}12`, color: f.color, border: `1px solid ${f.color}30` }}>
                      {f.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { step: "1", title: "File upload karein", desc: "Broker se holdings/statement download karke yahan add karo", icon: "📄" },
                { step: "2", title: "Data auto-parse hota hai", desc: "Holdings, quantity aur buy price file se nikal aate hain", icon: "⚡" },
                { step: "3", title: "AI se poochhein", desc: "Diversification, risk, P&L — apne data par based jawab", icon: "✨" },
              ].map((s) => (
                <div key={s.step} className="card-elevated rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold"
                      style={{ background: "rgba(37, 99, 235, 0.1)", color: "var(--accent)" }}>{s.step}</span>
                    <span className="text-base">{s.icon}</span>
                  </div>
                  <p className="text-sm font-semibold mb-1">{s.title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{s.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                100% secure — aapka data sirf aapke browser mein rehta hai, kahin upload nahi hota
              </span>
            </div>
          </>
        ) : (
          <>
            {/* ── Summary + Charts (sirf jab structured holdings hain) ── */}
            {holdings.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard
                    label="Total Invested"
                    value={fmtINR(summary.totalInvestedINR)}
                    sub={`${holdings.length} positions`}
                    icon="💼"
                  />
                  <StatCard
                    label="Current Value"
                    value={fmtINR(summary.totalCurrentINR)}
                    sub={loadingPrices ? "Fetching live prices..." : "Live prices"}
                    icon="📈"
                  />
                  <StatCard
                    label="Overall P&L"
                    value={`${pnlPositive ? "+" : ""}${fmtINR(summary.totalPnlINR)}`}
                    sub={fmtPct(summary.totalPnlPct)}
                    color={pnlPositive ? "#10b981" : "#f87171"}
                    icon={pnlPositive ? "🟢" : "🔴"}
                  />
                </div>

                {/* ── Charts ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                  <div className="card-elevated rounded-2xl p-5">
                    <div className="mb-4">
                      <SectionTitle>Asset Allocation</SectionTitle>
                    </div>
                    <div className="flex flex-col items-center gap-5">
                      <DonutChart segments={chartSegments} total={summary.totalCurrentINR} size={150} />
                      <div className="w-full space-y-3">
                        {chartSegments.filter((s) => s.value > 0).map((seg) => {
                          const pct = summary.totalCurrentINR > 0 ? ((seg.value / summary.totalCurrentINR) * 100).toFixed(1) : "0";
                          return (
                            <div key={seg.label}>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full" style={{ background: seg.color }} />
                                  <span style={{ color: "var(--text-secondary)" }}>{seg.label}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{pct}%</span>
                                  <span className="font-medium text-sm">{fmtINR(seg.value)}</span>
                                </div>
                              </div>
                              <div className="h-1 rounded-full" style={{ background: "var(--bg-hover)" }}>
                                <div className="h-full rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%`, background: seg.color, opacity: 0.8 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <PnlByHoldingChart holdings={priced} />
                </div>
                <TopHoldingsChart holdings={priced} />
              </>
            ) : (
              /* Files hain par structured holdings nahi (PDF/document case) */
              <div
                className="flex items-start gap-3 rounded-2xl p-4 text-sm"
                style={{ background: "rgba(37, 99, 235, 0.06)", border: "1px solid rgba(37, 99, 235, 0.2)", color: "var(--text-secondary)" }}
              >
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>
                  File se structured holdings nahi mili, lekin document AI se connected hai —
                  neeche se apne portfolio ke baare mein kuch bhi poochh sakte hain.
                </p>
              </div>
            )}

            {/* ── Ask AI ── */}
            <section className="card-elevated rounded-2xl p-5 space-y-4"
              style={{ backgroundImage: "linear-gradient(135deg, #ffffff 0%, #f3f7f6 100%)" }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <h2 className="text-sm font-bold">Apne portfolio se poochhein</h2>
                </div>
                <span className="text-xs hidden sm:block" style={{ color: "var(--text-muted)" }}>
                  AI ke paas aapki files ka data hai
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {AI_SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleAsk(q)}
                    className="text-xs px-3 py-2 rounded-xl text-left transition-all"
                    style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(37, 99, 235, 0.32)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                  >
                    {q}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={askText}
                  onChange={(e) => setAskText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAsk(askText)}
                  placeholder="Ya apna sawaal likhein — jaise 'IT stocks mein kitna paisa laga hai?'"
                  className="flex-1 px-3.5 py-2.5 rounded-xl text-sm outline-none min-w-0"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37, 99, 235, 0.32)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                />
                <button
                  onClick={() => handleAsk(askText)}
                  disabled={!askText.trim()}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex-shrink-0"
                  style={{
                    background: askText.trim() ? "linear-gradient(135deg, #1e40af, #2563eb)" : "var(--bg-hover)",
                    color: askText.trim() ? "#ffffff" : "var(--text-muted)",
                  }}
                >
                  Ask AI
                </button>
              </div>

              {holdings.length > 0 && (
                <button
                  onClick={handleAnalyze}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                  style={{ background: "linear-gradient(135deg, #1e40af, #2563eb)", color: "#ffffff", boxShadow: "0 4px 16px rgba(37, 99, 235, 0.22)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 24px rgba(37, 99, 235, 0.28)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(37, 99, 235, 0.22)"; }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  Full Portfolio Analysis with Finowings AI
                </button>
              )}
            </section>

            {/* ── Connected files ── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionTitle>Connected Files ({files.length})</SectionTitle>
                <button
                  onClick={handleClearAll}
                  className="text-xs transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                  Clear all
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {files.map((f) => (
                  <FileCard key={f.id} file={f} onRemove={handleRemoveFile} />
                ))}
                {/* Add file tile */}
                <button
                  onClick={openFilePicker}
                  disabled={upload.status === "parsing"}
                  className="flex items-center justify-center gap-2 rounded-2xl p-3.5 border border-dashed text-sm transition-all min-h-[68px]"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)", background: "transparent" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(37, 99, 235, 0.38)"; e.currentTarget.style.color = "var(--accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Aur file add karein
                </button>
              </div>
            </section>

            {/* ── Holdings ── */}
            {holdings.length > 0 && (
              <section className="space-y-4">
                <div className="card-elevated flex items-center gap-1 p-1 rounded-xl w-fit">
                  {TABS.filter((t) => t.count > 0 || t.id === "all").map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{
                        background: activeTab === tab.id ? "var(--border)" : "transparent",
                        color: activeTab === tab.id ? (tab.color ?? "var(--text-primary)") : "var(--text-muted)",
                      }}>
                      {tab.label}
                      {tab.count > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-xs"
                          style={{ background: activeTab === tab.id ? "var(--text-muted)" : "var(--bg-hover)", color: activeTab === tab.id ? (tab.color ?? "var(--text-secondary)") : "var(--text-muted)" }}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {filteredPriced.length === 0 ? (
                  <div className="card-elevated rounded-2xl p-8 text-center" style={{ borderStyle: "dashed" }}>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>No {activeTab} holdings yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredPriced.map((h) => (
                      <HoldingCard key={h.id} holding={h} usdInr={usdInr} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {/* Footer note */}
        <p className="text-center text-xs pb-4" style={{ color: "var(--border)" }}>
          Prices: CoinGecko (crypto) · Yahoo Finance (stocks) · Manual (MF) · For reference only, not financial advice
        </p>
      </main>
    </div>
  );
}
