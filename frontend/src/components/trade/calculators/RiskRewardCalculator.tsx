"use client";

import { useMemo, useState } from "react";
import { Crosshair, Target } from "lucide-react";
import { computeRiskReward } from "@/lib/calculators/riskReward";
import type { Side } from "@/lib/calculators/pnl";
import { fmtMoney, fmtNum, fmtRatio, toNum } from "@/lib/calculators/format";
import { CalcLayout, DirectionToggle, EmptyState, Field, Hero, Meter, Notice, Pill, PriceRuler, SectionTitle, SideBadge, Stats, Walkthrough } from "./ui";

const DEFAULTS = { side: "long" as Side, entry: "100", stopLoss: "95", takeProfit: "115" };

const pct = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

export default function RiskRewardCalculator() {
  const [side, setSide] = useState<Side>(DEFAULTS.side);
  const [entry, setEntry] = useState(DEFAULTS.entry);
  const [stopLoss, setStopLoss] = useState(DEFAULTS.stopLoss);
  const [takeProfit, setTakeProfit] = useState(DEFAULTS.takeProfit);

  const n = { entry: toNum(entry), stopLoss: toNum(stopLoss), takeProfit: toNum(takeProfit) };
  const outcome = useMemo(
    () => computeRiskReward({ side, entry: n.entry, stopLoss: n.stopLoss, takeProfit: n.takeProfit }),
    [side, n.entry, n.stopLoss, n.takeProfit],
  );
  const res = outcome?.ok ? outcome.result : null;
  const error = outcome && !outcome.ok ? outcome.error : null;

  const reset = () => {
    setSide(DEFAULTS.side);
    setEntry(DEFAULTS.entry);
    setStopLoss(DEFAULTS.stopLoss);
    setTakeProfit(DEFAULTS.takeProfit);
  };

  const bad = {
    entry: entry !== "" && !(n.entry > 0),
    stopLoss: stopLoss !== "" && !(n.stopLoss > 0),
    takeProfit: takeProfit !== "" && !(n.takeProfit > 0),
  };

  const inputs = (
    <>
      <DirectionToggle side={side} onChange={setSide} />
      <Field label="Entry price" value={entry} onChange={setEntry} prefix="$" min={0} invalid={bad.entry} />
      <div className="cx-row-2">
        <Field label="Stop loss" value={stopLoss} onChange={setStopLoss} prefix="$" min={0} invalid={bad.stopLoss} />
        <Field label="Take profit" value={takeProfit} onChange={setTakeProfit} prefix="$" min={0} invalid={bad.takeProfit} />
      </div>
      <p className="cx-hint" style={{ marginTop: -10 }}>
        {side === "long" ? "Long: stop loss entry se neeche, take profit upar." : "Short: stop loss entry se upar, take profit neeche."}
      </p>
    </>
  );

  const body = error ? (
    <Notice kind="error">{error}</Notice>
  ) : !res ? (
    <EmptyState icon={Target}>Entry, stop loss aur take profit daalein — R:R yahan live dikhega.</EmptyState>
  ) : (
    <div className="cx-body">
      <Hero
        label="Risk : Reward"
        value={fmtRatio(res.ratio)}
        sub={
          <>
            <Pill tone="down">Risk {fmtMoney(res.risk)}</Pill>
            <Pill tone="up">Reward {fmtMoney(res.reward)}</Pill>
          </>
        }
      />

      <SectionTitle>Price levels</SectionTitle>
      <PriceRuler stop={n.stopLoss} entry={n.entry} target={n.takeProfit} fmt={fmtMoney} />

      <Stats
        items={[
          { label: "Risk", value: fmtMoney(res.risk), tone: "down" },
          { label: "Reward", value: fmtMoney(res.reward), tone: "up" },
          { label: "R:R", value: fmtRatio(res.ratio) },
          { label: "Risk % of entry", value: pct(res.riskPct) },
          { label: "Reward % of entry", value: pct(res.rewardPct) },
          { label: "Per $1 risked", value: `${fmtMoney(res.ratio)} reward` },
        ]}
      />

      <Meter label="Break-even win rate" valueText={pct(res.breakevenWinRate)} pct={res.breakevenWinRate} />
      <p className="cx-hint" style={{ marginTop: -8 }}>
        Itne % trades jeetne par (fees ke bina) na profit na loss — isse zyada win rate rakhoge to profit.
      </p>

      <Walkthrough
        steps={[
          {
            title: `Risk = ${side === "long" ? "Entry − Stop loss" : "Stop loss − Entry"}`,
            math: `${side === "long" ? `${fmtNum(n.entry)} − ${fmtNum(n.stopLoss)}` : `${fmtNum(n.stopLoss)} − ${fmtNum(n.entry)}`} = ${fmtMoney(res.risk)}`,
          },
          {
            title: `Reward = ${side === "long" ? "Take profit − Entry" : "Entry − Take profit"}`,
            math: `${side === "long" ? `${fmtNum(n.takeProfit)} − ${fmtNum(n.entry)}` : `${fmtNum(n.entry)} − ${fmtNum(n.takeProfit)}`} = ${fmtMoney(res.reward)}`,
          },
          { title: "R:R = Reward ÷ Risk", math: `${fmtMoney(res.reward)} ÷ ${fmtMoney(res.risk)} = ${fmtRatio(res.ratio)}` },
          { title: "Break-even win rate = Risk ÷ (Risk + Reward)", math: `${fmtMoney(res.risk)} ÷ ${fmtMoney(res.risk + res.reward)} = ${pct(res.breakevenWinRate)}` },
        ]}
      />
    </div>
  );

  return (
    <CalcLayout
      inputsTitle="Trade levels"
      inputsIcon={Crosshair}
      onReset={reset}
      inputs={inputs}
      resultTitle="Risk / Reward"
      resultIcon={Target}
      badge={<SideBadge side={side} />}
      result={body}
      dock={res ? { label: "Risk : Reward", value: fmtRatio(res.ratio), sub: `${fmtMoney(res.risk)} → ${fmtMoney(res.reward)}` } : null}
      note="Sab kuch per coin ke hisaab se hai (fees aur slippage ke bina). Trading advice nahi."
    />
  );
}
