import type { NextConfig } from "next";

// Firebase redirect best-practices (Option 3) for browsers that partition
// third-party storage (Helium, Safari, Firefox, Chrome 115+): proxy the
// Firebase sign-in helper same-origin so signInWithRedirect no longer touches
// cross-origin storage. Inactive until NEXT_PUBLIC_FIREBASE_SELF_HOST_AUTH_HELPER=true
// switches authDomain to the app host (see firebase-client.ts + README).
// Next rewrites proxy transparently (no 302), which is what Firebase requires.
const authHelperBackend = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

const nextConfig: NextConfig = {
  // Firebase client SDK touches browser globals; keep default bundling.
  async rewrites() {
    if (!authHelperBackend) return [];
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${authHelperBackend}/__/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
