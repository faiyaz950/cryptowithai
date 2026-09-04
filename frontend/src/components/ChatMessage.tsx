"use client";

import { memo, useState, useMemo, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/types";
import { TOPIC_CONFIG } from "@/lib/types";
import { parseFollowUps } from "@/lib/parseResponse";
import ModelBadge from "./ModelBadge";
import Logo from "@/components/Logo";
import ThinkingPad from "./ThinkingPad";
import StockChartCard from "./StockChartCard";
import StockMetricsCard from "./StockMetricsCard";
import FollowUpSuggestions from "./FollowUpSuggestions";

function sharedPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i += 1;
  return i;
}

function nextAnswerChunk(current: string, target: string, aggressive: boolean): string {
  const remaining = target.slice(current.length);
  if (!remaining) return target;

  if (aggressive) {
    const take = Math.min(remaining.length, remaining.length > 280 ? 72 : 36);
    const space = remaining.lastIndexOf(" ", take);
    const newline = remaining.lastIndexOf("\n", take);
    const breakAt = Math.max(space, newline);
    return current + remaining.slice(0, breakAt > 8 ? breakAt + 1 : take);
  }

  const word = remaining.match(/^\s*\S{1,28}\s*/);
  if (word) return current + word[0];
  return current + remaining.slice(0, Math.min(6, remaining.length));
}

function useSmoothText(
  target: string,
  animate: boolean,
  stillReceiving: boolean,
): { shown: string; catchingUp: boolean } {
  const [shown, setShown] = useState(() => (animate ? "" : target));
  const shownRef = useRef(shown);
  const targetRef = useRef(target);
  const receivingRef = useRef(stillReceiving);
  targetRef.current = target;
  receivingRef.current = stillReceiving;

  useEffect(() => {
    if (!animate) {
      shownRef.current = targetRef.current;
      setShown(targetRef.current);
      return;
    }

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      shownRef.current = targetRef.current;
      setShown(targetRef.current);
      return;
    }

    let timer = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const nextTarget = targetRef.current;
      let current = shownRef.current;

      if (current && !nextTarget.startsWith(current)) {
        current = nextTarget.slice(0, sharedPrefixLength(current, nextTarget));
        shownRef.current = current;
        setShown(current);
      }

      if (current.length < nextTarget.length) {
        const lag = nextTarget.length - current.length;
        const next = nextAnswerChunk(current, nextTarget, lag > 220);
        shownRef.current = next;
        setShown(next);
        timer = window.setTimeout(tick, lag > 220 ? 14 : 16);
        return;
      }
      if (receivingRef.current) {
        timer = window.setTimeout(tick, 28);
      }
    };
    timer = window.setTimeout(tick, 12);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [animate, stillReceiving]);

  const catchingUp = animate && shown.length < target.length;
  return { shown: animate ? shown : target, catchingUp };
}

interface Props {
  message: Message;
  onFollowUp?: (text: string) => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatDate(date: Date): string {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  if (isToday) return formatTime(date);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " + formatTime(date);
}

function ChatMessage({ message, onFollowUp }: Props) {
  const [copied, setCopied] = useState(false);
  const [showTimestamp, setShowTimestamp] = useState(false);
  const isUser = message.role === "user";
  const liveSession = useRef(Boolean(message.revealLive || message.isStreaming || message.thinkingActive));
  const streamEndRef = useRef<HTMLDivElement>(null);
  const [padReady, setPadReady] = useState(true);

  const handlePadComplete = useCallback(() => {
    setPadReady(true);
  }, []);

  const answerTarget = message.content.replace(/---FOLLOW_UPS---[\s\S]*/i, "");
  const { shown: smoothContent, catchingUp } = useSmoothText(
    isUser ? message.content : answerTarget,
    !isUser && liveSession.current,
    Boolean(message.isStreaming),
  );

  const parsed = useMemo(() => {
    if (isUser) {
      return { content: message.content, followUps: message.followUps ?? [] };
    }
    if (liveSession.current) {
      return {
        content: smoothContent,
        followUps: message.isStreaming || catchingUp ? [] : (message.followUps ?? []),
      };
    }
    if (message.followUps?.length) {
      return { content: message.content, followUps: message.followUps };
    }
    return parseFollowUps(message.content);
  }, [message.content, smoothContent, message.followUps, message.isStreaming, isUser, catchingUp]);

  const showCursor = !isUser && padReady && (Boolean(message.isStreaming) || catchingUp);

  useEffect(() => {
    if (!liveSession.current) return;
    if (!showCursor && !message.thinkingActive) return;
    streamEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [smoothContent, showCursor, message.thinkingActive]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(parsed.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  if (isUser) {
    const hasAttachments = message.attachments && message.attachments.length > 0;
    return (
      <div
        className="fade-in-up flex justify-end mb-6"
        onMouseEnter={() => setShowTimestamp(true)}
        onMouseLeave={() => setShowTimestamp(false)}
      >
        <div className="flex flex-col items-end gap-1 max-w-[95%]">
          {hasAttachments && (
            <div className="flex flex-wrap gap-2 justify-end mb-1">
              {message.attachments!.map((att) => (
                <div
                  key={att.id}
                  className="card-elevated rounded-lg overflow-hidden"
                >
                  {att.type === "image" ? (
                    <img
                      src={att.url}
                      alt={att.name}
                      className="max-w-[200px] max-h-[200px] object-contain cursor-pointer"
                      onClick={() => window.open(att.url, "_blank")}
                    />
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="var(--text-muted)" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{att.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {message.content && (
            <div
              className="card-elevated px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed"
              style={{ backgroundColor: "var(--accent-soft)", color: "var(--text-primary)", borderColor: "rgba(37, 99, 235, 0.18)" }}
            >
              {message.content}
            </div>
          )}
          {showTimestamp && (
            <span className="text-xs fade-in" style={{ color: "var(--text-muted)" }}>
              {formatDate(message.timestamp)}
            </span>
          )}
        </div>
      </div>
    );
  }

  const topicCfg = message.topic ? TOPIC_CONFIG[message.topic] : null;
  const answerReady = padReady && !catchingUp && !message.isStreaming;
  const showCharts = Boolean(message.chartData);
  const followUps = answerReady ? (parsed.followUps.length ? parsed.followUps : message.followUps ?? []) : [];

  return (
    <div
      className="fade-in-up flex gap-3 mb-8 group"
      onMouseEnter={() => setShowTimestamp(true)}
      onMouseLeave={() => setShowTimestamp(false)}
    >
      <div className="flex-shrink-0 mt-0.5">
        <Logo size={28} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Finowings AI</span>
          {topicCfg && message.topic && message.topic !== "general" && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium"
              style={{ background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
            >
              {topicCfg.label}
            </span>
          )}
          {showTimestamp && !message.isStreaming && (
            <span className="text-xs fade-in" style={{ color: "var(--text-muted)" }}>
              {formatDate(message.timestamp)}
            </span>
          )}
        </div>

        {(message.thinkingActive || (message.thinkingSteps && message.thinkingSteps.length > 0)) && (
          <ThinkingPad
            steps={message.thinkingSteps ?? []}
            isActive={message.thinkingActive}
            live={liveSession.current}
            defaultExpanded={liveSession.current}
            onRevealComplete={handlePadComplete}
          />
        )}

        {/* Live charts & metrics */}
        {showCharts && message.chartData && (
          <>
            <StockChartCard data={message.chartData} />
            {message.chartData.type === "stock" && (
              <StockMetricsCard data={message.chartData} />
            )}
          </>
        )}

        <div className="relative">
          <div className="prose-dark">
            {parsed.content ? (
              <div className={showCursor ? "typing-cursor" : ""}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.content}</ReactMarkdown>
              </div>
            ) : message.isStreaming && padReady && !message.thinkingActive && !message.thinkingSteps?.length ? (
              <div className="flex items-center gap-1.5 py-2" aria-label="Waiting for response">
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--text-muted)", animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--text-muted)", animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--text-muted)", animationDelay: "300ms" }} />
              </div>
            ) : null}
          </div>
          <div ref={streamEndRef} />

          {!message.isStreaming && !catchingUp && parsed.content && (
            <button
              onClick={handleCopy}
              className="mt-2 opacity-0 group-hover:opacity-100 transition-all duration-150 p-1.5 rounded-lg inline-flex items-center gap-1.5"
              style={{ background: "transparent", color: copied ? "var(--accent)" : "var(--text-muted)" }}
              title={copied ? "Copied!" : "Copy"}
              onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = "var(--text-secondary)"; }}
              onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-xs">Copied</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="text-xs">Copy</span>
                </>
              )}
            </button>
          )}
        </div>

        {answerReady && message.model && (
          <ModelBadge model={message.model} cached={message.cached} />
        )}

        {answerReady && message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>
              Google Search sources
            </p>
            <div className="flex flex-wrap gap-2">
              {message.sources.map((src, i) => (
                <a
                  key={`${src.url}-${i}`}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                  style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "var(--text-muted)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                >
                  {src.title}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Follow-up suggestions */}
        {followUps.length > 0 && onFollowUp && (
          <FollowUpSuggestions suggestions={followUps} onSelect={onFollowUp} />
        )}
      </div>
    </div>
  );
}

// Streaming updates re-render only the message that changed (see page.tsx's onToken/onThinking
// handlers, which keep other message objects referentially stable) — memoizing here stops every
// other message in a long conversation from re-rendering (and re-parsing its markdown) on each token.
export default memo(ChatMessage);
