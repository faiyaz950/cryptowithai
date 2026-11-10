"use client";

import { useEffect, useState } from "react";
import { Flame, MessageSquare } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  buildScriptDoc,
  loadScriptComments,
  saveScriptComments,
  type ScriptBullet,
  type ScriptComment,
} from "@/lib/strategyScript";
import type { StrategyDef } from "@/lib/strategies";

/** Theme-aware script documentation — desktop reading layout + comments. */
export default function StrategyScriptPanel({ def }: { def: StrategyDef }) {
  const { user } = useAuth();
  const [comments, setComments] = useState<ScriptComment[]>([]);
  const [draft, setDraft] = useState("");
  const doc = buildScriptDoc(def);

  useEffect(() => {
    setComments(loadScriptComments(def.id));
    setDraft("");
  }, [def.id]);

  const postComment = () => {
    const text = draft.trim();
    if (!text) return;
    const next: ScriptComment[] = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        author: user?.name || user?.username || "Guest",
        at: new Date().toISOString(),
      },
      ...comments,
    ].slice(0, 100);
    setComments(next);
    saveScriptComments(def.id, next);
    setDraft("");
  };

  return (
    <article
      className="script-doc"
      style={{ ["--script-accent" as string]: def.accent || "#f59e0b" }}
    >
      <header className="script-doc-header">
        <p className="script-doc-kicker">Script</p>
        <h1 className="script-doc-title">{def.name}</h1>
        <p className="script-doc-sub">{def.category}</p>
      </header>

      <DocSection title="Overview">
        <p className="script-doc-p">{doc.overview}</p>
      </DocSection>

      <DocSection title="How it works">
        <BulletList items={doc.howItWorks} />
      </DocSection>

      <DocSection title="Key features">
        <ul className="script-doc-list">
          {doc.keyFeatures.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </DocSection>

      <DocSection title="Trading applications">
        <ul className="script-doc-list">
          {doc.applications.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </DocSection>

      <DocSection title="Settings">
        <BulletList items={doc.settings} />
      </DocSection>

      <DocSection title="Conclusion">
        <p className="script-doc-p">{doc.conclusion}</p>
      </DocSection>

      <section className="script-doc-comments">
        <div className="script-doc-comments-head">
          <h2 className="script-doc-comments-title">
            {comments.length} {comments.length === 1 ? "comment" : "comments"}
          </h2>
          <div className="script-doc-comments-tools" aria-hidden>
            <span className="script-doc-tool">
              <MessageSquare />
            </span>
            <span className="script-doc-tool">
              <Flame />
            </span>
          </div>
        </div>

        <div className="script-doc-composer">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Leave a comment that is helpful or encouraging. Let's master the markets together"
            className="script-doc-textarea"
          />
          <div className="script-doc-composer-actions">
            <button type="button" className="script-doc-post" disabled={!draft.trim()} onClick={postComment}>
              Post
            </button>
          </div>
        </div>

        {comments.length > 0 && (
          <ul className="script-doc-comment-list">
            {comments.map((c) => (
              <li key={c.id} className="script-doc-comment">
                <div className="script-doc-comment-meta">
                  <span className="script-doc-comment-author">{c.author}</span>
                  <time dateTime={c.at}>{fmtCommentTime(c.at)}</time>
                </div>
                <p>{c.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="script-doc-section">
      <h2 className="script-doc-h">
        <span className="script-doc-diamond" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: ScriptBullet[] }) {
  return (
    <ul className="script-doc-list">
      {items.map((item) => (
        <li key={item.title}>
          <strong>{item.title}:</strong> {item.body}
        </li>
      ))}
    </ul>
  );
}

function fmtCommentTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}
