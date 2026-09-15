import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { dictionaries, type Dictionary } from "./dictionaries";

/** The server-side twin of useI18n, for `generateMetadata`. The cookie is the
 *  source of truth (same read as the root layout), so a page's <title> is in
 *  the language the user picked.
 *
 *  Deliberately NOT re-exported from ./index: that module is imported by client
 *  components, and pulling next/headers in there breaks the client build. */
export async function serverLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
}

export async function serverDictionary(): Promise<Dictionary> {
  return dictionaries[await serverLocale()];
}
