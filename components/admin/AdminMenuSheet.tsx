"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/ui/Sheet";
import { ADMIN_TABS, AdminNavIcon, isTabActive } from "@/components/admin/adminNav";

/**
 * "All menus" bottom sheet, opened from the mobile AdminDock's เมนู button.
 * A 3-column grid of every admin section (the dock only surfaces three), plus
 * the ดูเว็บไซต์ / ออกจากระบบ actions that used to live in the mobile top bar.
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
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl glass text-sm font-semibold text-white outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-brand-400/60"
          >
            <AdminNavIcon d="M14 5h5v5M19 5l-9 9M10 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4" />
            ดูเว็บไซต์
          </Link>
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-rose-300 outline-none ring-1 ring-inset ring-rose-400/30 transition-colors hover:bg-rose-500/10 hover:text-rose-200 focus-visible:ring-2 focus-visible:ring-rose-400/60"
          >
            <AdminNavIcon d="M16 17l5-5-5-5M21 12H9M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3" />
            ออกจากระบบ
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        {ADMIN_TABS.map((t) => {
          const active = isTabActive(pathname, t.href, t.exact);
          return (
            <Link
              key={t.href}
              href={t.href}
              onClick={onClose}
              className={cn(
                "flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-400/60",
                active
                  ? "bg-brand-500/[0.18] text-white ring-1 ring-inset ring-brand-400/30"
                  : "bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/90",
              )}
            >
              <span className={cn("flex h-6 w-6 items-center justify-center", active ? "text-brand-300" : "text-white/45")}>
                {t.icon}
              </span>
              <span className="text-[11px] font-medium leading-tight">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </Sheet>
  );
}
