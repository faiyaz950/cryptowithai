export interface ParsedMessage {
  content: string;
  followUps: string[];
}

const FOLLOW_UP_MARKER = /---FOLLOW_UPS---[\s\S]*/i;

export function parseFollowUps(raw: string): ParsedMessage {
  const match = raw.match(FOLLOW_UP_MARKER);
  if (!match) {
    return { content: raw.trim(), followUps: [] };
  }

  const block = match[0];
  const content = raw.replace(FOLLOW_UP_MARKER, "").trim();
  const followUps: string[] = [];

  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toUpperCase().startsWith("---FOLLOW")) continue;
    const cleaned = trimmed.replace(/^[-•*]\s*/, "").trim();
    if (cleaned.length > 5) {
      followUps.push(cleaned);
    }
  }

  return { content, followUps: followUps.slice(0, 4) };
}

export function formatINR(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatUSD(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatMarketCap(value?: number | null): string {
  if (value == null) return "N/A";
  if (value >= 1e12) return `₹${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(0)} Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(0)} L`;
  return formatINR(value);
}
