"use client";

interface Props {
  model: string;
  cached?: boolean;
}

const GEMINI_STYLE = {
  icon: "✦",
  color: "#60a5fa",
  bg: "rgba(96,165,250,0.08)",
  border: "rgba(96,165,250,0.2)",
};

const MODEL_META: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  "Gemini 2.0 Flash": GEMINI_STYLE,
  "Gemini 2.5 Flash": GEMINI_STYLE,
  "Gemini 2.5 Flash + Search": GEMINI_STYLE,
  "Gemini 3.5 Flash": GEMINI_STYLE,
  "Gemini 3.5 Flash + Search": GEMINI_STYLE,
  "Gemini 3.6 Flash": GEMINI_STYLE,
  "Gemini 3.6 Flash + Search": GEMINI_STYLE,
  "Gemini 3.5 Flash Lite": GEMINI_STYLE,
  "Gemini 3.5 Flash Lite + Search": GEMINI_STYLE,
  "Gemini Flash Lite Latest": GEMINI_STYLE,
  "Gemini Flash Lite Latest + Search": GEMINI_STYLE,
  "Gemini Flash Latest": GEMINI_STYLE,
  "Grok 3 Fast": {
    icon: "𝕏",
    color: "#2563eb",
    bg: "rgba(37, 99, 235, 0.1)",
    border: "rgba(37, 99, 235, 0.2)",
  },
  "Groq Llama 3.3": {
    icon: "⬡",
    color: "#fb923c",
    bg: "rgba(251,146,60,0.08)",
    border: "rgba(251,146,60,0.2)",
  },
  "Groq GPT-OSS": {
    icon: "⬡",
    color: "#fb923c",
    bg: "rgba(251,146,60,0.08)",
    border: "rgba(251,146,60,0.2)",
  },
  "GPT-4o Mini": {
    icon: "◎",
    color: "#2563eb",
    bg: "rgba(37, 99, 235, 0.1)",
    border: "rgba(37, 99, 235, 0.2)",
  },
  "GPT-4o": {
    icon: "◎",
    color: "#2563eb",
    bg: "rgba(37, 99, 235, 0.1)",
    border: "rgba(37, 99, 235, 0.2)",
  },
  "GPT-4.1 Mini": {
    icon: "◎",
    color: "#2563eb",
    bg: "rgba(37, 99, 235, 0.1)",
    border: "rgba(37, 99, 235, 0.2)",
  },
  "GPT-4.1": {
    icon: "◎",
    color: "#2563eb",
    bg: "rgba(37, 99, 235, 0.1)",
    border: "rgba(37, 99, 235, 0.2)",
  },
  "Claude Haiku 4.5": {
    icon: "◆",
    color: "#c084fc",
    bg: "rgba(192,132,252,0.08)",
    border: "rgba(192,132,252,0.2)",
  },
  Cache: {
    icon: "⚡",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.08)",
    border: "rgba(148,163,184,0.2)",
  },
  Error: {
    icon: "⚠",
    color: "#f87171",
    bg: "rgba(248,113,113,0.08)",
    border: "rgba(248,113,113,0.2)",
  },
  "Quota Limit": {
    icon: "⚠",
    color: "#b45309",
    bg: "rgba(251,191,36,0.08)",
    border: "rgba(251,191,36,0.2)",
  },
};

export default function ModelBadge({ model, cached }: Props) {
  const meta =
    MODEL_META[model] ??
    (model.startsWith("Gemini")
      ? GEMINI_STYLE
      : {
          icon: "AI",
          color: "var(--text-secondary)",
          bg: "rgba(37, 99, 235, 0.08)",
          border: "rgba(136,136,136,0.2)",
        });

  return (
    <div className="flex items-center gap-1.5 mt-2">
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
      >
        <span className="font-bold leading-none">{meta.icon}</span>
        <span>{model === "Error" ? "Response issue" : model}</span>
      </span>
      {cached && (
        <span
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
          style={{
            background: "rgba(251,191,36,0.08)",
            color: "#b45309",
            border: "1px solid rgba(251,191,36,0.2)",
          }}
        >
          ⚡ Cached
        </span>
      )}
    </div>
  );
}
