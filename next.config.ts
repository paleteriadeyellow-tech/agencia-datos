import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    staleTimes: {
      dynamic: 300,
      static: 600,
    },
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Authorization, Content-Type, X-View-As, X-Skip-View-As",
          },
        ],
      },
      {
        // Caché privada en navegador/Electron: carga rápida al volver a la pestaña
        source: "/api/panel/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=60, stale-while-revalidate=600",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
