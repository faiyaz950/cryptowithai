"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Sparkles } from "lucide-react";

interface Props {
  steps: string[];
  isActive?: boolean;
  live?: boolean;
  defaultExpanded?: boolean;
  onRevealComplete?: () => void;
}

const FIRST_REVEAL_MS = 80;
const NEXT_REVEAL_MS = 600;

export default function ThinkingPad({
  steps,
  isActive = false,
  live = false,
  defaultExpanded = true,
  onRevealComplete,
}: Props) {
  const reduceMotion = useReducedMotion();
  const liveRef = useRef(Boolean(isActive || live));
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onRevealComplete);

  onCompleteRef.current = onRevealComplete;
  if (isActive || live) liveRef.current = true;

  const realSteps = steps.filter((s) => s.trim().length > 0);
  const stepCount = realSteps.length;
  const animateLive = liveRef.current && !reduceMotion;

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [visible, setVisible] = useState(() => (animateLive ? 0 : stepCount));

  useEffect(() => {
    if (!animateLive) {
      setVisible(stepCount);
      return;
    }
    if (visible >= stepCount) return;

    const delay = visible === 0 ? FIRST_REVEAL_MS : NEXT_REVEAL_MS;
    const t = window.setTimeout(() => setVisible((n) => n + 1), delay);
    return () => window.clearTimeout(t);
  }, [animateLive, stepCount, visible]);

  const shown = realSteps.slice(0, animateLive ? visible : stepCount);
  const allShown = stepCount > 0 && shown.length >= stepCount;
  const working = isActive || (animateLive && !allShown);

  useEffect(() => {
    if (completedRef.current) return;
    const emptyIdle = !isActive && realSteps.length === 0;
    if ((allShown && !isActive) || emptyIdle || (reduceMotion && !isActive && realSteps.length > 0)) {
      completedRef.current = true;
      onCompleteRef.current?.();
    }
  }, [allShown, isActive, realSteps.length, reduceMotion]);

  if (!realSteps.length && !isActive) return null;

  const total = Math.max(stepCount, 1);
  const progress = Math.min(shown.length, total);

  return (
    <div
      className="mb-4 rounded-2xl overflow-hidden"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3.5 min-h-11 cursor-pointer transition-colors duration-200"
        style={{
          background: "transparent",
          borderBottom: expanded ? "1px solid var(--border)" : "none",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        aria-expanded={expanded}
        aria-label={working ? "Thinking process" : "Thought process"}
      >
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: "var(--accent-soft)",
            color: "var(--accent)",
          }}
        >
          {working ? (
            <Sparkles className="w-3.5 h-3.5" />
          ) : (
            <Check className="w-3.5 h-3.5" strokeWidth={2.4} />
          )}
        </span>

        <span className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
          {working ? "Thinking" : "Thought process"}
        </span>

        <span className="text-xs ml-auto tabular-nums" style={{ color: "var(--text-muted)" }}>
          {working ? `${progress} of ${total}` : `${realSteps.length} ${realSteps.length === 1 ? "step" : "steps"}`}
        </span>

        <ChevronDown
          className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
          style={{
            color: "var(--text-muted)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {expanded && (
        <div className="px-3.5 pt-3 pb-3.5" aria-live="polite" aria-busy={working}>
          <ol className="m-0 p-0 list-none">
            {shown.map((step, i) => {
              const isLast = i === shown.length - 1;
              const isCurrent = working && isLast;
              return (
                <motion.li
                  key={`step-${i}`}
                  className="flex gap-3"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="flex flex-col items-center w-6 flex-shrink-0">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold tabular-nums"
                      style={
                        isCurrent
                          ? {
                              background: "var(--accent)",
                              color: "var(--on-accent)",
                              boxShadow: "0 0 0 4px var(--accent-dim)",
                            }
                          : {
                              background: "var(--accent-soft)",
                              color: "var(--accent)",
                            }
                      }
                    >
                      {i + 1}
                    </span>
                    {!isLast && (
                      <span
                        className="w-px flex-1 min-h-3 my-1"
                        style={{ background: "var(--border)" }}
                      />
                    )}
                  </div>
                  <p
                    className={`text-[13px] leading-5 flex-1 min-w-0 ${isLast ? "pb-0" : "pb-3.5"} ${isCurrent ? "font-medium" : ""}`}
                    style={{ color: isCurrent ? "var(--text-primary)" : "var(--text-secondary)" }}
                  >
                    {step}
                  </p>
                </motion.li>
              );
            })}

            {working && shown.length === 0 && (
              <li className="flex gap-3">
                <div className="flex flex-col items-center w-6 flex-shrink-0">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold"
                    style={{
                      background: "var(--accent)",
                      color: "var(--on-accent)",
                      boxShadow: "0 0 0 4px var(--accent-dim)",
                    }}
                  >
                    1
                  </span>
                </div>
                <p className="text-[13px] leading-5" style={{ color: "var(--text-muted)" }}>
                  Reading your question…
                </p>
              </li>
            )}
          </ol>
        </div>
      )}
    </div>
  );
}
