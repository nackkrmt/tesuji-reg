import type { Metadata } from "next";
import TournamentListClient from "@/components/home/TournamentListClient";
import { serverDictionary, serverLocale } from "@/lib/i18n/server";

/** The home URL is the one people paste into LINE, so it carries its own title,
 *  description and OG block instead of inheriting the root layout's. */
export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([serverDictionary(), serverLocale()]);
  return {
    title: t.meta.homeTitle,
    description: t.meta.homeDescription,
    openGraph: {
      type: "website",
      siteName: "Tesuji",
      locale: locale === "en" ? "en_US" : "th_TH",
      title: t.meta.homeTitle,
      description: t.meta.homeDescription,
    },
  };
}

export default function Page() {
  return <TournamentListClient />;
}
