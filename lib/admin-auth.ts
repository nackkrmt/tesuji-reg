// Admin session helpers. Admin identity now lives in the Supabase Auth session
// (account_roles.role = 'admin'); every admin RPC and edge function is gated
// server-side by that role. The sessionStorage flag below is only a UI hint for
// the /admin shell — it authorizes nothing on its own.

export const ADMIN_SESSION_KEY = "tesuji.admin.session";

export function isAdminAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
}

export function setAdminAuthed(v: boolean) {
  if (typeof window === "undefined") return;
  if (v) window.sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  else window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

/** Legacy `p_admin_secret` argument still accepted (but ignored) by the admin
 *  RPCs. Authorization is the caller's admin role now, so this is always empty —
 *  kept only so the many existing call sites don't each need editing. */
export function getAdminSecret(): string {
  return "";
}
