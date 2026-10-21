"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Coins, RefreshCw, SlidersHorizontal, Sparkles } from "lucide-react";
import {
  computeConversion,
  PRICE_SOURCES,
  SUPPORTED_CURRENCIES,
  type CurrencyItem,
} from "@/lib/calculators/converter";
import { fmtMoney, fmtNum, fmtQty, toNum } from "@/lib/calculators/format";
import {
  CalcLayout,
  Chips,
  EmptyState,
  Field,
  Flow,
  Hero,
  Notice,
  Optional,
  Pill,
  SectionTitle,
  Stats,
  Walkthrough,
} from "./ui";

const QUICK_AMOUNTS = ["0.01", "0.05", "0.1", "0.5", "1", "5"];

export default function CryptoConverter() {
  const [fromCode, setFromCode] = useState<string>("BTC");
  const [toCode, setToCode] = useState<string>("USDT");
  const [amount, setAmount] = useState<string>("0.05");
  const [source, setSource] = useState<string>("binance");
  const [feePct, setFeePct] = useState<string>("0.1");
  const [lastUpdated, setLastUpdated] = useState<string>("Live Feed");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [liveRates, setLiveRates] = useState<Record<string, number>>({});

  // Fetch live prices from public endpoint or fallback
  const fetchPrices = async () => {
    setIsRefreshing(true);
    try {
      // Fetch major coins from Binance ticker
      const res = await fetch("https://api.binance.com/api/v3/ticker/price", {
        cache: "no-store",
      });
      if (res.ok) {
        const data: Array<{ symbol: string; price: string }> = await res.json();
        const map: Record<string, number> = {
          USDT: 1.0,
          USD: 1.0,
          USDC: 1.0,
          INR: 1 / 87.1, // ~87.1 INR per USD
          EUR: 1.085,
          GBP: 1.302,
          AED: 1 / 3.6725,
        };

        data.forEach((item) => {
          if (item.symbol.endsWith("USDT")) {
            const base = item.symbol.replace("USDT", "");
            map[base] = Number(item.price);
          }
        });

        setLiveRates(map);
        const now = new Date();
        setLastUpdated(
          now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        );
      }
    } catch {
      // Fallback to internal rates
      const fallback: Record<string, number> = {};
      SUPPORTED_CURRENCIES.forEach((c) => {
        fallback[c.code] = c.defaultPriceUsd;
      });
      setLiveRates(fallback);
      setLastUpdated("Cached Rates");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 30_000);
    return () => clearInterval(interval);
  }, []);

  const n = {
    amount: toNum(amount),
    feePct: toNum(feePct, 0),
  };

  const outcome = useMemo(
    () =>
      computeConversion({
        from: fromCode,
        to: toCode,
        amount: n.amount,
        rates: liveRates,
        feePct: n.feePct,
        source,
      }),
    [fromCode, toCode, n.amount, liveRates, n.feePct, source],
  );

  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const swapCurrencies = () => {
    setFromCode(toCode);
    setToCode(fromCode);
  };

  const reset = () => {
    setFromCode("BTC");
    setToCode("USDT");
    setAmount("0.05");
    setSource("binance");
    setFeePct("0.1");
  };

  const bad = {
    amount: amount !== "" && !(n.amount > 0),
    feePct: feePct !== "" && !(n.feePct >= 0),
  };

  const inputs = (
    <>
      {/* From Currency Selector */}
      <div className="cx-field">
        <label className="cx-label">From Currency (Asset)</label>
        <div className="flex gap-2">
          <select
            className="flex-1 rounded-lg bg-black/40 border border-white/10 p-2.5 text-sm font-semibold text-white focus:outline-none focus:border-cyan-500"
            value={fromCode}
            onChange={(e) => setFromCode(e.target.value)}
          >
            <optgroup label="Cryptocurrencies">
              {SUPPORTED_CURRENCIES.filter((c) => !c.isFiat).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Fiat Currencies">
              {SUPPORTED_CURRENCIES.filter((c) => c.isFiat).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name} ({c.symbol})
                </option>
              ))}
            </optgroup>
          </select>

          <button
            type="button"
            className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 hover:text-white transition-colors flex items-center justify-center"
            onClick={swapCurrencies}
            title="Swap From and To"
          >
            <ArrowRightLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* To Currency Selector */}
      <div className="cx-field">
        <label className="cx-label">To Currency (Convert Into)</label>
        <select
          className="w-full rounded-lg bg-black/40 border border-white/10 p-2.5 text-sm font-semibold text-white focus:outline-none focus:border-cyan-500"
          value={toCode}
          onChange={(e) => setToCode(e.target.value)}
        >
          <optgroup label="Fiat Currencies">
            {SUPPORTED_CURRENCIES.filter((c) => c.isFiat).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name} ({c.symbol})
              </option>
            ))}
          </optgroup>
          <optgroup label="Cryptocurrencies">
            {SUPPORTED_CURRENCIES.filter((c) => !c.isFiat).map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      <Field
        label={`Amount to Convert (${fromCode})`}
        hint={`Enter quantity of ${fromCode} you want to exchange`}
        value={amount}
        onChange={setAmount}
        prefix={SUPPORTED_CURRENCIES.find((c) => c.code === fromCode)?.symbol || ""}
        min={0.000001}
        invalid={bad.amount}
      />

      <Chips
        options={QUICK_AMOUNTS}
        value={amount}
        onPick={setAmount}
        suffix={` ${fromCode}`}
        label="Amount presets"
      />

      <div className="cx-field">
        <div className="flex items-center justify-between">
          <label className="cx-label">Price Source / Exchange</label>
          <button
            type="button"
            className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
            onClick={fetchPrices}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh Rates
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {PRICE_SOURCES.map((ps) => (
            <button
              key={ps.id}
              type="button"
              className={`text-left p-2 rounded-lg text-xs font-medium border transition-colors ${
                source === ps.id
                  ? "bg-cyan-500/10 border-cyan-500 text-cyan-300"
                  : "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white"
              }`}
              onClick={() => setSource(ps.id)}
            >
              <div className="font-semibold text-white">{ps.name}</div>
              <div className="text-[10px] text-slate-400 truncate">{ps.description}</div>
            </button>
          ))}
        </div>
      </div>

      <Optional>
        <Field
          label="Exchange Trading Fee %"
          hint="Maker/Taker conversion fee (default: 0.10%)"
          value={feePct}
          onChange={setFeePct}
          suffix="%"
          min={0}
          optional
          placeholder="0.10"
          invalid={bad.feePct}
        />
      </Optional>
    </>
  );

  const formatConverted = (val: number, item: CurrencyItem) => {
    if (item.isFiat) {
      if (item.code === "INR") return `₹${val.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
      return `${item.symbol}${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${fmtQty(val)} ${item.code}`;
  };

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Coins}>
      Cryptocurrency aur conversion target select karein — live exchange rate aur converted value live dikhegi.
    </EmptyState>
  ) : (
    <div className="cx-body">
      {/* Hero Card */}
      <Hero
        label={`Converted Amount (${res.to.code})`}
        value={formatConverted(res.convertedAmount, res.to)}
        tone="up"
        sub={
          <>
            <Pill tone="up">
              Rate: 1 {res.from.code} = {formatConverted(res.conversionRate, res.to)}
            </Pill>
            <span>Live updated: {lastUpdated}</span>
          </>
        }
      />

      {/* Notice with Exchange Rate Pair */}
      <Notice kind="info">
        <span>
          <strong>Live Market Rate:</strong> 1 {res.from.code} ={" "}
          <strong className="text-cyan-400">{formatConverted(res.conversionRate, res.to)}</strong>
          {" "}(Inverse: 1 {res.to.code} = {fmtQty(res.inverseRate)} {res.from.code}).
          Rate source: <span className="capitalize font-semibold">{source}</span>.
        </span>
      </Notice>

      {/* Visual Conversion Flow */}
      <SectionTitle>Conversion Breakdown</SectionTitle>
      <Flow
        rows={[
          { label: `Input (${res.from.code})`, value: res.amount, text: `${res.amount} ${res.from.code}` },
          { label: `Converted (${res.to.code})`, value: res.convertedAmount, text: formatConverted(res.convertedAmount, res.to) },
          ...(res.estimatedFee > 0
            ? [{ label: `Estimated Fee (${res.feePct}%)`, value: -res.estimatedFee, text: `-${formatConverted(res.estimatedFee, res.to)}` }]
            : []),
          { label: `Final Received`, value: res.amountAfterFee, text: formatConverted(res.amountAfterFee, res.to), total: true },
        ]}
      />

      {/* Stats Grid */}
      <Stats
        items={[
          { label: "Input Amount", value: `${res.amount} ${res.from.code}` },
          { label: "Live Conversion Rate", value: `1 ${res.from.code} = ${formatConverted(res.conversionRate, res.to)}`, tone: "up" as const },
          { label: "Inverse Rate", value: `1 ${res.to.code} = ${fmtQty(res.inverseRate)} ${res.from.code}` },
          { label: "Gross Converted", value: formatConverted(res.convertedAmount, res.to), tone: "up" as const },
          {
            label: `Estimated Fee (${res.feePct}%)`,
            value: formatConverted(res.estimatedFee, res.to),
            tone: res.estimatedFee > 0 ? ("down" as const) : undefined,
          },
          { label: "Amount After Fee", value: formatConverted(res.amountAfterFee, res.to), tone: "up" as const },
          { label: "Price Source", value: source.toUpperCase() },
          { label: "Last Rate Sync", value: lastUpdated },
        ]}
      />

      {/* Walkthrough */}
      <Walkthrough
        steps={[
          {
            title: "1. Conversion Formula",
            math: `Converted Amount = Input Amount × Conversion Rate`,
          },
          {
            title: "2. Live Calculation",
            math: `${res.amount} ${res.from.code} × ${formatConverted(res.conversionRate, res.to)} = ${formatConverted(res.convertedAmount, res.to)}`,
          },
          {
            title: "3. Net Received After Fee",
            math: `${formatConverted(res.convertedAmount, res.to)} − ${formatConverted(res.estimatedFee, res.to)} (fee) = ${formatConverted(res.amountAfterFee, res.to)}`,
          },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Conversion Parameters"
      inputsIcon={SlidersHorizontal}
      onReset={reset}
      inputs={inputs}
      resultTitle="Live Conversion Result"
      resultIcon={Coins}
      badge={<Pill tone="up">{res ? `${res.from.code} → ${res.to.code}` : "Live Converter"}</Pill>}
      result={body}
      dock={
        res
          ? {
              label: `${res.from.code} → ${res.to.code}`,
              value: formatConverted(res.convertedAmount, res.to),
              sub: `Rate: 1 ${res.from.code} = ${formatConverted(res.conversionRate, res.to)}`,
              tone: "up",
            }
          : null
      }
      note="Crypto exchange rates live market orderbooks par depend karte hain. Actual execution rates slippage, liquidity depth aur exchange fee tier ke hisaab se minor vary kar sakte hain. Trading advice nahi."
    />
  );
}
