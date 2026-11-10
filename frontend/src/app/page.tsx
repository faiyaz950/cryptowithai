import { Suspense } from "react";
import type { Metadata } from "next";
import LandingPage from "@/components/mukul/LandingPage";

export const metadata: Metadata = {
  title: "Cryptomantra — Crypto trading desk by Dr. Mukul Agrawal",
  description:
    "Research, trade and track crypto on your own exchange with 15 desk tools, plus free crypto lessons from Dr. Mukul Agrawal.",
};

/** App home = Cryptomantra landing (YouTube / UTM links yahin aate hain). */
export default function HomePage() {
  return (
    <Suspense fallback={<div className="lp" />}>
      <LandingPage />
    </Suspense>
  );
}
