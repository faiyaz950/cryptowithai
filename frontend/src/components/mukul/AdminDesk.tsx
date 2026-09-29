"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { funnelCounts, OFFER_LABEL, type FunnelEvent, type OfferId, useClub } from "@/lib/mukul/store";

const CONTENTS = [
  ["video_a", "Video A"],
  ["video_b", "Video B"],
  ["short_a", "Short A"],
  ["live_a", "Live A"],
] as const;

const OFFERS: OfferId[] = ["a", "b", "c"];

function linkFor(content: string, offer: OfferId): string {
  const url = new URL("http://localhost");
  url.pathname = "/";
  url.searchParams.set("utm_source", "youtube");
  url.searchParams.set("utm_medium", content.startsWith("short") ? "short" : content.startsWith("live") ? "live" : "video");
  url.searchParams.set("utm_content", content);
  url.searchParams.set("offer", offer);
  return `${url.pathname}${url.search}`;
}

export default function AdminDesk() {
  const club = useClub();
  const [serverEvents, setServerEvents] = useState<FunnelEvent[]>([]);

  useEffect(() => {
    fetch("/api/mukul/events")
      .then((res) => res.json())
      .then((data: { events?: FunnelEvent[] }) => setServerEvents(data.events ?? []))
      .catch(() => setServerEvents([]));
  }, []);

  if (!club) return <div className="mukul-club" />;

  const merged = new Map<string, FunnelEvent>();
  for (const event of [...serverEvents, ...club.events]) merged.set(event.id, event);
  const events = [...merged.values()];
  const totals = funnelCounts(events);

  const copy = async (href: string) => {
    const absolute = `${window.location.origin}${href}`;
    try {
      await navigator.clipboard.writeText(absolute);
    } catch {
      window.prompt("Link copy karein", absolute);
    }
  };

  return (
    <div className="mukul-club">
      <div className="mukul-scroll">
        <header className="mc-top">
          <Link href="/club" className="mc-brand">
            <img className="mc-mark" src="/mukul/icon.png" alt="" width={36} height={36} />
            <strong>Admin</strong>
          </Link>
          <Link href="/trade">Trading Desk</Link>
        </header>
        <main className="mc-admin">
          <h1>Business dashboard</h1>
          <p className="mc-fine">
            Numbers isi club ke tracked events hain — browser aur local server log. Example 50,000 visitors yahan nahi dikhaye,
            kyunki wo real count nahi hain. Revenue tab aayega jab exchange fee report connect ho.
          </p>
          <section>
            <h2>Acquisition</h2>
            <dl className="mc-metrics">
              <div><dt>YouTube visitors</dt><dd>{totals.landing}</dd></div>
              <div><dt>Referral clicks</dt><dd>{totals.clicks}</dd></div>
              <div><dt>Accounts</dt><dd>{totals.accounts}</dd></div>
              <div><dt>KYC claims</dt><dd>{totals.kyc}</dd></div>
            </dl>
          </section>
          <section>
            <h2>Activation</h2>
            <dl className="mc-metrics">
              <div><dt>Deposits</dt><dd>{totals.deposits}</dd></div>
              <div><dt>First trade</dt><dd>{totals.firstTrade}</dd></div>
            </dl>
          </section>
          <section>
            <h2>Retention</h2>
            <dl className="mc-metrics">
              <div><dt>7D active</dt><dd>{totals.active7}</dd></div>
              <div><dt>30D active</dt><dd>{totals.active30}</dd></div>
            </dl>
          </section>
          <section>
            <h2>Revenue</h2>
            <dl className="mc-metrics">
              <div><dt>Trading volume</dt><dd>Not connected</dd></div>
              <div><dt>Trading fees</dt><dd>Not connected</dd></div>
              <div><dt>Referral revenue</dt><dd>Not connected</dd></div>
              <div><dt>Revenue/user</dt><dd>Not connected</dd></div>
              <div><dt>30-day revenue/user</dt><dd>Not connected</dd></div>
            </dl>
          </section>
          <section>
            <h2>Offer test</h2>
            <table className="mc-table">
              <thead>
                <tr>
                  <th>Offer</th>
                  <th>Click</th>
                  <th>Account</th>
                  <th>KYC</th>
                  <th>Deposit</th>
                  <th>First trade</th>
                  <th>30D active</th>
                </tr>
              </thead>
              <tbody>
                {OFFERS.map((offer) => {
                  const rows = events.filter((event) => event.offer === offer);
                  const now = Date.now();
                  const cell = (type: FunnelEvent["type"]) => rows.filter((event) => event.type === type).length;
                  return (
                    <tr key={offer}>
                      <th>{OFFER_LABEL[offer]}</th>
                      <td>{cell("referral_click")}</td>
                      <td>{cell("account_claim")}</td>
                      <td>{cell("kyc")}</td>
                      <td>{cell("deposit")}</td>
                      <td>{cell("first_trade")}</td>
                      <td>{rows.filter((event) => event.type === "active" && now - new Date(event.at).getTime() <= 30 * 86400000).length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          <section>
            <h2>Video links</h2>
            <ul className="mc-list">
              {CONTENTS.flatMap(([content, label]) => OFFERS.map((offer) => {
                const href = linkFor(content, offer);
                return (
                  <li key={`${content}-${offer}`}>
                    <span>{label} · {OFFER_LABEL[offer]}</span>
                    <button type="button" onClick={() => copy(href)}>Copy link</button>
                  </li>
                );
              }))}
            </ul>
            <p className="mc-fine">
              Content split: {CONTENTS.map(([id]) => {
                const n = events.filter((event) => event.type === "account_claim" && event.content === id).length;
                return `${id} ${n}`;
              }).join(" · ")}
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
