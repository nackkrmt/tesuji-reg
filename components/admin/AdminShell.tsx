"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { setAdminAuthed } from "@/lib/admin-auth";
import { useDataLayer } from "@/lib/data/store";
import { ADMIN_TABS, AdminNavIcon, isTabActive } from "@/components/admin/adminNav";
import { AdminDock } from "@/components/admin/AdminDock";

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
      {/* Desktop sidebar */}
      <aside className="glass fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-y-0 border-l-0 border-r border-white/10 lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-[0_6px_16px_-6px_rgba(10,132,255,0.8)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.svg" alt="" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold leading-tight text-white">TesujiReg</p>
            <p className="text-[11px] leading-tight text-white/45">ระบบหลังบ้าน</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {ADMIN_TABS.map((t) => {
            const active = isActive(t.href, t.exact);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-400/60",
                  active
                    ? "bg-brand-500/[0.18] text-white ring-1 ring-inset ring-brand-400/30 before:absolute before:left-1 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-brand-400"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white/90",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center transition-colors",
                    active ? "text-brand-300" : "text-white/45",
                  )}
                >
                  {t.icon}
                </span>
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-white/10 px-3 py-3">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-white/55 outline-none transition-colors hover:bg-white/[0.06] hover:text-white/90 focus-visible:ring-2 focus-visible:ring-brand-400/60"
          >
            <AdminNavIcon d="M14 5h5v5M19 5l-9 9M10 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4" />
            ดูเว็บไซต์
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-rose-300 outline-none transition-colors hover:bg-rose-500/10 hover:text-rose-200 focus-visible:ring-2 focus-visible:ring-rose-400/60"
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
          <div>
            <p className="text-sm font-bold leading-tight text-white">TesujiReg</p>
            <p className="text-[11px] leading-tight text-white/45">ระบบหลังบ้าน</p>
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
