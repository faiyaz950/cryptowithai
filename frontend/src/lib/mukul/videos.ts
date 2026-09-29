/** Mukul Agrawal ke crypto videos. The API route puts newer crypto uploads from the channel in front of these. */
export interface MukulVideo {
  id: string;
  title: string;
  duration: string;
}

export const MUKUL_CHANNEL_ID = "UCPs8w9f1gqe4BqkbI-9wTnw";
export const MUKUL_CHANNEL_URL = "https://www.youtube.com/@mukulagrawal";
export const MUKUL_VIDEOS_URL = "https://www.youtube.com/@mukulagrawal/search?query=crypto";

/** Title filter for "sirf crypto" — shorts are dropped by duration in the API route. */
export const CRYPTO_TITLE = /crypto|bitcoin|\bbtc\b|ethereum|\beth\b|solana|altcoin|usdt|blockchain|coindcx|delta exchange|airdrop/i;

export const FALLBACK_VIDEOS: MukulVideo[] = [
  { id: "v4y7EtQnjAc", duration: "10:04", title: "Crypto Par Double Maar! Clarity Act Fail + Aaj Raat Fed Ka Faisla" },
  { id: "WkFa72lf9Oc", duration: "10:08", title: "Bitcoin Price Prediction: Why Is BTC Rising After Fed Rate Hike & Crypto Law Failure?" },
  { id: "rpbjRftBM3c", duration: "17:56", title: "Crypto Crash? 15-18 September Bitcoin Price Prediction | Fed, Japan BoJ Rate Hike & US Crypto Bill" },
  { id: "vpSChLZFkGE", duration: "23:34", title: "AI Se Crypto Trading Kaise Kare? | AI Crypto Trading Strategy" },
  { id: "EY3mP7fTf_s", duration: "14:50", title: "Crypto Tax New Rule 2026 | Crypto Tax Kitni Paise Par Lagta Hai | Income Tax Notice Se Kaise Bache?" },
  { id: "YljndPfRqnk", duration: "11:22", title: "MicroStrategy ka $1.25 Billion Bitcoin Plan | Why Bitcoin Is Actually Crashing? | Full Explained" },
  { id: "57XH6EX5HyE", duration: "54:05", title: "Crypto Futures Trading Full Course | Crypto Futures Trading Kaise Kare? | Step-by-Step Guide" },
  { id: "XIlGVsPpIRw", duration: "12:21", title: "Crypto 5-Star Intraday Strategy | Trading Setup" },
  { id: "0Ni_KYcvFNo", duration: "13:14", title: "Top 4 Crypto | Best Crypto Investment For Beginners | Bitcoin, Ethereum, Solana, XRP" },
  { id: "ok1VtsVKlR8", duration: "8:07", title: "Crypto Trading Strategy | Crypto Trading For Beginners | Crypto Live Trading Strategies" },
  { id: "5QEil5jyiiw", duration: "7:35", title: "Kaun Banega Next Bitcoin? Bitcoin vs Ethereum vs Solana" },
  { id: "Sx5kpZ6WWSQ", duration: "7:34", title: "10,000 Ka Best Crypto Portfolio | Crypto Portfolio Kaise Banaye?" },
];

export function videoThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

export function videoUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
