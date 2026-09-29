import type { Metadata } from "next";
import JoinFlow from "@/components/mukul/JoinFlow";

export const metadata: Metadata = {
  title: "Create your trading account — Mukul Crypto Club",
  description: "Open the exchange account from the club link, then verify with your exchange user ID.",
};

export default function JoinPage() {
  return <JoinFlow />;
}
