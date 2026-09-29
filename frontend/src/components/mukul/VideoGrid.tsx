"use client";

import { useEffect, useState } from "react";
import { FALLBACK_VIDEOS, MUKUL_VIDEOS_URL, videoThumb, videoUrl, type MukulVideo } from "@/lib/mukul/videos";

export default function VideoGrid({ featured = true }: { featured?: boolean }) {
  const [videos, setVideos] = useState<MukulVideo[]>(FALLBACK_VIDEOS);
  const [active, setActive] = useState(FALLBACK_VIDEOS[0]?.id ?? "");

  useEffect(() => {
    let cancel = false;
    fetch("/api/mukul/videos")
      .then((res) => res.json())
      .then((data: { videos?: MukulVideo[] }) => {
        if (cancel || !data.videos?.length) return;
        setVideos(data.videos);
        setActive(data.videos[0].id);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  const current = videos.find((video) => video.id === active) ?? videos[0];

  return (
    <section className="mc-videos" aria-labelledby="mukul-videos-heading">
      <div className="mc-section-head">
        <h2 id="mukul-videos-heading">Mukul ke Crypto Videos</h2>
        <a href={MUKUL_VIDEOS_URL} target="_blank" rel="noreferrer">
          YouTube par saare crypto videos
        </a>
      </div>
      {featured && current && (
        <div className="mc-player">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${current.id}`}
            title={current.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          <p>{current.title}</p>
        </div>
      )}
      <ul className="mc-video-grid">
        {videos.map((video) => (
          <li key={video.id}>
            <button type="button" className="mc-video-card" onClick={() => setActive(video.id)} data-active={video.id === current?.id}>
              <img src={videoThumb(video.id)} alt="" width={480} height={270} />
              <span className="mc-video-time">{video.duration}</span>
              <span className="mc-video-title">{video.title}</span>
            </button>
            <a className="mc-video-open" href={videoUrl(video.id)} target="_blank" rel="noreferrer">
              YouTube par kholen
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
