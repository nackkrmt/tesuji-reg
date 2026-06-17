"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { setAdminAuthed } from "@/lib/admin-auth";

const tabs = [
  { href: "/admin", label: "ภาพรวม", exact: true },
  { href: "/admin/tournament", label: "ทัวร์นาเมนต์" },
  { href: "/admin/categories", label: "รุ่น" },
  { href: "/admin/registrations", label: "ใบสมัคร" },
  { href: "/admin/database", label: "ฐานข้อมูล" },
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

  return (
    <div className="min-h-screen-safe bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
              碁
            </span>
            <div>
              <p className="text-sm font-bold leading-tight text-slate-800">
                TesujiReg
              </p>
              <p className="text-[11px] leading-tight text-slate-400">
                ระบบหลังบ้าน
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
            >
              ดูเว็บไซต์
            </Link>
            <button
              onClick={logout}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2 pb-2">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(t.href, t.exact)
                  ? "bg-brand-100 text-brand-800"
                  : "text-slate-500 hover:bg-slate-100",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
    </div>
  );
}
