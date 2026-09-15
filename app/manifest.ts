import type { MetadataRoute } from "next";

/** Web App Manifest — enables "Add to Home Screen" / installable PWA.
 *  Next serves this at /manifest.webmanifest and auto-links it in <head>.
 *
 *  Deliberately NOT locale-aware: on Next 14 metadata routes are statically
 *  optimized at build time, and browsers fetch the manifest without cookies
 *  (credentials mode "omit") so the `locale` cookie could never vary it
 *  anyway. Thai-primary text with an English tail is the pragmatic middle. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tesuji — ระบบรับสมัครแข่งขันหมากล้อม",
    short_name: "Tesuji",
    description:
      "ระบบรับสมัครการแข่งขันกีฬาหมากล้อม — Go tournament registration & PromptPay payment",
    lang: "th",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // No `orientation`. It was "portrait", and this manifest is also linked by
    // the results board and the judge console — which run on a venue tablet or
    // a TV stick in landscape, and were locked out of it once installed.
    // Letting the device decide costs the main app nothing.
    background_color: "#060912",
    theme_color: "#060912",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
