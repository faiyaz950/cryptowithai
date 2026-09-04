"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, CandlestickChart } from "lucide-react";
import type { Message, Conversation, UserType, Topic, Attachment, AIModelId, AIModelOption } from "@/lib/types";
import { TOPIC_CONFIG } from "@/lib/types";
import { sendMessageStream, fetchAvailableModels } from "@/lib/api";
import { getPortfolioAIContext } from "@/lib/portfolio";
import { parseFollowUps } from "@/lib/parseResponse";
import { useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/Sidebar";
import ChatMessage from "@/components/ChatMessage";
import ChatInput from "@/components/ChatInput";
import ModelSelector from "@/components/ModelSelector";
import WelcomeScreen from "@/components/WelcomeScreen";

// ── Helpers ────────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function generateTitle(question: string): string {
  return question.length > 45 ? question.slice(0, 45) + "…" : question;
}

// ── localStorage helpers ──────────────────────────────────────────────────

const CONV_KEY = "finowingsai_conversations";
const LIMIT_KEY = "finowingsai_daily_limit";
const MODEL_KEY = "finowingsai_selected_model";

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    // Rehydrate Date objects
    return parsed.map((c) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      messages: c.messages.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch {
    return [];
  }
}

function saveConversations(convs: Conversation[]) {
  try {
    const trimmed = convs.slice(0, 50).map((c) => ({
      ...c,
      messages: c.messages.map((m) => ({
        ...m,
        isStreaming: false,
        thinkingActive: false,
        revealLive: false,
      })),
    }));
    localStorage.setItem(CONV_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full — ignore
  }
}

interface DailyLimit {
  count: number;
  date: string; // "YYYY-MM-DD"
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadDailyLimit(): number {
  try {
    const raw = localStorage.getItem(LIMIT_KEY);
    if (!raw) return 10;
    const data: DailyLimit = JSON.parse(raw);
    if (data.date !== todayStr()) return 10; // new day — reset
    return Math.max(0, 10 - data.count);
  } catch {
    return 10;
  }
}

function loadSelectedModel(): AIModelId {
  try {
    const saved = localStorage.getItem(MODEL_KEY);
    if (saved === "groq" || saved === "openai" || saved === "grok" || saved === "claude") {
      return "gemini";
    }
    if (saved && ["auto", "gemini"].includes(saved)) {
      return saved as AIModelId;
    }
  } catch {
    // ignore
  }
  return "gemini";
}

function saveSelectedModel(model: AIModelId) {
  try {
    localStorage.setItem(MODEL_KEY, model);
  } catch {
    // ignore
  }
}

function decrementDailyLimit() {
  try {
    const raw = localStorage.getItem(LIMIT_KEY);
    let data: DailyLimit = { count: 0, date: todayStr() };
    if (raw) {
      const parsed: DailyLimit = JSON.parse(raw);
      data = parsed.date === todayStr() ? parsed : { count: 0, date: todayStr() };
    }
    data.count += 1;
    localStorage.setItem(LIMIT_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function HomePage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [profileOpen, setProfileOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [userType, setUserType] = useState<UserType>("free");
  const [questionsLeft, setQuestionsLeft] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<AIModelId>("gemini");
  const [availableModels, setAvailableModels] = useState<AIModelOption[]>([]);

  // Refs for async-safe access
  const conversationsRef = useRef<Conversation[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastQuestionRef = useRef<{ text: string; convId: string } | null>(null);

  // ── Load from localStorage on mount ──────────────────────────────────────

  useEffect(() => {
    const saved = loadConversations();
    setConversations(saved);
    setQuestionsLeft(loadDailyLimit());
    setSelectedModel(loadSelectedModel());
  }, []);

  useEffect(() => {
    fetchAvailableModels(userType).then(setAvailableModels);
  }, [userType]);

  const handleModelChange = useCallback((model: AIModelId) => {
    setSelectedModel(model);
    saveSelectedModel(model);
  }, []);

  useEffect(() => {
    if (selectedModel === "claude" && userType === "free") {
      handleModelChange("auto");
    }
  }, [userType, selectedModel, handleModelChange]);

  // Pick up portfolio analysis prompt from Portfolio page
  const pendingPortfolioPrompt = useRef<string | null>(null);
  useEffect(() => {
    const prompt = sessionStorage.getItem("arjunai_portfolio_prompt");
    if (prompt) {
      sessionStorage.removeItem("arjunai_portfolio_prompt");
      pendingPortfolioPrompt.current = prompt;
    }
  }, []);

  // ── Keep ref in sync ──────────────────────────────────────────────────────

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // ── Persist to localStorage when conversations change ─────────────────────

  useEffect(() => {
    if (conversations.length > 0) {
      saveConversations(conversations);
    }
  }, [conversations]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const messages = activeConversation?.messages ?? [];

  // ── Smart auto-scroll (only when near bottom) ─────────────────────────────

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((force = false) => {
    if (force || isNearBottom()) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isNearBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setActiveId(null);
        setError(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleNewChat = useCallback(() => {
    setActiveId(null);
    setError(null);
  }, []);

  const handleSelectConv = useCallback((id: string) => {
    setActiveId(id);
    setError(null);
  }, []);

  const handleDeleteConv = useCallback((id: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveConversations(next);
      return next;
    });
    setActiveId((prev) => (prev === id ? null : prev));
  }, []);

  const handleStopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── Core send logic ───────────────────────────────────────────────────────

  const doSend = useCallback(async (text: string, targetConvId?: string, attachments?: Attachment[]) => {
    if (isLoading) return;
    setError(null);

    const currentActiveId = targetConvId ?? activeId;
    const existingConv = conversationsRef.current.find((c) => c.id === currentActiveId);
    const convId = existingConv ? currentActiveId! : generateId();
    const isNewConv = !existingConv;

    const userMsg: Message = {
      id: generateId(),
      role: "user",
      content: text,
      timestamp: new Date(),
      attachments: attachments?.map((att) => ({
        ...att,
        file: undefined, // Don't store File object in state
      })),
    };

    const aiMsgId = generateId();
    const aiPlaceholder: Message = {
      id: aiMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
      thinkingSteps: [],
      thinkingActive: true,
      revealLive: true,
    };

    // Store for retry
    lastQuestionRef.current = { text, convId };

    // Optimistic insert
    if (isNewConv) {
      const newConv: Conversation = {
        id: convId,
        title: generateTitle(text),
        messages: [userMsg, aiPlaceholder],
        createdAt: new Date(),
      };
      setConversations((prev) => [newConv, ...prev]);
      setActiveId(convId);
    } else {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, messages: [...c.messages, userMsg, aiPlaceholder] }
            : c,
        )
      );
    }

    setIsLoading(true);
    scrollToBottom(true);

    const history = (existingConv?.messages ?? [])
      .filter((m) => !m.isStreaming)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));

    const portfolioCtx = getPortfolioAIContext();

    // Images/files need Gemini vision — auto-switch if user picked text-only model
    const hasAttachments = attachments && attachments.length > 0;
    const effectiveModel =
      hasAttachments && selectedModel !== "auto" && selectedModel !== "gemini" && selectedModel !== "openai"
        ? "gemini"
        : selectedModel;

    // Set up abort controller
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await sendMessageStream(
        {
          question: text,
          user_type: userType,
          history,
          portfolio_context: portfolioCtx,
          attachments,
          preferred_model: effectiveModel,
        },
        {
          onStart: (meta) => {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId
                  ? {
                      ...c,
                      topic: meta.topic,
                      messages: c.messages.map((m) =>
                        m.id === aiMsgId
                          ? {
                              ...m,
                              topic: meta.topic,
                              thinkingActive: true,
                              chartData: meta.chartData ?? m.chartData ?? null,
                            }
                          : m,
                      ),
                    }
                  : c,
              )
            );
            scrollToBottom();
          },
          onThinking: (step, index) => {
            if (!step?.trim()) return;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId
                  ? {
                      ...c,
                      messages: c.messages.map((m) => {
                        if (m.id !== aiMsgId) return m;
                        const steps = (m.thinkingSteps ?? []).filter((s) => s.trim().length > 0);
                        const next = [...steps];
                        if (index < next.length) {
                          next[index] = step;
                        } else {
                          next.push(step);
                        }
                        return {
                          ...m,
                          thinkingSteps: next,
                          thinkingActive: true,
                        };
                      }),
                    }
                  : c,
              )
            );
            scrollToBottom();
          },
          onToken: (token) => {
            if (!token) return;
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId
                  ? {
                      ...c,
                      messages: c.messages.map((m) => {
                        if (m.id !== aiMsgId) return m;
                        let nextContent = m.content + token;
                        if (m.content && token.startsWith(m.content)) {
                          nextContent = token;
                        } else if (token && m.content.startsWith(token) && token.length < m.content.length) {
                          nextContent = m.content;
                        }
                        return { ...m, content: nextContent, thinkingActive: false };
                      }),
                    }
                  : c,
              )
            );
            scrollToBottom();
          },
          onDone: (model, topic, cached, extras) => {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId
                  ? {
                      ...c,
                      topic,
                      messages: c.messages.map((m) => {
                        if (m.id !== aiMsgId) return m;
                        const parsed = parseFollowUps(m.content);
                        return {
                          ...m,
                          content: parsed.content,
                          followUps: parsed.followUps,
                          model,
                          topic,
                          cached,
                          isStreaming: false,
                          thinkingActive: false,
                          thinkingSteps: extras?.thinkingSteps ?? m.thinkingSteps,
                          chartData: extras?.chartData ?? m.chartData,
                          sources: extras?.sources,
                          searchQueries: extras?.searchQueries,
                          grounded: extras?.grounded,
                        };
                      }),
                    }
                  : c,
              )
            );
            if (userType === "free") {
              decrementDailyLimit();
              setQuestionsLeft(loadDailyLimit());
            }
            scrollToBottom(true);
          },
          onError: (msg) => {
            setError(msg);
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId
                  ? { ...c, messages: c.messages.filter((m) => m.id !== aiMsgId) }
                  : c,
              )
            );
          },
        },
        controller.signal,
      );
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") {
        // User stopped generation — finalize whatever was streamed
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === aiMsgId && m.isStreaming
                      ? { ...m, isStreaming: false, model: "Stopped" }
                      : m,
                  ),
                }
              : c,
          )
        );
      } else {
        const errMsg = err instanceof Error ? err.message : "Kuch gadbad ho gayi. Dobara try karein.";
        const friendlyMsg = errMsg === "Failed to fetch"
          ? "Backend connect nahi ho raha. backend/ folder mein server start karein (port 8000)."
          : errMsg;
        setError(friendlyMsg);
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, messages: c.messages.filter((m) => m.id !== aiMsgId) }
              : c,
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [isLoading, activeId, userType, selectedModel, scrollToBottom]);

  const handleSend = useCallback((text: string, attachments?: Attachment[]) => doSend(text, undefined, attachments), [doSend]);

  // Auto-send portfolio analysis prompt if it was set by portfolio page
  useEffect(() => {
    const prompt = pendingPortfolioPrompt.current;
    if (prompt) {
      pendingPortfolioPrompt.current = null;
      doSend(prompt);
    }
  }, [doSend]);

  const handleRetry = useCallback(() => {
    if (!lastQuestionRef.current || isLoading) return;
    const { text, convId } = lastQuestionRef.current;
    setError(null);
    doSend(text, convId);
  }, [doSend, isLoading]);

  // ── Render ────────────────────────────────────────────────────────────────

  const activeTopicCfg = activeConversation?.topic ? TOPIC_CONFIG[activeConversation.topic] : null;

  return (
    <div className="flex h-dvh" style={{ background: "var(--bg-primary)" }}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        userType={userType}
        questionsLeft={questionsLeft}
        onNew={handleNewChat}
        onSelect={handleSelectConv}
        onDelete={handleDeleteConv}
        onUserTypeChange={setUserType}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0 h-full min-h-0">
        {/* Header */}
        <header
          className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--bg-hover)", background: "var(--bg-primary)" }}
        >
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="w-11 h-11 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "transparent"; }}
            title="Open menu"
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate" style={{ color: "var(--text-secondary)" }}>
              {activeConversation ? activeConversation.title : "Finowings AI"}
            </span>
            {activeTopicCfg && activeConversation?.topic && activeConversation.topic !== "general" && (
              <span
                className="text-xs px-2 py-0.5 rounded-md flex-shrink-0"
                style={{ background: "var(--bg-hover)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
              >
                {activeTopicCfg.label}
              </span>
            )}
          </div>

          <div className="flex-1" />

          {/* Primary nav — moved here from the sidebar */}
          <nav className="flex items-center gap-1 mr-1">
            <HeaderNavLink
              label="Portfolio"
              icon={<Briefcase className="w-4 h-4" />}
              onClick={() => router.push("/portfolio")}
            />
            <HeaderNavLink
              label="Crypto Trade"
              icon={<CandlestickChart className="w-4 h-4" />}
              onClick={() => router.push("/trade")}
            />
          </nav>

          {/* Stop generation button */}
          {isLoading && (
            <button
              onClick={handleStopGeneration}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: "var(--bg-hover)",
                color: "#f87171",
                border: "1px solid var(--border)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop
            </button>
          )}

          {/* Online badge */}
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="text-xs hidden sm:inline" style={{ color: "var(--text-muted)" }}>Online</span>
          </div>

          {/* Login button */}
          {!user && (
            <button
              onClick={() => router.push("/login")}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all duration-150"
              style={{
                background: "linear-gradient(135deg, #1e40af, #2563eb)",
                color: "#ffffff",
                boxShadow: "0 8px 20px rgba(37, 99, 235, 0.22)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 24px rgba(37, 99, 235, 0.28)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 8px 20px rgba(37, 99, 235, 0.22)"; }}
            >
              Login
            </button>
          )}

          {/* Profile dropdown */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full transition-all duration-150"
                style={{
                  background: profileOpen ? "var(--border)" : "transparent",
                  border: "1px solid",
                  borderColor: profileOpen ? "rgba(37, 99, 235, 0.28)" : "var(--border)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.borderColor = "rgba(37, 99, 235, 0.28)"; }}
                onMouseLeave={(e) => { if (!profileOpen) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--border)"; } }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: "linear-gradient(135deg, #1e40af, #2563eb)", color: "#ffffff" }}
                >
                  {user.avatar}
                </div>
                <span className="text-xs font-medium hidden sm:block" style={{ color: "var(--text-primary)", maxWidth: "90px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.name.split(" ")[0]}
                </span>
                <svg
                  className="w-3 h-3 transition-transform duration-200"
                  style={{ color: "var(--text-muted)", transform: profileOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
                  <div
                    className="absolute right-0 top-full mt-2 w-56 rounded-2xl overflow-hidden z-20 fade-in card-elevated"
                  >
                    <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{ background: "linear-gradient(135deg, #1e40af, #2563eb)", color: "#ffffff" }}
                        >
                          {user.avatar}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{user.name}</div>
                          <div className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>{user.email}</div>
                        </div>
                      </div>
                      <div className="mt-2.5">
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={
                            user.plan === "pro"
                              ? { background: "rgba(37, 99, 235, 0.1)", color: "var(--accent)", border: "1px solid rgba(37, 99, 235, 0.22)" }
                              : { background: "var(--bg-hover)", color: "var(--text-muted)" }
                          }
                        >
                          {user.plan === "pro" ? "✨ Pro Plan" : "Free Plan"}
                        </span>
                      </div>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border)" }}>
                      <button
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left"
                        style={{ color: "#f87171" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.06)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        onClick={() => { setProfileOpen(false); logout(); router.push("/login"); }}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                        </svg>
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </header>

        {/* Messages */}
        {messages.length === 0 ? (
          <div className="flex-1 min-h-0 w-full flex items-center justify-center px-4 sm:px-6">
            <div className="w-full max-w-2xl flex flex-col items-center">
              <WelcomeScreen />
              <div className="w-full mt-6">
                <ChatInput
                  onSend={handleSend}
                  disabled={isLoading || (userType === "free" && questionsLeft === 0)}
                  placeholder={
                    userType === "free" && questionsLeft === 0
                      ? "Daily limit reached — upgrade to Pro for unlimited questions"
                      : isLoading
                      ? "Analysing the markets..."
                      : "Ask about any stock..."
                  }
                />
                <p className="text-center text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                  Finowings AI can make mistakes. Confirm with a SEBI-registered advisor before investing.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto" ref={scrollContainerRef}>
              <div className="w-full px-6 md:px-10 lg:px-14 py-6">
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} onFollowUp={handleSend} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {error && (
              <div
                className="mx-4 mb-2 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"
                style={{
                  background: "rgba(248,113,113,0.08)",
                  border: "1px solid rgba(248,113,113,0.2)",
                  color: "#dc2626",
                }}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="flex-1 min-w-0 truncate">{error}</span>
                {lastQuestionRef.current && (
                  <button
                    onClick={handleRetry}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0 transition-all"
                    style={{ background: "rgba(248,113,113,0.12)", color: "#dc2626", border: "1px solid rgba(248,113,113,0.25)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.22)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.12)"; }}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Retry
                  </button>
                )}
                <button onClick={() => setError(null)} className="flex-shrink-0" style={{ color: "#dc2626" }}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            <div className="w-full px-6 md:px-10 lg:px-14 pb-4 pt-2 flex-shrink-0">
              <div className="mb-2">
                <ModelSelector
                  models={availableModels}
                  selected={selectedModel}
                  onChange={handleModelChange}
                  disabled={isLoading}
                />
              </div>
              <ChatInput
                onSend={handleSend}
                disabled={isLoading || (userType === "free" && questionsLeft === 0)}
                placeholder={
                  userType === "free" && questionsLeft === 0
                    ? "Daily limit reached — upgrade to Pro for unlimited questions"
                    : isLoading
                    ? "Analysing the markets..."
                    : "Ask about any stock..."
                }
              />
              <p className="text-center text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                Finowings AI can make mistakes. Confirm with a SEBI-registered advisor before investing.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Top-bar navigation link. Icon-only on narrow screens so the header
    never crowds the conversation title, Online badge and Login button. */
function HeaderNavLink({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex items-center gap-2 h-9 px-2.5 sm:px-3 rounded-lg text-sm font-medium cursor-pointer transition-colors flex-shrink-0"
      style={{ color: "var(--text-secondary)", background: "transparent" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-hover)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
    >
      {icon}
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
