import { ReactNode } from "react";

/**
 * Single source of truth for the admin navigation set.
 *
 * Extracted from AdminShell so the desktop sidebar, the mobile bottom dock
 * (AdminDock) and the "all menus" sheet (AdminMenuSheet) can share the exact
 * same list without importing AdminShell — which would create a circular
 * import (AdminShell → AdminDock → AdminMenuSheet → tabs).
 */

export type AdminTab = {
  href: string;
  label: string;
  exact?: boolean;
  icon: ReactNode;
};

/** Stroke icon used across the admin nav. Kept identical to the old inline `I`. */
export function AdminNavIcon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export const ADMIN_TABS: AdminTab[] = [
  { href: "/admin", label: "ภาพรวม", exact: true, icon: <AdminNavIcon d="M4 13h7V4H4v9zM13 20h7V10h-7v10zM4 20h7v-4H4v4zM13 4v3h7V4h-7z" /> },
  { href: "/admin/tournament", label: "ทัวร์นาเมนต์", icon: <AdminNavIcon d="M8 4h8v3a4 4 0 11-8 0V4zM6 5H4v1a3 3 0 003 3M18 5h2v1a3 3 0 01-3 3M9 14h6M12 11v3M9 20h6M10 17h4v3h-4z" /> },
  { href: "/admin/rules", label: "กฎ กติกา", icon: <AdminNavIcon d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2zM9 7h7M9 11h7" /> },
  { href: "/admin/categories", label: "รุ่น", icon: <AdminNavIcon d="M12 3l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4" /> },
  { href: "/admin/registrations", label: "ใบสมัคร", icon: <AdminNavIcon d="M9 4h6a1 1 0 011 1v1h1a1 1 0 011 1v12a1 1 0 01-1 1H6a1 1 0 01-1-1V7a1 1 0 011-1h1V5a1 1 0 011-1zM8 6h8M9 11h6M9 15h4" /> },
  { href: "/admin/withdrawals", label: "ถอนตัว", icon: <AdminNavIcon d="M16 17l5-5-5-5M21 12H9M12 3H6a2 2 0 00-2 2v14a2 2 0 002 2h6" /> },
  { href: "/admin/division-changes", label: "เปลี่ยนรุ่น", icon: <AdminNavIcon d="M7 20V8M7 8L3 12M7 8l4 4M17 4v12m0 0l4-4m-4 4l-4-4" /> },
  { href: "/admin/live", label: "ผลแข่งสด", icon: <AdminNavIcon d="M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z" /> },
  { href: "/admin/judges", label: "กรรมการ", icon: <AdminNavIcon d="M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 10.5a3 3 0 100-6 3 3 0 000 6zM15 10l2 2 4-4" /> },
  { href: "/admin/database", label: "ฐานข้อมูล", icon: <AdminNavIcon d="M12 5c4 0 7 1 7 2.5S16 10 12 10 5 9 5 7.5 8 5 12 5zM5 7.5v9C5 18 8 19 12 19s7-1 7-2.5v-9M5 12c0 1.5 3 2.5 7 2.5s7-1 7-2.5" /> },
  { href: "/admin/people", label: "ประวัตินักกีฬา", icon: <AdminNavIcon d="M10 11a4 4 0 100-8 4 4 0 000 8zM3 21v-1a6 6 0 016-6h3M16.5 20a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 22l-2-2" /> },
  { href: "/admin/institutes", label: "สถาบัน", icon: <AdminNavIcon d="M4 21h16M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 12h.01M15 12h.01M12 12h.01" /> },
  { href: "/admin/codes", label: "โค้ดส่วนลด", icon: <AdminNavIcon d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L2 12V2h10l8.6 8.6a2 2 0 010 2.8zM7.5 7.5h.01" /> },
  { href: "/admin/reset", label: "รีเซ็ต", icon: <AdminNavIcon d="M10.3 3.9l-8 14A2 2 0 004 21h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0zM12 9v4M12 17h.01" /> },
];

/** Active when the path is exactly `href` (exact tabs) or under it (sections). */
export function isTabActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname.startsWith(href);
}
