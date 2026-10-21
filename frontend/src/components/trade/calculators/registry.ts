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
    blurb: "Balance, risk %, entry, SL aur TP se position size, value, risk amount, R:R aur potential ROI ek sath",
    icon: Crown,
    Component: MukulRiskCalculator,
  },
  {
    id: "converter",
    label: "Crypto Converter",
    category: "spot",
    short: "Live currency conversion",
    blurb: "Ek cryptocurrency ko doosri crypto ya fiat currency (USD, INR, EUR) mein live market rates aur fee ke sath convert karein",
    icon: Coins,
    Component: CryptoConverter,
  },
  {
    id: "futures",
    label: "Futures Calculator",
    category: "futures",
    short: "Margin, leverage & P&L",
    blurb: "Futures trade ka margin, leverage (1x-125x), position value, trading fees, funding fee, maintenance margin aur net P&L",
    icon: Activity,
    Component: FuturesCalculator,
  },
  {
    id: "liquidation-distance",
    label: "Liquidation Distance",
    category: "futures",
    short: "Mark vs liq price distance",
    blurb: "Active futures position ki mark price se liquidation price tak ki exact distance, gap aur risk warning",
    icon: Radar,
    Component: LiquidationDistanceCalculator,
  },
  {
    id: "liquidation",
    label: "Liquidation Price",
    category: "futures",
    short: "Exchange-specific liq price",
    blurb: "Binance, Bybit, OKX & Delta ke MMR aur margin rules se estimated liquidation price",
    icon: Flame,
    Component: LiquidationCalculator,
  },
  {
    id: "dca",
    label: "Crypto DCA Calculator",
    category: "spot",
    short: "Regular buying avg entry & P&L",
    blurb: "Fixed amount se regular crypto buying ka average entry price, total coins, unrealized P&L aur historical simulation",
    icon: Repeat,
    Component: DcaCalculator,
  },
  {
    id: "risk-of-ruin",
    label: "Risk of Ruin",
    category: "risk",
    short: "Monte Carlo ruin & drawdowns",
    blurb: "2,000-run Monte Carlo simulation se account ruin probability, drawdown likelihood aur Kelly sizing",
    icon: AlertOctagon,
    Component: RiskOfRuinCalculator,
  },
  {
    id: "profit-target",
    label: "Profit Target",
    category: "performance",
    short: "Target price P&L & ROI",
    blurb: "Target price par potential gross profit, exchange fees, net return aur required ROI %",
    icon: TrendingUp,
    Component: ProfitTargetCalculator,
  },
  {
    id: "average-down",
    label: "Average Down",
    category: "spot",
    short: "Dip buy new avg entry",
    blurb: "Price girne par additional crypto purchase ke baad naya weighted average entry price aur break-even",
    icon: TrendingDown,
    Component: AverageDownCalculator,
  },
  {
    id: "portfolio-profit",
    label: "Portfolio Profit",
    category: "performance",
    short: "Multi-coin P&L & allocation",
    blurb: "Multiple crypto holdings ka total invested, live portfolio value, unrealized P&L aur best/worst performer",
    icon: Briefcase,
    Component: PortfolioProfitCalculator,
  },
  {
    id: "tax",
    label: "Crypto Tax Estimator",
    category: "performance",
    short: "VDA 30% + 1% TDS & capital gains",
    blurb: "Virtual digital assets par realized gain, flat 30% + cess (31.2%) tax, 1% TDS aur after-tax proceeds",
    icon: FileText,
    Component: TaxCalculator,
  },
  {
    id: "staking",
    label: "Staking Rewards",
    category: "spot",
    short: "APY & compound staking yields",
    blurb: "ETH, SOL, DOT, ATOM staking rewards, validator commission aur daily/monthly projected yields",
    icon: Sparkles,
    Component: StakingCalculator,
  },
  {
    id: "market-cap",
    label: "Market Cap & Target",
    category: "spot",
    short: "Supply, FDV & implied price",
    blurb: "Circulating supply, FDV, market capitalization aur target valuation par implied token price",
    icon: Globe,
    Component: MarketCapCalculator,
  },
  {
    id: "mining",
    label: "Mining Profitability",
    category: "spot",
    short: "Hashrate, power & payback",
    blurb: "Mining rig ka hashrate, electricity cost, daily/monthly revenue, pool fees aur hardware payback period",
    icon: Cpu,
    Component: MiningCalculator,
  },
  {
    id: "pnl",
    label: "P&L Calculator",
    category: "performance",
    short: "Net profit, fees aur ROI",
    blurb: "Entry, exit, quantity, fees aur funding se net profit / loss aur ROI",
    icon: Calculator,
    Component: PnlCalculator,
  },
  {
    id: "position-size",
    label: "Position Size",
    category: "risk",
    short: "Kitne coins lene hain",
    blurb: "Account balance, risk % aur stop loss se kitne coins lene hain — loss pehle se tay",
    icon: Scale,
    Component: PositionSizeCalculator,
  },
  {
    id: "profit-factor",
    label: "Profit Factor",
    category: "performance",
    short: "Gross profit / gross loss",
    blurb: "Backtest aur journal performance ratio — gross profit aur gross loss se strategy quality score",
    icon: Award,
    Component: ProfitFactorCalculator,
  },
  {
    id: "max-drawdown",
    label: "Max Drawdown",
    category: "performance",
    short: "Peak-to-trough drop %",
    blurb: "Equity curve ka sabse bada historical drawdown, lowest trough aur recovery ke liye required gain",
    icon: LineChart,
    Component: MaxDrawdownCalculator,
  },
  {
    id: "fee",
    label: "Crypto Fee",
    category: "spot",
    short: "Maker/taker trading fees",
    blurb: "Buy aur sell orders par exchange fees aur net P&L ka exact hisaab",
    icon: Receipt,
    Component: FeeCalculator,
  },
  {
    id: "leverage",
    label: "Leverage Calculator",
    category: "futures",
    short: "Position value & quantity",
    blurb: "Margin, leverage aur entry price se total position value, quantity aur liquidation risk",
    icon: Zap,
    Component: LeverageCalculator,
  },
  {
    id: "breakeven",
    label: "Break-even Price",
    category: "spot",
    short: "Fees-adjusted exit price",
    blurb: "Entry price aur exchange fees ke baad ka exact zero-loss break-even exit price",
    icon: Equal,
    Component: BreakEvenCalculator,
  },
  {
    id: "compounding",
    label: "Compounding",
    category: "performance",
    short: "Compound interest growth",
    blurb: "Initial capital, recurring deposits aur expected returns se long-term future value",
    icon: LineChart,
    Component: CompoundingCalculator,
  },
  {
    id: "portfolio-allocation",
    label: "Portfolio Allocation",
    category: "performance",
    short: "Capital asset distribution",
    blurb: "Total capital ko alag-alag crypto assets mein exact percentage ke hisaab se baatein",
    icon: PieChart,
    Component: PortfolioAllocationCalculator,
  },
  {
    id: "win-rate",
    label: "Win Rate Strategy",
    category: "performance",
    short: "Backtest win rate & edge",
    blurb: "Wins, losses aur breakeven trades se strategy win rate, payoff ratio aur expectancy",
    icon: Trophy,
    Component: WinRateCalculator,
  },
  {
    id: "average-entry",
    label: "Average Entry",
    category: "spot",
    short: "Multi-buy avg price",
    blurb: "Multiple purchases ke price aur quantity se weighted average entry price",
    icon: Layers,
    Component: AverageEntryCalculator,
  },
  {
    id: "risk-reward",
    label: "Risk / Reward",
    category: "risk",
    short: "R:R aur break-even win rate",
    blurb: "Entry, stop loss aur take profit se risk, reward aur R:R ratio",
    icon: Target,
    Component: RiskRewardCalculator,
  },
  {
    id: "stop-loss",
    label: "Stop Loss",
    category: "risk",
    short: "Risk-based SL price",
    blurb: "Account balance, risk %, entry aur quantity se stop loss price — loss pehle se tay",
    icon: ShieldAlert,
    Component: StopLossCalculator,
  },
  {
    id: "volatility",
    label: "Crypto Volatility",
    category: "performance",
    short: "Period & annualized vol %",
    blurb: "Returns ke standard deviation se period volatility, 365-day annualized volatility aur price move extremes",
    icon: Gauge,
    Component: VolatilityCalculator,
  },
  {
    id: "correlation",
    label: "Crypto Correlation",
    category: "performance",
    short: "Pearson r (-1 to +1) & Beta",
    blurb: "BTC, ETH, SOL jaise pairs ke returns ka Pearson correlation coefficient, covariance aur diversification benefit",
    icon: GitCompare,
    Component: CorrelationCalculator,
  },
  {
    id: "grid-bot",
    label: "Grid Bot Profitability",
    category: "spot",
    short: "Grid spacing, fees & APR",
    blurb: "Arithmetic ya geometric grid bot ka per-cycle gross/net profit, trading fees aur annual projected APR",
    icon: Bot,
    Component: GridBotCalculator,
  },
  {
    id: "token-unlock",
    label: "Token Unlock Dilution",
    category: "spot",
    short: "Float expansion & flat MC price",
    blurb: "Upcoming token unlock se circulating supply expansion, dilution factor aur constant market cap equilibrium price",
    icon: Unlock,
    Component: TokenUnlockCalculator,
  },
  {
    id: "slippage",
    label: "Crypto Slippage Calculator",
    category: "spot",
    short: "Expected vs execution price",
    blurb: "Order place karte waqt expected price aur actual execution price ke beech ka difference, slippage % aur fees-adjusted total cost",
    icon: Percent,
    Component: SlippageCalculator,
  },
  {
    id: "impermanent-loss",
    label: "Impermanent Loss Calculator",
    category: "spot",
    short: "LP vs HODL value & fees",
    blurb: "50/50 liquidity pool mein tokens deposit karne aur unhe hold karne ka potential value difference, IL % aur breakeven fee APY",
    icon: Repeat,
    Component: ImpermanentLossCalculator,
  },
  {
    id: "trade-expectancy",
    label: "Trade Expectancy Calculator",
    category: "risk",
    short: "Win rate & avg win/loss edge",
    blurb: "User ke win rate, average win/loss aur trading fees ke basis par strategy ka statistical mathematical outcome per trade",
    icon: Target,
    Component: TradeExpectancyCalculator,
  },
  {
    id: "breakout-distance",
    label: "Breakout Distance Calculator",
    category: "risk",
    short: "Support/Resistance distance & ATR",
    blurb: "Current price kisi selected resistance ya support level se kitna door hai, channel position % aur ATR normalization",
    icon: Compass,
    Component: BreakoutDistanceCalculator,
  },
  {
    id: "price-impact",
    label: "Liquidity Pool Price Impact",
    category: "spot",
    short: "AMM swap impact & min received",
    blurb: "Constant-product AMM DEX mein swap size ke basis par estimated output, execution price, pool fee aur price impact %",
    icon: Waves,
    Component: PriceImpactCalculator,
  },
];

/** Page bina ?c= ke isi par khulta hai — Mukul flagship all-in-one risk engine sabse zaroori hai. */
export const DEFAULT_CALCULATOR = "mukul-risk";
