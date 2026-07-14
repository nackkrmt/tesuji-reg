"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { setAdminAuthed } from "@/lib/admin-auth";
import { useDataLayer } from "@/lib/data/store";

type Tab = {
  href: string;
  label: string;
  exact?: boolean;
  icon: ReactNode;
};

function I({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const tabs: Tab[] = [
  { href: "/admin", label: "ภาพรวม", exact: true, icon: <I d="M4 13h7V4H4v9zM13 20h7V10h-7v10zM4 20h7v-4H4v4zM13 4v3h7V4h-7z" /> },
  { href: "/admin/tournament", label: "ทัวร์นาเมนต์", icon: <I d="M8 4h8v3a4 4 0 11-8 0V4zM6 5H4v1a3 3 0 003 3M18 5h2v1a3 3 0 01-3 3M9 14h6M12 11v3M9 20h6M10 17h4v3h-4z" /> },
  { href: "/admin/rules", label: "กฎ กติกา", icon: <I d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2zM9 7h7M9 11h7" /> },
  { href: "/admin/categories", label: "รุ่น", icon: <I d="M12 3l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4" /> },
  { href: "/admin/registrations", label: "ใบสมัคร", icon: <I d="M9 4h6a1 1 0 011 1v1h1a1 1 0 011 1v12a1 1 0 01-1 1H6a1 1 0 01-1-1V7a1 1 0 011-1h1V5a1 1 0 011-1zM8 6h8M9 11h6M9 15h4" /> },
  { href: "/admin/withdrawals", label: "ถอนตัว", icon: <I d="M16 17l5-5-5-5M21 12H9M12 3H6a2 2 0 00-2 2v14a2 2 0 002 2h6" /> },
  { href: "/admin/live", label: "ผลแข่งสด", icon: <I d="M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z" /> },
  { href: "/admin/judges", label: "กรรมการ", icon: <I d="M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 10.5a3 3 0 100-6 3 3 0 000 6zM15 10l2 2 4-4" /> },
  { href: "/admin/database", label: "ฐานข้อมูล", icon: <I d="M12 5c4 0 7 1 7 2.5S16 10 12 10 5 9 5 7.5 8 5 12 5zM5 7.5v9C5 18 8 19 12 19s7-1 7-2.5v-9M5 12c0 1.5 3 2.5 7 2.5s7-1 7-2.5" /> },
  { href: "/admin/people", label: "ประวัตินักกีฬา", icon: <I d="M10 11a4 4 0 100-8 4 4 0 000 8zM3 21v-1a6 6 0 016-6h3M16.5 20a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 22l-2-2" /> },
  { href: "/admin/institutes", label: "สถาบัน", icon: <I d="M4 21h16M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 12h.01M15 12h.01M12 12h.01" /> },
  { href: "/admin/codes", label: "โค้ดส่วนลด", icon: <I d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L2 12V2h10l8.6 8.6a2 2 0 010 2.8zM7.5 7.5h.01" /> },
  { href: "/admin/reset", label: "รีเซ็ต", icon: <I d="M10.3 3.9l-8 14A2 2 0 004 21h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0zM12 9v4M12 17h.01" /> },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const dl = useDataLayer();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

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
          {tabs.map((t) => {
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
            <I d="M14 5h5v5M19 5l-9 9M10 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4" />
            ดูเว็บไซต์
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-rose-300 outline-none transition-colors hover:bg-rose-500/10 hover:text-rose-200 focus-visible:ring-2 focus-visible:ring-rose-400/60"
          >
            <I d="M16 17l5-5-5-5M21 12H9M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3" />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="glass sticky top-0 z-30 border-x-0 border-t-0 border-b border-white/10 pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-[0_4px_12px_-6px_rgba(10,132,255,0.8)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.svg" alt="" className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-bold leading-tight text-white">TesujiReg</p>
              <p className="text-[11px] leading-tight text-white/45">ระบบหลังบ้าน</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/"
              className="rounded-xl px-3 py-1.5 text-xs font-medium text-white/55 outline-none transition-colors hover:bg-white/[0.06] hover:text-white/90 focus-visible:ring-2 focus-visible:ring-brand-400/60"
            >
              ดูเว็บไซต์
            </Link>
            <button
              onClick={logout}
              className="rounded-xl px-3 py-1.5 text-xs font-medium text-rose-300 outline-none transition-colors hover:bg-rose-500/10 hover:text-rose-200 focus-visible:ring-2 focus-visible:ring-rose-400/60"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-400/60",
                isActive(t.href, t.exact)
                  ? "bg-brand-500/[0.18] text-white ring-1 ring-inset ring-brand-400/30"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white/90",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Content — each page renders its own <PageHeader> as the single title
          (on every breakpoint), so the shell no longer draws a section title. */}
      <div className="flex-1 lg:pl-64">
        <main className="mx-auto max-w-6xl px-4 py-5 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  );
}
