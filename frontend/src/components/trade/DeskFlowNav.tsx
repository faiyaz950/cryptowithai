"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import {
  DESK_STAGES,
  nextStage,
  stageFor,
  type DeskFeature,
  type DeskStage,
  type DeskTab,
} from "@/lib/deskFlow";

interface Props {
  activeId: string;
  /** Trade desk ke andar tab badalne ke liye. Baaki pages sirf links use karti hain. */
  onSelectTab?: (tab: DeskTab) => void;
  /**
   * `side` — desktop rail, teeno steps hamesha khule.
   * `bar` — chhoti screen (ya alag page) pe step switcher + us step ke tools.
   */
  variant: "side" | "bar";
  /** Alag pages (Calculators, Profile) pe bar desktop par bhi dikhe. */
  persist?: boolean;
  /** Sign in / account. Side rail ke neeche, chhoti screen par step bar ke end par. */
  footer?: ReactNode;
}

const NAV_OPEN_KEY = "cryptomantra_nav_open";

export default function DeskFlowNav({ activeId, onSelectTab, variant, persist, footer }: Props) {
  const router = useRouter();
  const current = stageFor(activeId);
  const [openId, setOpenId] = useState(current?.id ?? "research");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(window.localStorage.getItem(NAV_OPEN_KEY) === "1");
  }, []);

  const toggleRail = () => {
    setExpanded((value) => {
      const next = !value;
      window.localStorage.setItem(NAV_OPEN_KEY, next ? "1" : "0");
      return next;
    });
  };

  const expandRail = () => {
    setExpanded(true);
    window.localStorage.setItem(NAV_OPEN_KEY, "1");
  };

  const collapseRail = () => {
    setExpanded(false);
    window.localStorage.setItem(NAV_OPEN_KEY, "0");
  };

  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (variant !== "side" || !expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      const rail = railRef.current;
      const target = event.target;
      if (rail && target instanceof Node && rail.contains(target)) return;
      collapseRail();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [variant, expanded]);

  useEffect(() => {
    if (current) setOpenId(current.id);
  }, [current]);

  const open = (item: DeskFeature) => {
    if (item.tab && onSelectTab) {
      onSelectTab(item.tab);
      return;
    }
    router.push(item.href);
  };

  const itemNode = (item: DeskFeature, stage: DeskStage) => {
    const Icon = item.icon;
    const selected = item.id === activeId;
    const className = variant === "side" ? "desk-flow-item" : "desk-flow-chip";
    const body = (
      <>
        <Icon className="w-4 h-4" aria-hidden />
        <span>{item.label}</span>
      </>
    );
    if (item.tab && onSelectTab) {
      return (
        <button
          key={item.id}
          type="button"
        className={className}
        data-active={selected}
        title={item.label}
        aria-current={selected ? "page" : undefined}
        onClick={() => open(item)}
        >
          {body}
        </button>
      );
    }
    return (
      <Link
        key={item.id}
        href={item.href}
        className={className}
        data-active={selected}
        title={item.label}
        aria-current={selected ? "page" : undefined}
        onClick={() => setOpenId(stage.id)}
      >
        {body}
      </Link>
    );
  };

  if (variant === "side") {
    const upcoming = nextStage(activeId);
    return (
      <nav
        ref={railRef}
        className="desk-flow-side"
        data-open={expanded}
        aria-label="Trading flow"
        onClick={(event) => {
          if (expanded) return;
          const target = event.target;
          if (!(target instanceof Element) || target.closest(".desk-rail-brand")) return;
          expandRail();
        }}
      >
        <button
          type="button"
          className="desk-rail-brand"
          aria-expanded={expanded}
          aria-label={expanded ? "Close menu" : "Open menu"}
          onClick={toggleRail}
        >
          <img src="/mukul/icon.png" alt="" width={28} height={28} />
          <span className="desk-rail-name">Cryptomantra</span>
        </button>
        <div className="desk-flow-scroll">
          {DESK_STAGES.map((stage) => {
            const here = stage.items.some((item) => item.id === activeId);
            return (
              <section key={stage.id} className="desk-flow-group" data-current={here} aria-labelledby={`flow-${stage.id}`}>
                <h2 id={`flow-${stage.id}`} className="desk-flow-kicker">{stage.short}</h2>
                <div className="desk-flow-list">
                  {stage.items.map((item) => itemNode(item, stage))}
                </div>
              </section>
            );
          })}
        </div>
        <div className="desk-flow-foot">
          {upcoming && (
            <button type="button" className="desk-flow-next" onClick={() => open(upcoming.feature)}>
              <span>
                Next · {upcoming.stage.short}
                <small>{upcoming.feature.label}</small>
              </span>
              <ArrowRight className="w-4 h-4" aria-hidden />
            </button>
          )}
          {footer}
        </div>
      </nav>
    );
  }

  const shown = DESK_STAGES.find((stage) => stage.id === openId) ?? DESK_STAGES[0];

  return (
    <nav className={`desk-flow-bar${persist ? " is-persist" : ""}`} aria-label="Trading flow">
      <div className="desk-flow-stages" role="tablist" aria-label="Steps">
        {DESK_STAGES.map((stage) => {
          const here = stage.id === shown.id;
          return (
            <button
              key={stage.id}
              type="button"
              role="tab"
              aria-selected={here}
              className="desk-flow-stagebtn"
              data-active={here}
              data-current={stage.items.some((item) => item.id === activeId)}
              onClick={() => setOpenId(stage.id)}
            >
              <span>0{stage.step}</span>
              {stage.short}
            </button>
          );
        })}
      </div>
      <div className="desk-flow-bar-row">
        <div className="desk-flow-chips" role="tabpanel" aria-label={shown.label}>
          {shown.items.map((item) => itemNode(item, shown))}
        </div>
        {footer}
      </div>
    </nav>
  );
}
