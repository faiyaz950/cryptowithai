import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Finowings AI — Stocks, Crypto & Mutual Funds Expert",
  description: "India ka #1 Financial AI. Stocks (NSE/BSE), Cryptocurrency, aur Mutual Funds expert. Powered by Finowings.",
  icons: {
    icon: "/finoailogo.png",
    apple: "/finoailogo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="h-full antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
