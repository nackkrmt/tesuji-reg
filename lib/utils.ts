import clsx, { ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** Read a nested value by dot path (e.g. "people.0.firstNameTh"). */
export function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Format a number as Thai Baht, e.g. 1500 → "1,500". */
export function formatThb(amount: number): string {
  return amount.toLocaleString("th-TH");
}

/** Sanitize a post-auth `?next=` redirect target: only same-origin relative paths
 *  are allowed (must start with a single "/", never "//" or "/\"), so a crafted
 *  link can't bounce the user to an external phishing site after login. */
export function safeInternalPath(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  if (next[0] !== "/" || next[1] === "/" || next[1] === "\\") return fallback;
  return next;
}

interface NameParts {
  titlePrefix: string;
  titleCustom?: string | null;
  firstNameTh: string;
  lastNameTh: string;
  firstNameEn: string;
  lastNameEn: string;
  hasMiddleName: boolean;
  middleNameTh?: string | null;
  middleNameEn?: string | null;
}

export function fullNameTh(p: NameParts): string {
  const title = p.titlePrefix === "อื่นๆ" ? p.titleCustom ?? "" : p.titlePrefix;
  const middle = p.hasMiddleName && p.middleNameTh ? ` ${p.middleNameTh}` : "";
  return `${title}${p.firstNameTh}${middle} ${p.lastNameTh}`.trim();
}

export function fullNameEn(p: NameParts): string {
  const middle = p.hasMiddleName && p.middleNameEn ? ` ${p.middleNameEn}` : "";
  return `${p.firstNameEn}${middle} ${p.lastNameEn}`.trim();
}

/** Format an ISO datetime to a date+time string. Thai (Buddhist era) by default;
 *  English (Gregorian) when locale === "en". */
export function formatThaiDateTime(iso: string, locale: "th" | "en" = "th"): string {
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Format an ISO date (yyyy-mm-dd) to a date string. Thai (Buddhist era) by
 *  default; English (Gregorian) when locale === "en". */
export function formatThaiDate(iso: string, locale: "th" | "en" = "th"): string {
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "th-TH", {
      dateStyle: "long",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Convert a datetime-local input value (no tz) to an ISO string. */
export function localInputToIso(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

/** Convert an ISO string to a datetime-local input value (local tz). */
export function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}
