// Central locale configuration. Add a new locale here + a dictionary in
// ./dictionaries and the switcher + provider pick it up automatically.

export const LOCALES = ["th", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "th";

// Cookie is the source of truth: read on the server (root layout) so the
// <html lang> and first paint match the user's choice — no hydration flash.
export const LOCALE_COOKIE = "locale";

/** Human labels shown in the language dropdown. */
export const LOCALE_LABELS: Record<Locale, string> = {
  th: "ไทย",
  en: "English",
};

/** Short badge shown on the trigger button. */
export const LOCALE_SHORT: Record<Locale, string> = {
  th: "TH",
  en: "EN",
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}
