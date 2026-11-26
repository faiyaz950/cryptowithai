import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — Cryptomantra",
  description:
    "Sign in to Cryptomantra by Dr. Mukul Agrawal: live exchange charts, your own exchange connection and an AI trading assistant.",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
