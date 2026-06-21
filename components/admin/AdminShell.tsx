"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { setAdminAuthed } from "@/lib/admin-auth";

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
  { href: "/admin/categories", label: "รุ่น", icon: <I d="M12 3l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4" /> },
  { href: "/admin/registrations", label: "ใบสมัคร", icon: <I d="M9 4h6a1 1 0 011 1v1h1a1 1 0 011 1v12a1 1 0 01-1 1H6a1 1 0 01-1-1V7a1 1 0 011-1h1V5a1 1 0 011-1zM8 6h8M9 11h6M9 15h4" /> },
  { href: "/admin/database", label: "ฐานข้อมูล", icon: <I d="M12 5c4 0 7 1 7 2.5S16 10 12 10 5 9 5 7.5 8 5 12 5zM5 7.5v9C5 18 8 19 12 19s7-1 7-2.5v-9M5 12c0 1.5 3 2.5 7 2.5s7-1 7-2.5" /> },
  { href: "/admin/institutes", label: "สถาบัน", icon: <I d="M4 21h16M5 21V8l7-4 7 4v13M9 21v-5h6v5M9 12h.01M15 12h.01M12 12h.01" /> },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  function logout() {
    setAdminAuthed(false);
    router.replace("/admin/login");
  }

  const current = tabs.find((t) => isActive(t.href, t.exact));

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
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-500/15 text-white ring-1 ring-inset ring-brand-400/25"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white/90",
                )}
              >
                <span className={cn(active ? "text-brand-300" : "text-white/45")}>
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
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-white/55 transition hover:bg-white/[0.06] hover:text-white/90"
          >
            <I d="M14 5h5v5M19 5l-9 9M10 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4" />
            ดูเว็บไซต์
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-rose-300 transition hover:bg-rose-500/10"
          >
            <I d="M16 17l5-5-5-5M21 12H9M9 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3" />
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="glass sticky top-0 z-30 border-x-0 border-t-0 border-b border-white/10 lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700">
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
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white/55 transition hover:bg-white/10"
            >
              ดูเว็บไซต์
            </Link>
            <button
              onClick={logout}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                isActive(t.href, t.exact)
                  ? "bg-brand-500/15 text-white ring-1 ring-inset ring-brand-400/25"
                  : "text-white/55 hover:bg-white/[0.06]",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 lg:pl-64">
        {/* Desktop section header */}
        <div className="hidden items-center justify-between px-8 pt-7 lg:flex">
          <h1 className="text-2xl font-bold text-white">
            {current?.label ?? "แดชบอร์ด"}
          </h1>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-5 lg:px-8 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
