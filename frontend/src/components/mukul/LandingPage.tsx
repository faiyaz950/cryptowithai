"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Award,
  BookOpen,
  Briefcase,
  FlaskConical,
  FolderKanban,
  Layers,
  LineChart,
  ListOrdered,
  Lock,
  MapPin,
  Phone,
  Plug,
  Quote,
  Radar,
  ShieldCheck,
  Sigma,
  Sparkles,
  Star,
  UserRound,
  Users,
  Wand2,
} from "lucide-react";
import { captureVisit } from "@/lib/mukul/store";
import { MUKUL_VIDEOS_URL } from "@/lib/mukul/videos";
import VideoGrid from "@/components/mukul/VideoGrid";

const STATS = [
  ["3.45M+", "Community members"],
  ["50K+", "Students padhaye"],
  ["23+", "Saal market experience"],
  ["1.8M+", "YouTube subscribers"],
] as const;

/* Ticker sirf achievements dikhata hai — koi market data nahi, isliye
   yahan kuch fetch karne ki zaroorat nahi. */
const TICKER = [
  "Guinness World Record · 2022",
  "Bestselling Author",
  "23+ saal market experience",
  "50,000+ students",
  "TEDx Speaker",
  "Doctorate in Finance",
  "3.45M+ community",
  "100+ workshops",
  "National Achievers Award · 2019",
  "IFA Excellence Award · 2021",
] as const;

const TRUST = [
  { icon: Lock, text: "API keys encrypted" },
  { icon: ShieldCheck, text: "Withdrawal permission kabhi nahi" },
  { icon: UserRound, text: "Order hamesha aap khud lagate hain" },
] as const;

const HERO_CHIPS = [
  { label: "Guinness World Record", value: "2022" },
  { label: "YouTube family", value: "1.8M+" },
  { label: "Students", value: "50K+" },
] as const;

const DESK = [
  {
    icon: Sparkles,
    title: "AI Assistant",
    href: "/trade?tab=ai",
    desc: "Live market data par chalne wala Mukul AI — Hindi, Hinglish ya English mein poochhiye.",
    points: ["Coin ka trend aur setup samjhaaye", "Portfolio aur risk par sawaal", "Chart aur indicators ki explanation"],
  },
  {
    icon: LineChart,
    title: "Markets — Live Chart",
    href: "/trade?tab=markets",
    desc: "Professional candlestick chart, live exchange data ke saath. Desk ka main workspace.",
    points: [
      "EMA 9 / 21 / 50, RSI, MACD, VWAP, ATR, ADX",
      "Jis exchange se connected hain, usi ka chart",
      "1m se 1D tak timeframes, zoom aur scroll",
    ],
  },
  {
    icon: Radar,
    title: "Screeners",
    href: "/trade?tab=screener",
    desc: "Saare coins ek saath scan — kaun bullish, kaun bearish, ek nazar mein.",
    points: ["Signal strength aur strategy agreement", "24h change ke hisaab se sort", "Coin par click karke seedha chart"],
  },
  {
    icon: Star,
    title: "Watchlist",
    href: "/trade?tab=watchlist",
    desc: "Apne pasand ke coins ki list — live price aur change hamesha saamne.",
    points: ["Coins add / remove", "Live price update", "Ek click mein chart kholen"],
  },
  {
    icon: ListOrdered,
    title: "Trades",
    href: "/trade?tab=trades",
    desc: "Apne exchange account ke orders, open positions aur trade history ek jagah.",
    points: ["Open positions aur P&L", "Order history", "Judi hui exchange ka live data"],
  },
  {
    icon: ShieldCheck,
    title: "Risk Desk",
    href: "/trade/risk",
    desc: "Trade lene se pehle risk calculate kijiye — Mukul ka sabse bada lesson: pehle risk, phir reward.",
    points: ["Position Planner — size, stop aur liquidation", "Risk Book — saare open plans ka heat", "Ruin Simulator — sizing ka long-term asar"],
  },
  {
    icon: Briefcase,
    title: "Portfolio",
    href: "/trade?tab=portfolio",
    desc: "Apni crypto holdings ek jagah — exchange statement upload kijiye, coin-wise P&L dekhiye.",
    points: ["Exchange statement CSV / Excel auto-parse", "Coin-wise allocation charts aur P&L", "AI se diversification aur risk analysis"],
  },
  {
    icon: Plug,
    title: "Exchanges",
    href: "/trade?tab=exchanges",
    desc: "Delta, Bybit ya CoinDCX ki API key jodiye — orders aur positions aapke apne account se.",
    points: [
      "Multi-exchange — Delta, Bybit, CoinDCX",
      "API key encrypted; withdrawal permission kabhi nahi",
      "Disconnect karte hi key permanently delete",
    ],
  },
  {
    icon: UserRound,
    title: "Profile & P&L",
    href: "/profile",
    desc: "Aapka account, judi hui exchanges aur P&L analytics — sab ek screen par.",
    points: ["Day-wise P&L chart aur monthly heatmap", "Exchange-wise breakdown", "Balance aur account details"],
  },
  {
    icon: FlaskConical,
    title: "Backtest",
    href: "/trade?tab=backtest",
    desc: "Kisi bhi strategy ko purane data par chala kar dekhiye — paisa lagane se pehle proof.",
    points: ["Win rate, profit factor, max drawdown", "Har trade ki list aur equity curve", "Options strategies bhi real Delta option data par"],
  },
  {
    icon: Layers,
    title: "Strategy Catalogue",
    href: "/trade?tab=strategies",
    desc: "Ready-made strategies ka collection — futures, spot aur options, har ek ke rules ke saath.",
    points: ["Trend, breakout, momentum, mean reversion", "Har strategy ka live verdict", "Seedha backtest ya run kijiye"],
  },
  {
    icon: FolderKanban,
    title: "My Strategies",
    href: "/trade?tab=mine",
    desc: "Aapki banayi strategies ka dashboard — kaunsi chal rahi hai, kaunsi paused.",
    points: ["Closed P&L 30 din aur closed trades", "Drafts, paused aur archived", "Edit karke dobara chalaiye"],
  },
  {
    icon: Wand2,
    title: "Strategy Builder",
    href: "/trade?tab=builder",
    desc: "Bina coding apni strategy banaiye — indicator chuniye, entry / exit rules set kijiye.",
    points: ["Indicator based rules", "Stop-loss, target aur position size", "Futures aur options dono ke liye"],
  },
  {
    icon: Sigma,
    title: "Options",
    href: "/trade?tab=options",
    desc: "Crypto options ka poora toolkit — option chain se lekar multi-leg strategies tak.",
    points: ["Live option chain aur IV", "Spreads aur Iron Condor planner", "Payoff aur analytics"],
  },
];

const ACHIEVEMENTS = [
  ["2019", "National Achievers Award"],
  ["2019", "TEDx Talk"],
  ["2021", "IFA Excellence Award"],
  ["2022", "Guinness World Record — Largest Financial Investment Lesson"],
  ["2022", "Doctorate in Finance"],
] as const;

const SOCIAL = {
  youtube: "https://www.youtube.com/@mukulagrawal",
  instagram: "https://www.instagram.com/themukulagrawal",
  telegram: "https://t.me/themukulagrawal",
  whatsapp: "https://whatsapp.com/channel/0029Va9Geoy72WTt3Qnro42V",
  x: "https://x.com/themukulagrawal",
  linkedin: "https://www.linkedin.com/in/themukulagrawal/",
  facebook: "https://www.facebook.com/themukulagrawal",
  finowings: "https://www.finowings.com",
  allLinks: "https://lnk.bio/mukulagrawal",
} as const;

const COMMUNITY = [
  { name: "YouTube", count: "1.8M+", href: SOCIAL.youtube },
  { name: "Facebook", count: "882K+", href: SOCIAL.facebook },
  { name: "Instagram", count: "670K+", href: SOCIAL.instagram },
  { name: "Twitter / X", count: "205K+", href: SOCIAL.x },
  { name: "Telegram", count: "182K+", href: SOCIAL.telegram },
  { name: "LinkedIn", count: "10K+", href: SOCIAL.linkedin },
  { name: "WhatsApp Channel", count: "Join", href: SOCIAL.whatsapp },
] as const;

const FOLLOW_LINKS = [
  ["YouTube", SOCIAL.youtube],
  ["Instagram", SOCIAL.instagram],
  ["Telegram", SOCIAL.telegram],
  ["WhatsApp Channel", SOCIAL.whatsapp],
  ["Twitter / X", SOCIAL.x],
  ["LinkedIn", SOCIAL.linkedin],
  ["Facebook", SOCIAL.facebook],
  ["finowings.com", SOCIAL.finowings],
  ["All links", SOCIAL.allLinks],
] as const;

const FAQ = [
  ["Kya main beginner hoon to bhi join kar sakta hoon?", "Bilkul. Dr. Mukul Agrawal ka tareeka hamesha beginners se PRO tak ka raha hai. Pehle Backtest aur Risk Desk se practice kijiye — real paisa lagane se pehle."],
  ["Kya Trading Desk mere liye auto-trade karega?", "Nahi. Chart, screener aur AI sirf analysis dikhate hain. Order hamesha aap khud lagate hain, apne exchange account se."],
  ["Kaun kaun se exchange judte hain?", "Delta Exchange India, Bybit aur CoinDCX. API key encrypted store hoti hai, withdrawal permission kabhi nahi maangi jaati, aur disconnect karte hi key delete ho jaati hai."],
  ["Kya ye investment advice hai?", "Nahi. Mukul Crypto Club ek learning platform hai. Koi bhi readout guaranteed prediction ya personal financial advice nahi hai. Crypto mein risk hota hai."],
] as const;

/* Showcase chart poori tarah deterministic hai — server aur client dono par
   ek hi shape banti hai, isliye hydration mismatch nahi hota. */
const CANDLES = Array.from({ length: 26 }, (_, i) => {
  const top = 56 - Math.sin(i / 3.1) * 16 - i * 0.7;
  const body = 6 + Math.abs(Math.cos(i / 1.7)) * 14;
  return {
    x: 10 + i * 13,
    y: top,
    h: body,
    wick: 7 + Math.abs(Math.sin(i * 1.3)) * 8,
    up: Math.sin(i / 2.3) > -0.15,
  };
});
const LINE_PATH = CANDLES.map((c, i) => `${i ? "L" : "M"}${c.x + 4} ${(c.y + c.h / 2).toFixed(1)}`).join(" ");
const AREA_PATH = `${LINE_PATH} L${CANDLES[CANDLES.length - 1].x + 4} 140 L${CANDLES[0].x + 4} 140 Z`;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* Server par useLayoutEffect warn karta hai, isliye wahan useEffect. */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Reveal animation ka switch JS hi on karta hai — root par data-anim="on"
 * lagne ke baad hi elements chhupte hain. JS band ho ya reduced-motion ho to
 * page bina animation ke poora dikhta hai, kabhi blank nahi rehta. Flag paint
 * se pehle (layout effect) lagta hai, isliye koi flicker nahi hota.
 */
function useReveal(rootRef: RefObject<HTMLDivElement | null>) {
  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) return;
    root.setAttribute("data-anim", "on");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute("data-in", "true");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -8% 0px" },
    );
    root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((node) => io.observe(node));
    return () => {
      io.disconnect();
      root.removeAttribute("data-anim");
    };
  }, [rootRef]);
}

/** Top bar ka stuck state aur reading-progress bar. */
function useChrome(scrollRef: RefObject<HTMLDivElement | null>) {
  const [stuck, setStuck] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const max = el.scrollHeight - el.clientHeight;
      setStuck(el.scrollTop > 16);
      setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    read();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollRef]);
  return { stuck, progress };
}

/** "3.45M+" jaise number ko view mein aate hi 0 se count-up karta hai. */
function Counter({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parts = /^([^0-9]*)([0-9][0-9.,]*)(.*)$/.exec(value);
    if (!parts || prefersReducedMotion() || !("IntersectionObserver" in window)) return;
    const [, prefix, digits, suffix] = parts;
    const target = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(target)) return;
    const decimals = digits.includes(".") ? digits.split(".")[1].length : 0;
    const grouped = digits.includes(",");
    const format = (n: number) => {
      const fixed = n.toFixed(decimals);
      return grouped
        ? Number(fixed).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : fixed;
    };

    setShown(prefix + format(0) + suffix);
    let raf = 0;
    let started = 0;
    const DURATION = 1400;
    const step = (now: number) => {
      if (!started) started = now;
      const p = Math.min(1, (now - started) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(prefix + format(target * eased) + suffix);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [value]);

  return <span ref={ref}>{shown}</span>;
}

function DeskShowcase() {
  return (
    <div className="mc-showcase" data-reveal aria-hidden>
      <div className="mc-showcase-bar">
        <span className="mc-dot mc-dot-red" />
        <span className="mc-dot mc-dot-amber" />
        <span className="mc-dot mc-dot-green" />
        <strong>BTCUSD · 15m</strong>
        <em>Mukul Crypto Club — Trading Desk</em>
      </div>
      <div className="mc-showcase-body">
        <svg className="mc-showcase-chart" viewBox="0 0 352 150" preserveAspectRatio="none" role="presentation">
          <defs>
            <linearGradient id="mc-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#19a2dd" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#19a2dd" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[30, 60, 90, 120].map((y) => (
            <line key={y} x1="0" y1={y} x2="352" y2={y} className="mc-grid-line" />
          ))}
          {CANDLES.map((c, i) => (
            <g key={c.x} className="mc-candle" data-up={c.up} style={{ "--i": i } as CSSProperties}>
              <rect x={c.x + 3.4} y={c.y - c.wick / 2} width="1.2" height={c.h + c.wick} rx="0.6" />
              <rect x={c.x} y={c.y} width="8" height={c.h} rx="1.2" />
            </g>
          ))}
          <path className="mc-showcase-area" d={AREA_PATH} fill="url(#mc-area)" />
          <path className="mc-showcase-line" d={LINE_PATH} />
        </svg>
        <ul className="mc-showcase-side">
          <li><span>Signal</span><strong data-tone="up">Bullish</strong></li>
          <li><span>RSI 14</span><strong>58.4</strong></li>
          <li><span>Risk / trade</span><strong>1.0%</strong></li>
          <li><span>Open P&amp;L</span><strong data-tone="up">+2.7%</strong></li>
        </ul>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const params = useSearchParams();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { stuck, progress } = useChrome(scrollRef);
  useReveal(rootRef);

  useEffect(() => {
    captureVisit(params);
  }, [params]);

  const spotlight = (event: ReactMouseEvent<HTMLUListElement>) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>(".mc-desk-card");
    if (!card) return;
    const box = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - box.left}px`);
    card.style.setProperty("--my", `${event.clientY - box.top}px`);
  };

  return (
    <div className="mukul-club" ref={rootRef}>
      <div className="mukul-scroll" ref={scrollRef}>
        <div className="mc-progress" aria-hidden>
          <i style={{ transform: `scaleX(${progress})` }} />
        </div>

        <header className="mc-top mc-top-dark" data-stuck={stuck}>
          <Link href="/" className="mc-brand" aria-label="Mukul Crypto Club home">
            <img className="mc-logo" src="/mukul/logo-MA.webp" alt="Mukul Agrawal" width={132} height={66} />
            <span className="mc-brand-club">Crypto Club</span>
          </Link>
          <nav className="mc-top-nav" aria-label="Club">
            <a href="#desk">Desk Features</a>
            <a href="#about-mukul">About Mukul</a>
            <a href="#videos">Crypto Videos</a>
            <Link href="/trade" className="mc-btn mc-btn-primary">Open Trading Desk</Link>
          </nav>
        </header>

        <section className="mc-hero">
          <div className="mc-aurora" aria-hidden>
            <span className="mc-aurora-gold" />
            <span className="mc-aurora-blue" />
            <span className="mc-aurora-grid" />
          </div>

          <div className="mc-hero-grid">
            <div className="mc-hero-copy">
              <p className="mc-pill" data-rise style={{ "--d": 0 } as CSSProperties}>
                <Sparkles aria-hidden /> Dr. Mukul Agrawal presents
              </p>
              <h1 data-rise style={{ "--d": 1 } as CSSProperties}>
                Mukul <span>Crypto</span> Club
              </h1>
              <p className="mc-hero-sub" data-rise style={{ "--d": 2 } as CSSProperties}>
                Trader · Investor · Bestselling Author · Guinness World Record Holder
              </p>
              <p className="mc-lede" data-rise style={{ "--d": 3 } as CSSProperties}>
                Crypto simplified — beginners se PRO tak. Ek professional crypto trading desk, Mukul AI aur
                Mukul ke crypto videos, sab ek hi jagah.
              </p>
              <div className="mc-hero-actions" data-rise style={{ "--d": 4 } as CSSProperties}>
                <Link href="/trade" className="mc-btn mc-btn-gold mc-btn-lg">
                  Open Trading Desk <ArrowRight aria-hidden />
                </Link>
                <a href="#videos" className="mc-btn mc-btn-lg">Crypto Videos dekhiye</a>
              </div>
              <ul className="mc-trust" data-rise style={{ "--d": 5 } as CSSProperties}>
                {TRUST.map(({ icon: Icon, text }) => (
                  <li key={text}><Icon aria-hidden /> {text}</li>
                ))}
              </ul>
            </div>

            <div className="mc-stage" data-rise style={{ "--d": 3 } as CSSProperties}>
              <span className="mc-stage-halo" aria-hidden />
              <span className="mc-stage-ring" aria-hidden />
              <img
                className="mc-stage-portrait"
                src="/mukul/mkm.webp"
                alt="Dr. Mukul Agrawal"
                width={1536}
                height={1024}
              />
              <ul className="mc-stage-chips" aria-hidden>
                {HERO_CHIPS.map(({ label, value }, i) => (
                  <li key={label} style={{ "--i": i } as CSSProperties}>
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <dl className="mc-stats" data-rise style={{ "--d": 6 } as CSSProperties}>
            {STATS.map(([value, label], i) => (
              <div key={label} style={{ "--i": i } as CSSProperties}>
                <dt>{label}</dt>
                <dd><Counter value={value} /></dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="mc-ticker" aria-hidden>
          <div className="mc-ticker-track">
            {[0, 1].map((copy) => (
              <ul key={copy}>
                {TICKER.map((item) => (
                  <li key={item}><span /> {item}</li>
                ))}
              </ul>
            ))}
          </div>
        </div>

        <section className="mc-section mc-section-soft" id="desk" aria-labelledby="desk-heading">
          <div className="mc-section-intro" data-reveal>
            <p className="mc-kicker">Mukul Crypto Club Trading Desk</p>
            <h2 id="desk-heading">Trading Desk mein kya kya hai</h2>
            <p>
              Ek professional crypto trading terminal — chart, AI, screener, risk, backtest aur strategies.
              Har box par click karke seedha wo tool kholiye.
            </p>
          </div>

          <DeskShowcase />

          <ul className="mc-desk" onMouseMove={spotlight}>
            {DESK.map(({ icon: Icon, title, href, desc, points }, i) => (
              <li key={title} data-reveal style={{ "--d": i % 3 } as CSSProperties}>
                <Link href={href} className="mc-desk-card">
                  <span className="mc-desk-glow" aria-hidden />
                  <span className="mc-desk-head">
                    <span className="mc-feature-icon"><Icon aria-hidden /></span>
                    <h3>{title}</h3>
                  </span>
                  <p>{desc}</p>
                  <ul>
                    {points.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                  <span className="mc-desk-open">Kholen <ArrowRight aria-hidden /></span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mc-center" data-reveal>
            <Link href="/trade" className="mc-btn mc-btn-gold mc-btn-lg">
              Poora desk kholiye <ArrowRight aria-hidden />
            </Link>
          </div>
        </section>

        <section className="mc-section mc-about" id="about-mukul" aria-labelledby="about-mukul-heading">
          <div className="mc-about-grid">
            <div className="mc-about-copy" data-reveal>
              <p className="mc-kicker">The man behind the markets</p>
              <h2 id="about-mukul-heading">Dr. Mukul Agrawal</h2>
              <figure className="mc-quote">
                <Quote aria-hidden />
                <blockquote>Financial independence is a right, not a privilege.</blockquote>
              </figure>
              <p>
                Dr. Mukul Agrawal trader, investor, entrepreneur, bestselling author aur financial educator hain —
                23+ saal ka market experience. YouTube par unki crypto series — Bitcoin price analysis, crypto futures
                course, AI se crypto trading, crypto tax rules aur beginners ke liye crypto portfolio — simple Hinglish mein.
                Mukul Crypto Club usi padhai ko live tools ke saath practice mein badalta hai.
              </p>
              <ul className="mc-creds">
                <li><Award aria-hidden /><span><strong>Guinness World Record</strong> Largest Financial Investment Lesson, 2022</span></li>
                <li><BookOpen aria-hidden /><span><strong>Bestselling author</strong> “The Simplest Book of Technical Analysis” &amp; “Money &amp; You”</span></li>
                <li><LineChart aria-hidden /><span><strong>Founder</strong> Agrawal Corporate (2003) &amp; Finowings (2022)</span></li>
                <li><Users aria-hidden /><span><strong>Creator since 2017</strong> 50,000+ students, 100+ workshops aur events</span></li>
              </ul>
            </div>

            <div className="mc-about-side" data-reveal style={{ "--d": 1 } as CSSProperties}>
              <figure className="mc-avatar-stage">
                <span className="mc-avatar-halo" aria-hidden />
                <img src="/mukul/mkn.webp" alt="Dr. Mukul Agrawal" width={1159} height={1357} />
                <figcaption>
                  <strong>Dr. Mukul Agrawal</strong>
                  <span>Crypto Simplified</span>
                </figcaption>
              </figure>
              <ol className="mc-timeline">
                {ACHIEVEMENTS.map(([year, title], i) => (
                  <li key={title} data-reveal style={{ "--d": i } as CSSProperties}>
                    <span>{year}</span>
                    <strong>{title}</strong>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <div id="videos" className="mc-section mc-section-soft">
          <VideoGrid />
        </div>

        <section className="mc-section mc-section-navy" aria-labelledby="community-heading">
          <img className="mc-watermark" src="/mukul/mkn.webp" alt="" aria-hidden width={1159} height={1357} />
          <div className="mc-section-intro" data-reveal>
            <p className="mc-kicker mc-kicker-gold">Social media family</p>
            <h2 id="community-heading">3 million+ followers ke saath seekhiye</h2>
          </div>
          <ul className="mc-community">
            {COMMUNITY.map(({ name, count, href }, i) => (
              <li key={name} data-reveal style={{ "--d": i % 3 } as CSSProperties}>
                <a href={href} target="_blank" rel="noreferrer" aria-label={`Mukul Agrawal on ${name}`}>
                  <strong>{/\d/.test(count) ? <Counter value={count} /> : count}</strong>
                  <span>{name}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="mc-center" data-reveal>
            <a className="mc-btn mc-btn-gold" href={MUKUL_VIDEOS_URL} target="_blank" rel="noreferrer">
              YouTube par subscribe karein
            </a>
            <a className="mc-btn" href={SOCIAL.allLinks} target="_blank" rel="noreferrer">
              Saare links dekhiye
            </a>
          </div>
        </section>

        <section className="mc-section" aria-labelledby="faq-heading">
          <div className="mc-section-intro" data-reveal>
            <p className="mc-kicker">FAQ</p>
            <h2 id="faq-heading">Aksar pooche jaane wale sawaal</h2>
          </div>
          <div className="mc-faq">
            {FAQ.map(([q, a], i) => (
              <details key={q} data-reveal style={{ "--d": i % 3 } as CSSProperties}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mc-cta" aria-labelledby="cta-heading">
          <div className="mc-cta-inner" data-reveal>
            <p className="mc-kicker mc-kicker-gold">Ready?</p>
            <h2 id="cta-heading">Aaj hi desk kholiye — beginners se PRO tak</h2>
            <p>
              Chart, AI, screener, risk planner aur backtest — sab free mein try kijiye. Exchange baad mein jodiye,
              jab aap taiyaar hon.
            </p>
            <div className="mc-center">
              <Link href="/trade" className="mc-btn mc-btn-gold mc-btn-lg">
                Open Trading Desk <ArrowRight aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        <footer className="mc-foot">
          <div className="mc-foot-grid">
            <div>
              <img className="mc-logo" src="/mukul/logo-MA.webp" alt="Mukul Agrawal" width={150} height={75} />
              <p>Empowering everyday Indians to invest with confidence — through real market experience, not just theory.</p>
            </div>
            <div>
              <h3>Club</h3>
              <Link href="/trade">Trading Desk</Link>
              <Link href="/ai">Mukul AI</Link>
              <Link href="/profile">Profile &amp; P&amp;L</Link>
            </div>
            <div>
              <h3>Follow Mukul</h3>
              {FOLLOW_LINKS.map(([label, href]) => (
                <a key={label} href={href} target="_blank" rel="noreferrer">{label}</a>
              ))}
            </div>
            <div>
              <h3>Contact</h3>
              <p><MapPin aria-hidden /> Finowings Training Academy, C-1, Bank of Baroda, Sector-M, Mama Chauraha, Kursi Road, Lucknow, UP 226022</p>
              <p><Phone aria-hidden /> <a href="tel:+919708094321">+91 97080 94321</a></p>
              <p><a href="https://mukulagrawal.com/" target="_blank" rel="noreferrer">mukulagrawal.com</a></p>
            </div>
          </div>
          <p className="mc-foot-legal">
            Mukul Crypto Club ek learning platform hai. Koi bhi readout guaranteed prediction ya personal financial advice nahi hai.
            Crypto assets high-risk hain — sirf utna lagaiye jitna kho sakte hain. © {new Date().getFullYear()} Mukul Agrawal. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
}
