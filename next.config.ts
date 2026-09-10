import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Force dynamic rendering — the entire app depends on client-side Firebase auth
  // which cannot be resolved during static prerendering
  experimental: {
    // Prevents prerendering client components that use browser-only APIs
  },
};

export default nextConfig;
