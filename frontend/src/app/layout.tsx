import type { Metadata } from "next";
import { Inter, Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import ThemeToggle from "@/components/ThemeToggle";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";
import "./mukul-club.css";
import "./theme.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cryptomantra — Dr. Mukul Agrawal",
  description:
    "Dr. Mukul Agrawal ka crypto club — free trading tools, Mukul Algo, market radar, paper trading, AI assistant aur live learning, ek hi jagah.",
  icons: {
    icon: "/mukul/icon.png",
    apple: "/mukul/icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${playfair.variable} ${jakarta.variable} h-full`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="h-full antialiased">
        <AuthProvider>{children}</AuthProvider>
        <ThemeToggle />
      </body>
    </html>
  );
}
