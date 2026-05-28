import type { NextConfig } from "next";

// Allow the Next.js Image Optimizer to fetch upload thumbnails from our
// Supabase storage bucket. The host is derived from the public Supabase URL
// so this stays correct across projects/environments without a second env
// var. `search` is intentionally omitted: storage objects are served behind
// expiring SIGNED URLs (…?token=…), and pinning search to "" would reject
// every one of them.
const supabaseImageHost = (() => {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
    return host || null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseImageHost
      ? [
          {
            protocol: "https",
            hostname: supabaseImageHost,
            pathname: "/storage/v1/object/**",
          },
        ]
      : [],
  },
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
