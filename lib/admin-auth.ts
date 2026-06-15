// Milestone-1 admin gate. This is a convenience lock for a demo, NOT real
// security — Milestone 2 replaces it with Supabase Auth + row-level security.

export const ADMIN_SESSION_KEY = "tesuji.admin.session";
export const ADMIN_SECRET_KEY = "tesuji.admin.secret";

export const ADMIN_PASSPHRASE =
  process.env.NEXT_PUBLIC_ADMIN_PASSPHRASE || "tesuji";

export function isAdminAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
}

export function setAdminAuthed(v: boolean) {
  if (typeof window === "undefined") return;
  if (v) window.sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  else {
    window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
    window.sessionStorage.removeItem(ADMIN_SECRET_KEY);
  }
}

/** Store the passphrase the admin typed; it's sent to admin RPCs for the
 *  server-side guard (Milestone 2). */
export function setAdminSecret(secret: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ADMIN_SECRET_KEY, secret);
}

export function getAdminSecret(): string {
  if (typeof window !== "undefined") {
    const s = window.sessionStorage.getItem(ADMIN_SECRET_KEY);
    if (s) return s;
  }
  return ADMIN_PASSPHRASE;
}
