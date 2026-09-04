import type { Metadata } from "next";
import { TournamentProvider } from "@/components/tournament/TournamentProvider";
import { getServerSupabase } from "@/lib/live/serverData";
import { formatThaiDate } from "@/lib/utils";

// Same resolution as app/robots.ts — see the note there. Needed as metadataBase
// so the relative og:image/og:url below resolve to absolute URLs; scrapers
// reject relative ones.
function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (explicit) return /^https?:\/\//.test(explicit) ? explicit : `https://${explicit}`;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

/** Just enough of the row to build a link card, read with the anon server
 *  client. RLS already hides drafts from anon (20260822_0002); the status
 *  filter keeps that true if the policy ever loosens — an unpublished
 *  tournament's name must never surface in a LINE preview. */
async function getShareableTournament(tid: string) {
  try {
    const { data } = await getServerSupabase()
      .from("tournament")
      .select("name_th,competition_date,location_text,banner_url")
      .eq("id", tid)
      .neq("status", "draft")
      .maybeSingle();
    return data;
  } catch {
    // Missing Supabase env (mock backend). Metadata is decoration — fall back to
    // the app-wide defaults rather than throwing the whole subtree.
    return null;
  }
}

/** LINE is how these events actually circulate, so a pasted /t/<id> link has to
 *  render as the tournament's own card. Applies to the whole subtree: register
 *  and rules links get shared just as often as the overview.
 *
 *  Deliberately not locale-aware (unlike the root layout): scrapers never send
 *  the locale cookie, and the name and venue are Thai free text regardless. */
export async function generateMetadata({
  params,
}: {
  params: { tid: string };
}): Promise<Metadata> {
  const metadataBase = new URL(siteUrl());
  const t = await getShareableTournament(params.tid);
  if (!t) return { metadataBase };

  const description =
    [
      t.competition_date ? formatThaiDate(t.competition_date) : "",
      t.location_text,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  // Rows saved through the admin form carry a Supabase storage URL, but a
  // pasted/legacy value can be an inline data: URL — useless to a scraper, so
  // fall back to the app icon (a square card beats no card at all).
  const bannerUrl = t.banner_url ?? "";
  const banner = /^https?:\/\//.test(bannerUrl) ? bannerUrl : null;
  const images = banner
    ? [{ url: banner, alt: t.name_th }]
    : [{ url: "/icon-512.png", width: 512, height: 512, alt: "Tesuji" }];
  const shared = { title: t.name_th, description, images };

  return {
    metadataBase,
    title: t.name_th,
    description,
    openGraph: {
      type: "website",
      siteName: "Tesuji",
      locale: "th_TH",
      url: `/t/${params.tid}`,
      ...shared,
    },
    // Branch on whole objects: `card` discriminates Next's Twitter metadata
    // union, so a ternary on the card value alone would not narrow.
    twitter: banner
      ? { card: "summary_large_image", ...shared }
      : { card: "summary", ...shared },
  };
}

export default function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { tid: string };
}) {
  return <TournamentProvider tid={params.tid}>{children}</TournamentProvider>;
}
