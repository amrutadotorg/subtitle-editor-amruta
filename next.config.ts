import type { NextConfig } from "next";
import withPWAInit, { runtimeCaching } from "@ducanh2912/next-pwa";

import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: false,
  fallbacks: {
    document: "/offline",
  },
  workboxOptions: {
    exclude: [/middleware-manifest\.json$/],
    runtimeCaching,
    skipWaiting: true,
  },
});

const nextConfig: NextConfig = {
  compress: true,
  reactCompiler: true,
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default withPWA(withNextIntl(nextConfig));
