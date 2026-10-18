/**
 * Who may use the admin shell, and which of its pages.
 *
 * The real gate is SQL: every RPC behind an allowed page checks `_is_staff`
 * (admin, or SubAdmin of the tournament the call touches), and the rest keep
 * `_is_admin`. This module only decides what the shell SHOWS — the nav filter
 * and the route guard both read the one list below — so a mistake here hides
 * or reveals a menu entry, never data.
 */

export type AdminRole = "admin" | "subadmin";

export interface AdminAccess {
  /** null = no back-office access; the gate sends the visitor to /admin/login. */
  role: AdminRole | null;
  /** Tournaments a SubAdmin is assigned to. Empty for admins — they see all. */
  tournamentIds: string[];
}

export const NO_ACCESS: AdminAccess = { role: null, tournamentIds: [] };

/** Pages a SubAdmin never reaches: system-wide data, destructive tools, the
 *  back-office rosters, and creating tournaments (nothing to be assigned to). */
export const ADMIN_ONLY_PREFIXES = [
  "/admin/database",
  "/admin/self-ranks",
  "/admin/awards",
  "/admin/people",
  "/admin/institutes",
  "/admin/reset",
  "/admin/subadmins",
  "/admin/tournaments/new",
] as const;

const EDIT_TOURNAMENT = /^\/admin\/tournaments\/([^/]+)\/?$/;

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((p) => underPrefix(pathname, p));
}

/** Whether `access` may open `pathname`. Admins open everything. A SubAdmin is
 *  kept off the admin-only pages and off the edit form of a tournament they
 *  are not assigned to: getTournament reads under RLS, so the form would load
 *  any published event and only fail on save. */
export function canAccessPath(access: AdminAccess, pathname: string): boolean {
  if (access.role === "admin") return true;
  if (access.role !== "subadmin") return false;
  if (isAdminOnlyPath(pathname)) return false;
  const m = EDIT_TOURNAMENT.exec(pathname);
  if (m) return access.tournamentIds.includes(decodeURIComponent(m[1]));
  return true;
}

/** The nav groups with the items `access` cannot open removed, and the groups
 *  that end up empty dropped — "ข้อมูล" must not render as a bare heading. */
export function filterNavGroups<T extends { href: string }>(
  groups: ReadonlyArray<{ title: string | null; items: T[] }>,
  access: AdminAccess,
): { title: string | null; items: T[] }[] {
  if (access.role === "admin") return groups.slice();
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => canAccessPath(access, i.href)) }))
    .filter((g) => g.items.length > 0);
}

/** Tolerant parse of the jsonb `my_admin_access()` returns. Anything odd is
 *  NO_ACCESS: the RPC is the source of truth, and the shell must never widen
 *  what it said. */
export function parseAdminAccess(raw: unknown): AdminAccess {
  if (!raw || typeof raw !== "object") return NO_ACCESS;
  const o = raw as Record<string, unknown>;
  const role: AdminRole | null =
    o.role === "admin" || o.role === "subadmin" ? o.role : null;
  if (!role) return NO_ACCESS;
  const ids = Array.isArray(o.tournamentIds)
    ? o.tournamentIds.filter((x): x is string => typeof x === "string")
    : [];
  if (role === "subadmin" && ids.length === 0) return NO_ACCESS;
  return { role, tournamentIds: role === "admin" ? [] : ids };
}
