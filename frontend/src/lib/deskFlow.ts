import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Briefcase,
  Calculator,
  Bot,
  FolderKanban,
  LayoutDashboard,
  Layers,
  LineChart,
  ListOrdered,
  Beaker,
  Plug,
  Sparkles,
  Star,
  UserRound,
  Wand2,
} from "lucide-react";

/**
 * Trading desk ka order — Gainium jaisa loop:
 * pehle idea prove karo, phir trade / automate, phir result se seekho.
 * Landing cards aur desk navigation dono isi list se chalte hain.
 */
export type DeskTab =
  | "ai"
  | "markets"
  | "watchlist"
  | "trades"
  | "backtest"
  | "strategies"
  | "mine"
  | "builder"
  | "bots"
  | "journal"
  | "portfolio"
  | "exchanges";

export interface DeskFeature {
  id: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
  href: string;
  /** Set ho to ye `/trade?tab=` screen hai, alag route nahi. */
  tab?: DeskTab;
}

export interface DeskStage {
  id: "research" | "trade" | "track";
  step: number;
  label: string;
  short: string;
  blurb: string;
  items: DeskFeature[];
}

export const DESK_STAGES: DeskStage[] = [
  {
    id: "research",
    step: 1,
    label: "Research & Test",
    short: "Research",
    blurb: "Idea prove karo, paise lagane se pehle",
    items: [
      { id: "overview", label: "Overview", blurb: "Market mood, movers, heatmap", icon: LayoutDashboard, href: "/trade/overview" },
      { id: "strategies", tab: "strategies", label: "Strategies", blurb: "Ready ideas. Pehle rules, phir paper", icon: Layers, href: "/trade?tab=strategies" },
      { id: "builder", tab: "builder", label: "Builder", blurb: "Bina code ke entry aur exit", icon: Wand2, href: "/trade?tab=builder" },
      { id: "backtester", label: "Backtester", blurb: "Rules, costs, final test", icon: Beaker, href: "/trade/backtester" },
      { id: "calculators", label: "Calculators", blurb: "DCA, grid, fees, R:R", icon: Calculator, href: "/trade/calculators" },
    ],
  },
  {
    id: "trade",
    step: 2,
    label: "Trade & Automate",
    short: "Trade",
    blurb: "Haath se trade karo, ya strategy chalao",
    items: [
      { id: "exchanges", tab: "exchanges", label: "Exchanges", blurb: "Apni API key jodo", icon: Plug, href: "/trade?tab=exchanges" },
      { id: "markets", tab: "markets", label: "Terminal", blurb: "Live chart aur orders", icon: LineChart, href: "/trade?tab=markets" },
      { id: "watchlist", tab: "watchlist", label: "Watchlist", blurb: "Pasand ki coins", icon: Star, href: "/trade?tab=watchlist" },
      { id: "trades", tab: "trades", label: "Trades", blurb: "Positions aur order history", icon: ListOrdered, href: "/trade?tab=trades" },
      { id: "bots", tab: "bots", label: "Bots", blurb: "DCA, Grid, Combo", icon: Bot, href: "/trade?tab=bots" },
      { id: "mine", tab: "mine", label: "My Strategies", blurb: "Paper ya live par chalu", icon: FolderKanban, href: "/trade?tab=mine" },
    ],
  },
  {
    id: "track",
    step: 3,
    label: "Track & Improve",
    short: "Track",
    blurb: "P&L dekho, phir AI se poochho",
    items: [
      { id: "portfolio", tab: "portfolio", label: "Portfolio", blurb: "Holdings aur allocation", icon: Briefcase, href: "/trade?tab=portfolio" },
      { id: "journal", tab: "journal", label: "Journal", blurb: "Calendar, tags, win rate", icon: BookOpen, href: "/trade?tab=journal" },
      { id: "profile", label: "P&L", blurb: "Day-wise result aur account", icon: UserRound, href: "/profile" },
      { id: "ai", tab: "ai", label: "AI Assistant", blurb: "Apne data pe sawaal", icon: Sparkles, href: "/trade?tab=ai" },
    ],
  },
];

const TAB_SET = new Set<string>(
  DESK_STAGES.flatMap((stage) => stage.items.flatMap((item) => (item.tab ? [item.tab] : []))),
);

export function isDeskTab(value: string | null | undefined): value is DeskTab {
  return !!value && TAB_SET.has(value);
}

export function stageFor(activeId: string): DeskStage | undefined {
  return DESK_STAGES.find((stage) => stage.items.some((item) => item.id === activeId));
}

export function nextStage(activeId: string): { stage: DeskStage; feature: DeskFeature } | undefined {
  const index = DESK_STAGES.findIndex((stage) => stage.items.some((item) => item.id === activeId));
  const stage = DESK_STAGES[(index + 1) % DESK_STAGES.length];
  const feature = stage?.items[0];
  if (!stage || !feature) return undefined;
  return { stage, feature };
}
