"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { ArrowUpRight, Play } from "lucide-react";
import {
  FALLBACK_VIDEOS,
  MUKUL_CHANNEL_URL,
  MUKUL_VIDEOS_URL,
  videoThumb,
  videoUrl,
  type MukulVideo,
} from "@/lib/mukul/videos";

/**
 * Landing ke crypto videos: bada player + "Up next" playlist.
 * YouTube iframe tabhi load hota hai jab koi play dabaye — tab tak sirf
 * thumbnail, isliye page par YouTube ka bhaari script pehle se nahi aata.
 */
export default function LandingVideos() {
  const [videos, setVideos] = useState<MukulVideo[]>(FALLBACK_VIDEOS);
  const [activeId, setActiveId] = useState(FALLBACK_VIDEOS[0]?.id ?? "");
  const [playing, setPlaying] = useState(false);
  /** User ne khud koi video chuna/chalaya ho to nayi list aane par use mat badlo. */
  const touched = useRef(false);

  useEffect(() => {
    let cancel = false;
    fetch("/api/mukul/videos")
      .then((res) => res.json())
      .then((data: { videos?: MukulVideo[] }) => {
        if (cancel || !data.videos?.length) return;
        const list = data.videos;
        setVideos(list);
        // Sabse naya video upar — par user ne kuch chuna ho to wahi rehne do.
        setActiveId((prev) => (touched.current && list.some((v) => v.id === prev) ? prev : list[0].id));
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  const current = videos.find((v) => v.id === activeId) ?? videos[0];
  if (!current) return null;

  const play = () => {
    touched.current = true;
    setPlaying(true);
  };
  const choose = (id: string) => {
    setActiveId(id);
    play();
  };

  return (
    <div className="lp-videos">
      <header className="lp-videos-head" data-reveal>
        <div className="lp-section-head lp-section-head-left">
          <p className="lp-kicker">Free crypto lessons</p>
          <h2 id="videos-heading">
            Learn crypto with <span>Dr. Mukul Agrawal.</span>
          </h2>
          <p>Market updates, beginner guides and full trading courses — straight from his YouTube channel.</p>
        </div>
        <a className="lp-channel" href={MUKUL_CHANNEL_URL} target="_blank" rel="noreferrer">
          <img src="/mukul/mukul-face.webp" alt="" width={44} height={44} />
          <span>
            <strong>Dr. Mukul Agrawal</strong>
            <small>1.8M+ subscribers on YouTube</small>
          </span>
          <span className="lp-channel-cta">Subscribe</span>
        </a>
      </header>

      <div className="lp-player-grid" data-reveal>
        <div className="lp-player">
          <div className="lp-player-frame">
            {playing ? (
              <iframe
                key={current.id}
                src={`https://www.youtube-nocookie.com/embed/${current.id}?autoplay=1&rel=0`}
                title={current.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <button type="button" className="lp-player-poster" onClick={play} aria-label={`Play: ${current.title}`}>
                <Thumb key={current.id} id={current.id} hd />
                <span className="lp-player-play" aria-hidden>
                  <Play />
                </span>
                <span className="lp-player-time">{current.duration}</span>
              </button>
            )}
          </div>
          <div className="lp-player-meta">
            <h3>{current.title}</h3>
            <a href={videoUrl(current.id)} target="_blank" rel="noreferrer">
              Watch on YouTube <ArrowUpRight aria-hidden />
            </a>
          </div>
        </div>

        <div className="lp-playlist">
          <div className="lp-playlist-head">
            <strong>Up next</strong>
            <span>{videos.length} videos</span>
          </div>
          <ol>
            {videos.map((v, i) => (
              <li key={v.id}>
                <button
                  type="button"
                  className="lp-playlist-item"
                  data-active={v.id === current.id}
                  aria-current={v.id === current.id ? "true" : undefined}
                  onClick={() => choose(v.id)}
                >
                  <span className="lp-playlist-index" aria-hidden>
                    {v.id === current.id && playing ? <i className="lp-eq" /> : i + 1}
                  </span>
                  <span className="lp-playlist-thumb">
                    <Thumb id={v.id} />
                    <span>{v.duration}</span>
                  </span>
                  <span className="lp-playlist-title">{v.title}</span>
                </button>
              </li>
            ))}
          </ol>
          <a className="lp-playlist-all" href={MUKUL_VIDEOS_URL} target="_blank" rel="noreferrer">
            All crypto videos on YouTube <ArrowUpRight aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * maxresdefault har video ke liye nahi hota — na ho to YouTube 120px ka
 * grey placeholder deta hai (status 404, par image load ho jaati hai).
 * Itni chhoti image aaye to hqdefault par gir jao.
 */
function Thumb({ id, hd = false }: { id: string; hd?: boolean }) {
  const onLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (hd && img.naturalWidth <= 120 && !img.dataset.fallback) {
      img.dataset.fallback = "1";
      img.src = videoThumb(id);
    }
  };
  return (
    <img
      src={hd ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : videoThumb(id)}
      alt=""
      loading="lazy"
      decoding="async"
      width={hd ? 1280 : 480}
      height={hd ? 720 : 360}
      onLoad={onLoad}
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.dataset.fallback) {
          img.dataset.fallback = "1";
          img.src = videoThumb(id);
        }
      }}
    />
  );
}
