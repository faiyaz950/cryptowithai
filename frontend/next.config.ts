import path from "path";
import type { NextConfig } from "next";

// Ab ek hi backend service hai — AI chat aur trading dono usi par.
// CRYPTO_API_URL purane setups ke liye fallback ke taur par padha jaata hai.
const BACKEND = process.env.BACKEND_URL || process.env.CRYPTO_API_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/crypto-api/:path*",
        destination: `${BACKEND}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
