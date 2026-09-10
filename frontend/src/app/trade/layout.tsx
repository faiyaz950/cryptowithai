import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

const tradeSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-trade",
  display: "swap",
});

const tradeMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-trade-mono",
  display: "swap",
});

/** Crypto terminal — denser trader chrome; fonts sirf /trade ke andar. */
export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${tradeSans.variable} ${tradeMono.variable} h-full`}>
      {children}
    </div>
  );
}
