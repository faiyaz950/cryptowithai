import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

interface StoredEvent {
  id: string;
  type: string;
  at: string;
  offer: string;
  content: string;
  clickId: string;
}

const file = path.join(process.cwd(), ".data", "mukul-funnel.json");

async function readEvents(): Promise<StoredEvent[]> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as StoredEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const events = await readEvents();
  return Response.json({ events });
}

export async function POST(request: Request) {
  let body: StoredEvent;
  try {
    body = (await request.json()) as StoredEvent;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!body?.id || !body.type) return Response.json({ ok: false }, { status: 400 });
  const events = await readEvents();
  if (!events.some((event) => event.id === body.id)) {
    events.push({
      id: String(body.id),
      type: String(body.type),
      at: String(body.at || new Date().toISOString()),
      offer: String(body.offer || "b"),
      content: String(body.content || "direct"),
      clickId: String(body.clickId || ""),
    });
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(events.slice(-5000)));
  }
  return Response.json({ ok: true });
}
