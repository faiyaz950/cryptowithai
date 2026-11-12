import { FlaskConical, Radio } from "lucide-react";

/** "PAPER" pill — virtual paisa. P&L ke saath lagta hai taaki asli aur paper mein confusion na ho. */
export function PaperTag({ className = "" }: { className?: string }) {
  return (
    <span className={`mode-tag mode-tag-paper ${className}`} title="Paper trading — virtual funds, not real money">
      <FlaskConical className="w-3 h-3" aria-hidden />
      Paper
    </span>
  );
}

/** "LIVE" pill — exchange par asli paisa. */
export function LiveTag({ className = "" }: { className?: string }) {
  return (
    <span className={`mode-tag mode-tag-live ${className}`} title="Live — real money on the exchange">
      <Radio className="w-3 h-3" aria-hidden />
      Live
    </span>
  );
}

/** Compact mode pill — no restating Paper/Live prose. */
export function ModeStrip({ mode }: { mode: "paper" | "live" }) {
  return mode === "paper" ? (
    <div className="mode-strip mode-strip-paper" role="note">
      <PaperTag />
    </div>
  ) : (
    <div className="mode-strip mode-strip-live" role="note">
      <LiveTag />
    </div>
  );
}
