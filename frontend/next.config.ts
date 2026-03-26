import type { NextConfig } from "next";

interface BackendServer {
  id: string;
  url: string;
  label: string;
}

function getServers(): BackendServer[] {
  const raw = process.env.BACKEND_SERVERS;
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // fall through to single-backend fallback
    }
  }
  // Single-backend fallback
  const url = process.env.BACKEND_URL || "http://78.46.241.125:8001";
  return [{ id: "default", url, label: "Default" }];
}

const nextConfig: NextConfig = {
  async rewrites() {
    const servers = getServers();
    return servers.map((s) => ({
      source: `/api/vps/${s.id}/:path*`,
      destination: `${s.url}/api/:path*`,
    }));
  },
};

export default nextConfig;
