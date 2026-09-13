import { Inter, JetBrains_Mono } from "next/font/google";

const tradeSans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-trade",
  display: "swap",
});

const tradeMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-trade-mono",
  display: "swap",
});

/** Crypto terminal — Inter + JetBrains Mono (Finowings Desk). */
export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${tradeSans.variable} ${tradeMono.variable} h-full`}>
      {children}
    </div>
  );
}
