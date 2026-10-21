import { FlaskConical, Radio } from "lucide-react";

/** "PAPER" pill — virtual paisa. P&L ke saath lagta hai taaki asli aur paper mein confusion na ho. */
export function PaperTag({ className = "" }: { className?: string }) {
  return (
    <span className={`mode-tag mode-tag-paper ${className}`} title="Paper trading — virtual paisa, asli nahi">
      <FlaskConical className="w-3 h-3" aria-hidden />
      Paper
    </span>
  );
}

/** "LIVE" pill — exchange par asli paisa. */
export function LiveTag({ className = "" }: { className?: string }) {
  return (
    <span className={`mode-tag mode-tag-live ${className}`} title="Live — exchange par asli paisa">
      <Radio className="w-3 h-3" aria-hidden />
      Live
    </span>
  );
}

/** Ek line ki strip — page/ticket kis mode mein hai. */
export function ModeStrip({ mode }: { mode: "paper" | "live" }) {
  return mode === "paper" ? (
    <div className="mode-strip mode-strip-paper" role="note">
      <PaperTag />
      <span>Virtual paisa — yahan ka P&amp;L asli nahi hai</span>
    </div>
  ) : (
    <div className="mode-strip mode-strip-live" role="note">
      <LiveTag />
      <span>Exchange par asli order — asli paisa</span>
    </div>
  );
}
