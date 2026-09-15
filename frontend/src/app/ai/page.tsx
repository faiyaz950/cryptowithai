"use client";

import AiAssistant from "@/components/ai/AiAssistant";

/**
 * Standalone AI route — wahi assistant jo desk ke AI tab mein hai, par poore
 * viewport par: na desk sidebar, na doosra header.
 *
 * `trade-root` isliye lagta hai kyunki dark palette usi class par define hai.
 * Uske bina ye page globals.css ka light theme utha leta tha aur desk se
 * fullscreen mein jaate hi safed page khul jaata tha.
 */
export default function AiPage() {
  return (
    <div className="trade-root h-full">
      <AiAssistant />
    </div>
  );
}
