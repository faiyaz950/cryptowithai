import { Suspense } from "react";
import type { Metadata } from "next";
import ClubApp from "@/components/mukul/ClubApp";

export const metadata: Metadata = {
  title: "Mukul Crypto Club — Free Access",
  description: "Market radar, algo, alerts, paper trading, journal, and the live room.",
};

export default function ClubPage() {
  return (
    <Suspense fallback={<div className="mukul-club" />}>
      <ClubApp />
    </Suspense>
  );
}
