import type { ChatRequest, ChatResponse, Topic, Attachment, AIModelOption, UserType, ChartData } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export interface ChatRequestWithFiles extends Omit<ChatRequest, "question"> {
  question: string;
  attachments?: Attachment[];
}

export async function sendMessage(payload: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Server error ${res.status}`);
  }

  return res.json();
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onThinking?: (step: string, index: number, total: number) => void;
  onStart?: (meta: { topic: Topic; thinkingSteps?: string[]; chartData?: ChartData | null }) => void;
  onDone: (
    model: string,
    topic: Topic,
    cached: boolean,
    extras?: {
      sources?: Array<{ title: string; url: string }>;
      searchQueries?: string[];
      grounded?: boolean;
      chartData?: ChartData | null;
      thinkingSteps?: string[];
    },
  ) => void;
  onError: (msg: string) => void;
}

export async function sendMessageStream(
  payload: ChatRequestWithFiles,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  const hasAttachments = payload.attachments && payload.attachments.length > 0;

  try {
    if (hasAttachments) {
      const formData = new FormData();
      formData.append("question", payload.question);
      formData.append("user_type", payload.user_type);
      formData.append("preferred_model", payload.preferred_model || "auto");
      formData.append("history", JSON.stringify(payload.history));
      if (payload.portfolio_context) {
        formData.append("portfolio_context", payload.portfolio_context);
      }
      payload.attachments!.forEach((att) => {
        if (att.file) {
          formData.append("files", att.file);
        }
      });

      res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        body: formData,
        signal,
      });
    } else {
      res = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: payload.question,
          user_type: payload.user_type,
          history: payload.history,
          portfolio_context: payload.portfolio_context,
          preferred_model: payload.preferred_model || "auto",
        }),
        signal,
      });
    }
  } catch {
    callbacks.onError("Backend server connect nahi ho raha. Pehle backend start karein: port 8001");
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Server error ${res.status}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;

      try {
        const event = JSON.parse(raw);
        if (event.type === "start") {
          callbacks.onStart?.({
            topic: (event.topic as Topic) ?? "general",
            thinkingSteps: (event.thinking_steps as string[]) ?? [],
            chartData: (event.chart_data as ChartData | null) ?? null,
          });
        } else if (event.type === "thinking") {
          callbacks.onThinking?.(
            event.step as string,
            event.index as number,
            event.total as number,
          );
        } else if (event.type === "token") {
          callbacks.onToken(event.content as string);
        } else if (event.type === "done") {
          callbacks.onDone(
            event.model as string,
            (event.topic as Topic) ?? "general",
            Boolean(event.cached),
            {
              sources: (event.sources as Array<{ title: string; url: string }>) ?? [],
              searchQueries: (event.search_queries as string[]) ?? [],
              grounded: Boolean(event.grounded),
              chartData: (event.chart_data as ChartData | null) ?? null,
              thinkingSteps: (event.thinking_steps as string[]) ?? [],
            },
          );
        } else if (event.type === "error") {
          callbacks.onError(
            event.message === "Failed to fetch" || !event.message
              ? "Backend server connect nahi ho raha. Pehle backend start karein: port 8001"
              : (event.message ?? "Unknown error"),
          );
        }
      } catch {
        // malformed SSE line — skip
      }
    }
  }
}

export async function fetchAvailableModels(userType: UserType = "free"): Promise<AIModelOption[]> {
  try {
    const res = await fetch(`${API_BASE}/api/models?user_type=${userType}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return getDefaultModels();
    const data = await res.json();
    return (data.models as AIModelOption[]) ?? getDefaultModels();
  } catch {
    return getDefaultModels();
  }
}

function getDefaultModels(): AIModelOption[] {
  return [
    { id: "auto", label: "Auto (Gemini)", description: "Gemini with search when quota allows", available: true },
    { id: "gemini", label: "Gemini 3.5 Flash + Search", description: "Google Search + Vision", available: true },
  ];
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
