import type { ComponentType } from "react";
import {
  Activity,
  AlertOctagon,
  Award,
  BarChart3,
  Bot,
  Briefcase,
  Calculator,
  Coins,
  Cpu,
  Crown,
  Equal,
  FileText,
  Flame,
  Gauge,
  GitCompare,
  Globe,
  Layers,
  LineChart,
  PieChart,
  Radar,
  Receipt,
  Repeat,
  Scale,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Unlock,
  Waves,
  Zap,
  type LucideIcon,
  Compass,
  Percent,
} from "lucide-react";
import MukulRiskCalculator from "./MukulRiskCalculator";
import FuturesCalculator from "./FuturesCalculator";
import CryptoConverter from "./CryptoConverter";
import LiquidationDistanceCalculator from "./LiquidationDistanceCalculator";
import PnlCalculator from "./PnlCalculator";
import PositionSizeCalculator from "./PositionSizeCalculator";
import RiskRewardCalculator from "./RiskRewardCalculator";
import StopLossCalculator from "./StopLossCalculator";
import LeverageCalculator from "./LeverageCalculator";
import LiquidationCalculator from "./LiquidationCalculator";
import DcaCalculator from "./DcaCalculator";
import AverageEntryCalculator from "./AverageEntryCalculator";
import BreakEvenCalculator from "./BreakEvenCalculator";
import FeeCalculator from "./FeeCalculator";
import CompoundingCalculator from "./CompoundingCalculator";
import PortfolioAllocationCalculator from "./PortfolioAllocationCalculator";
import WinRateCalculator from "./WinRateCalculator";
import ProfitFactorCalculator from "./ProfitFactorCalculator";
import MaxDrawdownCalculator from "./MaxDrawdownCalculator";
import ProfitTargetCalculator from "./ProfitTargetCalculator";
import AverageDownCalculator from "./AverageDownCalculator";
import PortfolioProfitCalculator from "./PortfolioProfitCalculator";
import MiningCalculator from "./MiningCalculator";
import TaxCalculator from "./TaxCalculator";
import StakingCalculator from "./StakingCalculator";
import MarketCapCalculator from "./MarketCapCalculator";
import RiskOfRuinCalculator from "./RiskOfRuinCalculator";
import VolatilityCalculator from "./VolatilityCalculator";
import CorrelationCalculator from "./CorrelationCalculator";
import GridBotCalculator from "./GridBotCalculator";
import TokenUnlockCalculator from "./TokenUnlockCalculator";
import SlippageCalculator from "./SlippageCalculator";
import ImpermanentLossCalculator from "./ImpermanentLossCalculator";
import TradeExpectancyCalculator from "./TradeExpectancyCalculator";
import BreakoutDistanceCalculator from "./BreakoutDistanceCalculator";
import PriceImpactCalculator from "./PriceImpactCalculator";

/**
 * Calculators ki list. Naya calculator jodne ke liye: component banao
 * (components/trade/calculators/), formulas lib/calculators/ mein rakho,
 * aur yahan ek entry daal do — page, selector aur URL (?c=id) apne aap ban jate hain.
 */
export type CalculatorCategoryId = "all" | "risk" | "futures" | "spot" | "performance";

export interface CalculatorCategory {
  id: CalculatorCategoryId;
  label: string;
}

export const CALCULATOR_CATEGORIES: CalculatorCategory[] = [
  { id: "all", label: "All" },
  { id: "risk", label: "Risk & Sizing" },
  { id: "futures", label: "Futures & Margin" },
  { id: "spot", label: "Spot & Execution" },
  { id: "performance", label: "Performance & P&L" },
];

export interface CalculatorDef {
  id: string;
  label: string;
  category: "risk" | "futures" | "spot" | "performance";
  /** Switcher card ki ek line. */
  short: string;
  blurb: string;
  icon: LucideIcon;
  Component: ComponentType;
}

export const CALCULATORS: CalculatorDef[] = [
  {
    id: "mukul-risk",
    label: "Mukul Risk (All-In-One)",
    category: "risk",
    short: "👑 Flagship risk engine",
    blurb: "Balance, risk %, entry, SL and TP → position size, value, risk amount, R:R and potential ROI in one view",
    icon: Crown,
    Component: MukulRiskCalculator,
  },
  {
    id: "converter",
    label: "Crypto Converter",
    category: "spot",
    short: "Live currency conversion",
    blurb: "Convert one cryptocurrency to another crypto or fiat (USD, INR, EUR) at live rates with fees",
    icon: Coins,
    Component: CryptoConverter,
  },
  {
    id: "futures",
    label: "Futures Calculator",
    category: "futures",
    short: "Margin, leverage & P&L",
    blurb: "Futures margin, leverage (1x–125x), position value, trading fees, funding, maintenance margin and net P&L",
    icon: Activity,
    Component: FuturesCalculator,
  },
  {
    id: "liquidation-distance",
    label: "Liquidation Distance",
    category: "futures",
    short: "Mark vs liq price distance",
    blurb: "Exact distance from mark price to liquidation price, gap and risk warnings for an open futures position",
    icon: Radar,
    Component: LiquidationDistanceCalculator,
  },
  {
    id: "liquidation",
    label: "Liquidation Price",
    category: "futures",
    short: "Exchange-specific liq price",
    blurb: "Estimated liquidation price from Binance, Bybit, OKX and Delta MMR and margin rules",
    icon: Flame,
    Component: LiquidationCalculator,
  },
  {
    id: "dca",
    label: "Crypto DCA Calculator",
    category: "spot",
    short: "Regular buying avg entry & P&L",
    blurb: "Regular fixed-amount buys: average entry, total coins, unrealized P&L and historical simulation",
    icon: Repeat,
    Component: DcaCalculator,
  },
  {
    id: "risk-of-ruin",
    label: "Risk of Ruin",
    category: "risk",
    short: "Monte Carlo ruin & drawdowns",
    blurb: "2,000-run Monte Carlo: ruin probability, drawdown likelihood and Kelly sizing",
    icon: AlertOctagon,
    Component: RiskOfRuinCalculator,
  },
  {
    id: "profit-target",
    label: "Profit Target",
    category: "performance",
    short: "Target price P&L & ROI",
    blurb: "At target price: gross profit, exchange fees, net return and required ROI %",
    icon: TrendingUp,
    Component: ProfitTargetCalculator,
  },
  {
    id: "average-down",
    label: "Average Down",
    category: "spot",
    short: "Dip buy new avg entry",
    blurb: "After a dip buy: new weighted average entry and break-even",
    icon: TrendingDown,
    Component: AverageDownCalculator,
  },
  {
    id: "portfolio-profit",
    label: "Portfolio Profit",
    category: "performance",
    short: "Multi-coin P&L & allocation",
    blurb: "Multi-coin holdings: total invested, live value, unrealized P&L and best/worst performer",
    icon: Briefcase,
    Component: PortfolioProfitCalculator,
  },
  {
    id: "tax",
    label: "Crypto Tax Estimator",
    category: "performance",
    short: "VDA 30% + 1% TDS & capital gains",
    blurb: "VDAs: realized gain, flat 30% + cess (31.2%), 1% TDS and after-tax proceeds",
    icon: FileText,
    Component: TaxCalculator,
  },
  {
    id: "staking",
    label: "Staking Rewards",
    category: "spot",
    short: "APY & compound staking yields",
    blurb: "ETH, SOL, DOT, ATOM staking rewards, validator commission and daily/monthly projected yields",
    icon: Sparkles,
    Component: StakingCalculator,
  },
  {
    id: "market-cap",
    label: "Market Cap & Target",
    category: "spot",
    short: "Supply, FDV & implied price",
    blurb: "Circulating supply, FDV, market cap and implied price at a target valuation",
    icon: Globe,
    Component: MarketCapCalculator,
  },
  {
    id: "mining",
    label: "Mining Profitability",
    category: "spot",
    short: "Hashrate, power & payback",
    blurb: "Mining rig hashrate, power cost, daily/monthly revenue, pool fees and hardware payback",
    icon: Cpu,
    Component: MiningCalculator,
  },
  {
    id: "pnl",
    label: "P&L Calculator",
    category: "performance",
    short: "Net profit, fees and ROI",
    blurb: "Entry, exit, quantity, fees and funding → net P&L and ROI",
    icon: Calculator,
    Component: PnlCalculator,
  },
  {
    id: "position-size",
    label: "Position Size",
    category: "risk",
    short: "How many coins to buy",
    blurb: "From balance, risk % and stop loss — position size with loss capped upfront",
    icon: Scale,
    Component: PositionSizeCalculator,
  },
  {
    id: "profit-factor",
    label: "Profit Factor",
    category: "performance",
    short: "Gross profit / gross loss",
    blurb: "Backtest/journal ratio — strategy quality from gross profit vs gross loss",
    icon: Award,
    Component: ProfitFactorCalculator,
  },
  {
    id: "max-drawdown",
    label: "Max Drawdown",
    category: "performance",
    short: "Peak-to-trough drop %",
    blurb: "Largest historical drawdown on the equity curve, trough and gain needed to recover",
    icon: LineChart,
    Component: MaxDrawdownCalculator,
  },
  {
    id: "fee",
    label: "Crypto Fee",
    category: "spot",
    short: "Maker/taker trading fees",
    blurb: "Exchange fees on buy/sell orders and exact net P&L",
    icon: Receipt,
    Component: FeeCalculator,
  },
  {
    id: "leverage",
    label: "Leverage Calculator",
    category: "futures",
    short: "Position value & quantity",
    blurb: "Margin, leverage and entry → position value, quantity and liquidation risk",
    icon: Zap,
    Component: LeverageCalculator,
  },
  {
    id: "breakeven",
    label: "Break-even Price",
    category: "spot",
    short: "Fees-adjusted exit price",
    blurb: "Exact fee-adjusted break-even exit price after entry and exchange fees",
    icon: Equal,
    Component: BreakEvenCalculator,
  },
  {
    id: "compounding",
    label: "Compounding",
    category: "performance",
    short: "Compound interest growth",
    blurb: "Initial capital, recurring deposits and expected returns → long-term future value",
    icon: LineChart,
    Component: CompoundingCalculator,
  },
  {
    id: "portfolio-allocation",
    label: "Portfolio Allocation",
    category: "performance",
    short: "Capital asset distribution",
    blurb: "Split total capital across crypto assets by exact percentages",
    icon: PieChart,
    Component: PortfolioAllocationCalculator,
  },
  {
    id: "win-rate",
    label: "Win Rate Strategy",
    category: "performance",
    short: "Backtest win rate & edge",
    blurb: "From wins, losses and breakeven trades: win rate, payoff ratio and expectancy",
    icon: Trophy,
    Component: WinRateCalculator,
  },
  {
    id: "average-entry",
    label: "Average Entry",
    category: "spot",
    short: "Multi-buy avg price",
    blurb: "Weighted average entry from multiple buys (price × quantity)",
    icon: Layers,
    Component: AverageEntryCalculator,
  },
  {
    id: "risk-reward",
    label: "Risk / Reward",
    category: "risk",
    short: "R:R and break-even win rate",
    blurb: "From entry, stop loss and take profit: risk, reward and R:R",
    icon: Target,
    Component: RiskRewardCalculator,
  },
  {
    id: "stop-loss",
    label: "Stop Loss",
    category: "risk",
    short: "Risk-based SL price",
    blurb: "From balance, risk %, entry and quantity — stop loss with loss capped upfront",
    icon: ShieldAlert,
    Component: StopLossCalculator,
  },
  {
    id: "volatility",
    label: "Crypto Volatility",
    category: "performance",
    short: "Period & annualized vol %",
    blurb: "Period volatility from return std dev, 365-day annualized vol and move extremes",
    icon: Gauge,
    Component: VolatilityCalculator,
  },
  {
    id: "correlation",
    label: "Crypto Correlation",
    category: "performance",
    short: "Pearson r (-1 to +1) & Beta",
    blurb: "Pearson r, covariance and diversification for pairs like BTC, ETH, SOL",
    icon: GitCompare,
    Component: CorrelationCalculator,
  },
  {
    id: "grid-bot",
    label: "Grid Bot Profitability",
    category: "spot",
    short: "Grid spacing, fees & APR",
    blurb: "Arithmetic or geometric grid bot: per-cycle gross/net profit, fees and projected APR",
    icon: Bot,
    Component: GridBotCalculator,
  },
  {
    id: "token-unlock",
    label: "Token Unlock Dilution",
    category: "spot",
    short: "Float expansion & flat MC price",
    blurb: "Upcoming unlock: float expansion, dilution and flat market-cap equilibrium price",
    icon: Unlock,
    Component: TokenUnlockCalculator,
  },
  {
    id: "slippage",
    label: "Crypto Slippage Calculator",
    category: "spot",
    short: "Expected vs execution price",
    blurb: "Expected vs fill price at order time, slippage % and fee-adjusted total cost",
    icon: Percent,
    Component: SlippageCalculator,
  },
  {
    id: "impermanent-loss",
    label: "Impermanent Loss Calculator",
    category: "spot",
    short: "LP vs HODL value & fees",
    blurb: "LP vs HODL value difference for a 50/50 pool, IL % and breakeven fee APY",
    icon: Repeat,
    Component: ImpermanentLossCalculator,
  },
  {
    id: "trade-expectancy",
    label: "Trade Expectancy Calculator",
    category: "risk",
    short: "Win rate & avg win/loss edge",
    blurb: "Per-trade statistical outcome from win rate, avg win/loss and trading fees",
    icon: Target,
    Component: TradeExpectancyCalculator,
  },
  {
    id: "breakout-distance",
    label: "Breakout Distance Calculator",
    category: "risk",
    short: "Support/Resistance distance & ATR",
    blurb: "Distance from price to chosen support/resistance, channel position % and ATR normalization",
    icon: Compass,
    Component: BreakoutDistanceCalculator,
  },
  {
    id: "price-impact",
    label: "Liquidity Pool Price Impact",
    category: "spot",
    short: "AMM swap impact & min received",
    blurb: "Constant-product AMM: estimated output, execution price, pool fee and price impact from swap size",
    icon: Waves,
    Component: PriceImpactCalculator,
  },
];

/** Page bina ?c= ke isi par khulta hai — Mukul flagship all-in-one risk engine sabse zaroori hai. */
export const DEFAULT_CALCULATOR = "mukul-risk";
