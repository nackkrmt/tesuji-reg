"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_TABS, AdminNavIcon, isTabActive } from "@/components/admin/adminNav";
import { AdminMenuSheet } from "@/components/admin/AdminMenuSheet";

/**
 * Mobile-only bottom dock — the primary admin nav once the horizontal tab strip
 * is gone (mirrors the public GlassDock idiom). Surfaces the three most-used
 * sections directly; everything else lives one tap away behind เมนู.
 *
 * Renders as a direct child of the shell's root (no glass ancestor), so `fixed`
 * is relative to the viewport. z-40 sits below DropdownPanel/Sheet (z-60) and
 * Toast (z-100), so overlays always cover it.
 */

// The three shortcuts pinned to the dock, in importance order.
const DOCK_HREFS = ["/admin", "/admin/registrations", "/admin/live"] as const;

export function AdminDock({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = DOCK_HREFS.map(
    (href) => ADMIN_TABS.find((t) => t.href === href)!,
  );

  // "เมนู" reads active while its sheet is open, or when the current page isn't
  // one of the three shortcuts (iOS "More" tab behaviour).
  const onDockPage = items.some((t) => isTabActive(pathname, t.href, t.exact));
  const menuActive = menuOpen || !onDockPage;

  return (
    <>
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="glass pointer-events-auto flex items-end gap-0.5 rounded-[26px] p-1.5">
          {items.map((t) => {
            const active = isTabActive(pathname, t.href, t.exact);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-label={t.label}
                className={cn(
                  "flex w-16 flex-col items-center gap-1 rounded-2xl px-1 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-400/60",
                  active ? "text-white" : "text-white/50 hover:text-white/80",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 items-center justify-center transition-transform",
                    active && "scale-105 text-brand-300",
                  )}
                >
                  {t.icon}
                </span>
                <span className="text-[10px] font-medium">{t.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="เมนูทั้งหมด"
            aria-expanded={menuOpen}
            className={cn(
              "flex w-16 flex-col items-center gap-1 rounded-2xl px-1 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-400/60",
              menuActive ? "text-white" : "text-white/50 hover:text-white/80",
            )}
          >
            <span
              className={cn(
                "flex h-7 items-center justify-center transition-transform",
                menuActive && "scale-105 text-brand-300",
              )}
            >
              <AdminNavIcon d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
            </span>
            <span className="text-[10px] font-medium">เมนู</span>
          </button>
        </div>
      </nav>

      <AdminMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onLogout={onLogout}
      />
    </>
  );
}
