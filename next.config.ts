import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` uses Node built-ins; keep it out of the bundler and require it at runtime.
  serverExternalPackages: ["pg"],
  /* config options here */
};

export default nextConfig;
