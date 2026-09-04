import type { MetadataRoute } from "next";
import { getServerSupabase } from "@/lib/live/serverData";

// Same resolution as app/robots.ts — see the note there.
function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (explicit) return /^https?:\/\//.test(explicit) ? explicit : `https://${explicit}`;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

// serverData's Supabase client deliberately bypasses Next's patched `fetch`, so
// Next cannot see this read: without a revalidate the sitemap would be frozen
// at whatever the tournament table held during `next build`.
export const revalidate = 3600;

/** sitemap.xml — the home list plus every published tournament's public tabs.
 *  Drafts are excluded by RLS already (20260822_0002) and by the status filter;
 *  `closed` events are left out too, since the sitemap advertises what people
 *  can still act on. Participant lists are omitted on purpose (see robots.ts). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
  ];

  let rows: { id: string; updated_at: string }[] = [];
  try {
    const { data, error } = await getServerSupabase()
      .from("tournament")
      .select("id,updated_at")
      .eq("status", "published")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    rows = data ?? [];
  } catch (e) {
    // A missing Supabase env (mock backend) or a transient read failure must not
    // fail the build or 500 /sitemap.xml — ship the home entry alone instead.
    console.error("[sitemap] tournament query failed:", (e as Error).message);
  }

  for (const t of rows) {
    entries.push(
      {
        url: `${base}/t/${t.id}`,
        lastModified: t.updated_at,
        changeFrequency: "daily",
        priority: 0.8,
      },
      {
        url: `${base}/t/${t.id}/rules`,
        lastModified: t.updated_at,
        changeFrequency: "weekly",
        priority: 0.5,
      },
      {
        url: `${base}/t/${t.id}/schedule`,
        lastModified: t.updated_at,
        changeFrequency: "weekly",
        priority: 0.5,
      },
    );
  }

  return entries;
}
