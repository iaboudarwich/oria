import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the bottom-left "Rendering…" / route badge in dev. Build + runtime
  // errors still surface normally; we just don't want a permanent overlay
  // sitting in the corner.
  devIndicators: false,
  experimental: {
    serverActions: {
      // Headroom above the in-app per-file cap (see lib/data/upload-actions.ts).
      // Uploads larger than this never reach the Server Action; the user gets
      // a 413 from the framework instead of our friendly message, so the
      // application validation should stay strictly below this number.
      bodySizeLimit: "55mb",
    },
    // Client-cache TTLs. With Next 15+ the default for dynamic pages is 0 —
    // i.e. every back-navigation refetches. Bumping to 30s makes the
    // dashboard's back-and-forth navigation feel instant without holding
    // stale data for long. Static stays at the default 5 min.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};

export default nextConfig;
