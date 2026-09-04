import type { MetadataRoute } from "next";

// Absolute origin for the sitemap link. Vercel hands every deployment the
// production domain, so previews point crawlers at prod instead of at
// themselves; NEXT_PUBLIC_SITE_URL overrides it (custom domain / self-hosted).
function siteUrl(): string {
  // Tolerate a bare host in the env var — `new URL()` on it would throw, and
  // metadataBase turns that into a 500 on every tournament page.
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (explicit) return /^https?:\/\//.test(explicit) ? explicit : `https://${explicit}`;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

/** robots.txt — the public tournament pages are the crawlable surface. Anything
 *  behind a sign-in, an admin role or a judge key is excluded, and so are the
 *  participant lists: those are real names (often minors') and belong in a
 *  shared link, not in a search index. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/judge",
        "/api/",
        "/account",
        "/profile",
        "/my-registrations",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/participants",
        "/t/*/participants",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
