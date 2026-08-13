import type { NextConfig } from "next";
import path from "path";

/** Evita `new URL('')` de next-auth si NEXTAUTH_URL está vacío en Vercel. */
const nextAuthUrl =
  process.env.NEXTAUTH_URL && process.env.NEXTAUTH_URL.trim().length > 0
    ? process.env.NEXTAUTH_URL.trim()
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  env: {
    NEXTAUTH_URL: nextAuthUrl,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    staleTimes: {
      dynamic: 120,
      static: 300,
    },
  },
};

export default nextConfig;
