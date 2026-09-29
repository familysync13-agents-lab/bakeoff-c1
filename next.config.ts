import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
};

export default withSentryConfig(nextConfig, {
  // No source-map upload or release creation (no Sentry account in the bake-off); the SDK is configured at runtime.
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
});
