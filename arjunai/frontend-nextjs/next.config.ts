import path from "path";
import type { NextConfig } from "next";

const CRYPTO_API = process.env.CRYPTO_API_URL || "http://127.0.0.1:2000";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/crypto-api/:path*",
        destination: `${CRYPTO_API}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
