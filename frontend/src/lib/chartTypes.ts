export type ChartType =
  | "bars"
  | "candles"
  | "hollow"
  | "volume"
  | "hlc"
  | "heikin"
  | "line"
  | "linemarkers"
  | "step"
  | "area"
  | "hlcarea"
  | "baseline"
  | "columns"
  | "highlow";

export interface ChartTypeInfo {
  id: ChartType;
  label: string;
  /** Menu mein separator ke liye. */
  group: "bars" | "lines" | "areas" | "other";
}

export const CHART_TYPES: ChartTypeInfo[] = [
  { id: "bars", label: "Bars", group: "bars" },
  { id: "candles", label: "Candles", group: "bars" },
  { id: "hollow", label: "Hollow candles", group: "bars" },
  { id: "volume", label: "Volume candles", group: "bars" },
  { id: "hlc", label: "HLC bars", group: "bars" },
  { id: "heikin", label: "Heikin Ashi", group: "bars" },
  { id: "line", label: "Line", group: "lines" },
  { id: "linemarkers", label: "Line with markers", group: "lines" },
  { id: "step", label: "Step line", group: "lines" },
  { id: "area", label: "Area", group: "areas" },
  { id: "hlcarea", label: "HLC area", group: "areas" },
  { id: "baseline", label: "Baseline", group: "areas" },
  { id: "columns", label: "Columns", group: "other" },
  { id: "highlow", label: "High-low", group: "other" },
];

export function isChartType(v: unknown): v is ChartType {
  return typeof v === "string" && CHART_TYPES.some((t) => t.id === v);
}

/** Chart toolbar ke timeframes — exchange jo support kare wahi dikhte hain. */
export const CHART_TIMEFRAMES: { value: string; label: string; group: "Minutes" | "Hours" | "Days" }[] = [
  { value: "1m", label: "1 minute", group: "Minutes" },
  { value: "3m", label: "3 minutes", group: "Minutes" },
  { value: "5m", label: "5 minutes", group: "Minutes" },
  { value: "15m", label: "15 minutes", group: "Minutes" },
  { value: "30m", label: "30 minutes", group: "Minutes" },
  { value: "1h", label: "1 hour", group: "Hours" },
  { value: "2h", label: "2 hours", group: "Hours" },
  { value: "4h", label: "4 hours", group: "Hours" },
  { value: "6h", label: "6 hours", group: "Hours" },
  { value: "12h", label: "12 hours", group: "Hours" },
  { value: "1d", label: "1 day", group: "Days" },
  { value: "1w", label: "1 week", group: "Days" },
  { value: "1M", label: "1 month", group: "Days" },
];

export const DEFAULT_TF_FAVORITES = ["1m", "5m", "15m", "1h", "4h", "1d"];

/** Toolbar button ka chhota naam: 15m, 1H, 4H, D, W, M. */
export function tfShort(value: string): string {
  if (value === "1d") return "D";
  if (value === "1w") return "W";
  if (value === "1M") return "M";
  return value.endsWith("m") ? value : value.toUpperCase();
}
