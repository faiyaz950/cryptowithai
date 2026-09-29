import { CRYPTO_TITLE, FALLBACK_VIDEOS, type MukulVideo } from "@/lib/mukul/videos";

export const revalidate = 3600;

const MAX_VIDEOS = 12;
const MIN_SECONDS = 180;

function decode(value: string): string {
  return value
    .replace(/\\u0026/g, "&")
    .replace(/\\u0027/g, "'")
    .replace(/&amp;/g, "&");
}

function seconds(duration: string): number {
  return duration.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

/** Latest channel uploads, sirf crypto titles aur shorts ke bina, curated list ke aage. */
export async function GET() {
  try {
    const res = await fetch("https://www.youtube.com/@mukulagrawal/videos", {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return Response.json({ videos: FALLBACK_VIDEOS, source: "fallback" });
    const html = await res.text();
    const titles = [...html.matchAll(/"lockupMetadataViewModel":\{"title":\{"content":"([^"]+)"\}/g)].map((m) =>
      decode(m[1]),
    );
    const seen = new Set<string>();
    const latest: MukulVideo[] = [];
    for (const match of html.matchAll(/i\.ytimg\.com\/vi\/([\w-]{11})\/.*?thumbnailBadgeViewModel":\{"text":"(\d+:\d+(?::\d+)?)"/g)) {
      const id = match[1];
      if (seen.has(id)) continue;
      seen.add(id);
      const title = titles[seen.size - 1];
      if (!title || !CRYPTO_TITLE.test(title) || seconds(match[2]) < MIN_SECONDS) continue;
      latest.push({ id, duration: match[2], title });
    }
    const ids = new Set(latest.map((video) => video.id));
    const videos = [...latest, ...FALLBACK_VIDEOS.filter((video) => !ids.has(video.id))].slice(0, MAX_VIDEOS);
    return Response.json({ videos, source: latest.length ? "youtube" : "fallback" });
  } catch {
    return Response.json({ videos: FALLBACK_VIDEOS, source: "fallback" });
  }
}
