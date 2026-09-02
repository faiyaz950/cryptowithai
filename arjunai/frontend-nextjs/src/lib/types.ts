export type UserType = "free" | "pro";
export type Topic = "stock" | "crypto" | "mutual_fund" | "commodity" | "general";
export type AIModelId = "auto" | "gemini" | "grok" | "groq" | "openai" | "claude";

export interface AIModelOption {
  id: AIModelId;
  label: string;
  description: string;
  available: boolean;
  pro_only?: boolean;
}

export interface Attachment {
  id: string;
  type: "image" | "file";
  name: string;
  mimeType: string;
  url: string; // local blob URL for preview
  size: number;
  file?: File; // actual file for upload
}

export interface ChartPoint {
  date: number;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
}

export interface ChartData {
  type: "stock" | "crypto";
  symbol: string;
  name: string;
  currency?: string;
  price?: number;
  change_pct?: number;
  change?: number;
  day_high?: number;
  day_low?: number;
  fifty_two_week_high?: number;
  fifty_two_week_low?: number;
  volume?: number;
  pe_ratio?: number;
  market_cap?: number;
  points?: ChartPoint[];
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  cached?: boolean;
  topic?: Topic;
  timestamp: Date;
  isStreaming?: boolean;
  sources?: Array<{ title: string; url: string }>;
  searchQueries?: string[];
  grounded?: boolean;
  attachments?: Attachment[];
  thinkingSteps?: string[];
  thinkingActive?: boolean;
  revealLive?: boolean;
  chartData?: ChartData | null;
  followUps?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  topic?: Topic;
}

export interface ChatRequest {
  question: string;
  user_type: UserType;
  history: Array<{ role: string; content: string }>;
  portfolio_context?: string | null;
  preferred_model?: AIModelId;
}

export interface ChatResponse {
  answer: string;
  model: string;
  cached: boolean;
  topic?: Topic;
  sources?: Array<{ title: string; url: string }>;
  search_queries?: string[];
  grounded?: boolean;
}

export interface TopicConfig {
  label: string;
  icon: string;
  color: string;
  gradient: string;
}

export const TOPIC_CONFIG: Record<Topic, TopicConfig> = {
  stock: { label: "Stocks", icon: "", color: "#2563eb", gradient: "linear-gradient(135deg, #2563eb, #1d4ed8)" },
  crypto: { label: "Crypto", icon: "", color: "#f59e0b", gradient: "linear-gradient(135deg, #f59e0b, #d97706)" },
  mutual_fund: { label: "Mutual Fund", icon: "", color: "var(--text-secondary)", gradient: "linear-gradient(135deg, var(--text-muted), var(--text-secondary))" },
  commodity: { label: "Commodity", icon: "", color: "var(--text-secondary)", gradient: "linear-gradient(135deg, var(--text-muted), var(--text-secondary))" },
  general: { label: "General", icon: "", color: "#64748b", gradient: "linear-gradient(135deg, #64748b, #94a3b8)" },
};
