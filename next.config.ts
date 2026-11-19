import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Floor-plan images and issue photos are posted through server actions.
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};

export default nextConfig;
