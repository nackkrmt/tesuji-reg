"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { setAdminAuthed } from "@/lib/admin-auth";
import { useDataLayer } from "@/lib/data/store";
import { ADMIN_NAV_GROUPS, AdminNavIcon, isTabActive } from "@/components/admin/adminNav";
import { AdminDock } from "@/components/admin/AdminDock";
import { AdminTournamentPicker } from "@/components/admin/AdminTournamentContext";

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const dl = useDataLayer();

  const isActive = (href: string, exact?: boolean) =>
    isTabActive(pathname, href, exact);

  async function logout() {
    setAdminAuthed(false);
    // Admin identity now rides on the Supabase Auth session, so clearing the
    // session is what actually revokes access — the sessionStorage flag alone
    // no longer gates anything.
    await dl.signOut();
    router.replace("/admin/login");
  }

  return (
    <div className="min-h-screen-safe lg:flex">
      {/* Desktop sidebar — three zones: pinned header, scrollable nav, pinned footer. */}
      <aside className="glass fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-y-0 border-l-0 border-r border-white/10 lg:flex">
        <div className="flex shrink-0 items-center gap-2.5 px-4 py-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-glow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.svg" alt="" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold leading-tight text-ink">Tesuji</p>
            <p className="text-[11px] leading-tight text-ink-tertiary">ระบบหลังบ้าน</p>
          </div>
        </div>

        {/* Tournament context applies to every page, so it stays above the scroller. */}
        <div className="shrink-0 px-3 pb-1.5 empty:hidden">
          <AdminTournamentPicker className="!py-2 text-sm" />
        </div>

        {/* min-h-0 lets the flex item shrink below its content; without it the
            nav refuses to compress and the footer falls off the fixed aside. */}
        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-1">
          {ADMIN_NAV_GROUPS.map((group, gi) => (
            <div
              key={group.title ?? gi}
              className={cn(!group.title && gi > 0 && "mt-3 border-t border-white/10 pt-2")}
            >
              {group.title && (
                <p className="mb-1 mt-3 px-2.5 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((t) => {
                  const active = isActive(t.href, t.exact);
                  return (
                    <Link
                      key={t.href}
                      href={t.href}
                      className={cn(
                        "focus-ring press relative flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-sm font-medium transition-colors",
                        t.danger
                          ? active
                            ? "bg-rose-500/[0.14] text-rose-200 ring-1 ring-inset ring-rose-400/30"
                            : "text-rose-300/90 hover:bg-rose-500/10 hover:text-rose-200"
                          : active
                            ? "bg-brand-500/[0.18] text-ink ring-1 ring-inset ring-brand-400/30 before:absolute before:left-0.5 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-brand-400"
                            : "text-ink-tertiary hover:bg-white/[0.06] hover:text-ink",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center transition-colors",
                          t.danger ? "text-rose-300/80" : active ? "text-brand-300" : "text-ink-faint",
                        )}
                      >
                        {t.icon}
                      </span>
                      {t.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Side-by-side footer halves its height so logout stays reachable. */}
        <div className="flex shrink-0 gap-1.5 border-t border-white/10 px-3 py-2.5">
          <Link
            href="/"
            className="focus-ring press flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium text-ink-tertiary transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <AdminNavIcon d="M14 5h5v5M19 5l-9 9M10 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4" />
            ดูเว็บไซต์
          </Link>
          <button
            onClick={logout}
            className="focus-ring press flex h-10 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-200"
          >
            <AdminNavIcon d="M16 17l5-5-5-5M21 12H9M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3" />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Mobile top bar — brand only; navigation now lives in the bottom dock. */}
      <header className="glass sticky top-0 z-30 border-x-0 border-t-0 border-b border-white/10 pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-[0_4px_12px_-6px_rgba(10,132,255,0.8)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.svg" alt="" className="h-4 w-4" />
          </span>
          <div className="shrink-0">
            <p className="text-sm font-bold leading-tight text-ink">Tesuji</p>
            <p className="text-[11px] leading-tight text-ink-tertiary">ระบบหลังบ้าน</p>
          </div>
          <div className="ml-auto min-w-0 max-w-[55%] empty:hidden">
            <AdminTournamentPicker className="!py-1.5 text-sm" />
          </div>
        </div>
      </header>

      {/* Content — each page renders its own <PageHeader> as the single title
          (on every breakpoint), so the shell no longer draws a section title. */}
      <div className="flex-1 lg:pl-64">
        <main className="mx-auto max-w-6xl px-4 pt-5 pb-dock lg:px-8 lg:pt-7 lg:pb-7">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation (hidden on desktop) */}
      <AdminDock onLogout={logout} />
    </div>
  );
}
