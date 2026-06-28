import type { MetadataRoute } from "next";

/** Web App Manifest — enables "Add to Home Screen" / installable PWA.
 *  Next serves this at /manifest.webmanifest and auto-links it in <head>. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TesujiReg — ระบบรับสมัครแข่งขันหมากล้อม",
    short_name: "TesujiReg",
    description:
      "ระบบรับสมัครการแข่งขันกีฬาหมากล้อม — สมัครและชำระเงินผ่าน PromptPay",
    lang: "th",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
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
