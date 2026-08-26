"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/Sheet";
import { ADMIN_NAV_GROUPS, AdminNavIcon, isTabActive } from "@/components/admin/adminNav";

/**
 * "All menus" bottom sheet, opened from the mobile AdminDock's เมนู button.
 * Sectioned 3-column tile grids mirroring the sidebar's groups (the dock only
 * surfaces three shortcuts), plus the ดูเว็บไซต์ / ออกจากระบบ actions that used
 * to live in the mobile top bar.
 */
export function AdminMenuSheet({
  open,
  onClose,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();

  // Dismiss whenever navigation lands somewhere new — covers tapping a tile
  // (and is a no-op for the already-closed sheet on first mount).
  useEffect(() => {
    onClose();
    // Only react to route changes; onClose identity is stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="เมนูทั้งหมด"
      footer={
        <div className="flex gap-2">
          <Link
            href="/"
            onClick={onClose}
            className="focus-ring press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl glass text-sm font-semibold text-ink transition-colors hover:bg-white/10"
          >
            <AdminNavIcon d="M14 5h5v5M19 5l-9 9M10 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4" />
            ดูเว็บไซต์
          </Link>
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="focus-ring press inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-rose-300 ring-1 ring-inset ring-rose-400/30 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
          >
            <AdminNavIcon d="M16 17l5-5-5-5M21 12H9M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3" />
            ออกจากระบบ
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {ADMIN_NAV_GROUPS.map((group, gi) => (
          <div key={group.title ?? gi}>
            {group.title && (
              <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                {group.title}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {group.items.map((t) => {
                const active = isTabActive(pathname, t.href, t.exact);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    onClick={onClose}
                    className={cn(
                      "focus-ring press flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-center transition-colors",
                      t.danger
                        ? active
                          ? "bg-rose-500/[0.14] text-rose-200 ring-1 ring-inset ring-rose-400/30"
                          : "bg-rose-500/[0.06] text-rose-300/90 hover:bg-rose-500/10 hover:text-rose-200"
                        : active
                          ? "bg-brand-500/[0.18] text-ink ring-1 ring-inset ring-brand-400/30"
                          : "bg-white/[0.03] text-ink-secondary hover:bg-white/[0.06] hover:text-ink",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center",
                        t.danger ? "text-rose-300/80" : active ? "text-brand-300" : "text-ink-faint",
                      )}
                    >
                      {t.icon}
                    </span>
                    <span className="text-[11px] font-medium leading-tight">{t.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
