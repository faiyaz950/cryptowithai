"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { claimMembership, recordReferralClick, referralUrl, useClub } from "@/lib/mukul/store";

export default function JoinFlow() {
  const club = useClub();
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [contact, setContact] = useState("");
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState("");

  if (!club) return <div className="mukul-club" />;

  const link = referralUrl(club);

  const openExchange = () => {
    recordReferralClick();
    setOpened(true);
    window.open(link, "_blank", "noopener,noreferrer");
  };

  const onVerify = (event: FormEvent) => {
    event.preventDefault();
    if (userId.trim().length < 3) {
      setError("Exchange User ID likhein.");
      return;
    }
    if (contact.trim().length < 5) {
      setError("Registered mobile ya email likhein.");
      return;
    }
    claimMembership(userId, contact);
    router.push("/club");
  };

  return (
    <div className="mukul-club">
      <div className="mukul-scroll">
        <header className="mc-top">
          <Link href="/" className="mc-brand">
            <img className="mc-mark" src="/mukul/icon.png" alt="" width={36} height={36} />
            <strong>Cryptomantra</strong>
          </Link>
          <Link href="/trade">Trading Desk</Link>
        </header>

        <main className="mc-join">
          <p className="mc-kicker">Cryptomantra · Free access</p>
          <h1>Create your trading account</h1>
          <p className="mc-lede">
            Club link se exchange account kholiye — yahi aapki entry key hai. Account ban jaane ke baad wapas
            aakar User ID verify kijiye, aur saare club tools free unlock ho jayenge.
          </p>

          <ol className="mc-steps">
            <li data-done="true">Landing</li>
            <li data-done={opened ? "true" : "false"}>Exchange</li>
            <li>User ID</li>
            <li>Club</li>
          </ol>

          <button type="button" className="mc-btn mc-btn-primary mc-btn-lg" onClick={openExchange}>
            Create your trading account
          </button>
          <p className="mc-fine">
            Exchange naye tab mein khulega. Signup aur KYC wahin poora kijiye, phir is page par wapas aaiye.
          </p>
          {opened && (
            <p className="mc-fine">
              Link nahi khula? <a href={link} target="_blank" rel="noreferrer">Exchange kholen</a>
            </p>
          )}

          <form className="mc-form" onSubmit={onVerify}>
            <h2>Wapas aakar verify karein</h2>
            <label>
              Exchange User ID
              <input value={userId} onChange={(e) => setUserId(e.target.value)} autoComplete="off" />
            </label>
            <label>
              Registered mobile ya email
              <input value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="email" />
            </label>
            {error && <p className="mc-error" role="alert">{error}</p>}
            <button type="submit" className="mc-btn mc-btn-gold mc-btn-lg">Verify and enter club</button>
            <p className="mc-fine">
              Aapka User ID club ke referral record se match kiya jaata hai. Tab tak status “claim recorded” rehta hai.
            </p>
          </form>

          {club.membership && (
            <p className="mc-fine">
              Claim pehle se saved hai. <Link href="/club">Club kholen</Link>
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
