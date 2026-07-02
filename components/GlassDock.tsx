"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { useI18n } from "@/lib/i18n";

type Item = {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  match: (path: string) => boolean;
  center?: boolean;
};

function Icon({ d, fill }: { d: string; fill?: boolean }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export function GlassDock() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useI18n();

  // The dock belongs to the public browsing surface only — the register wizard,
  // the admin dashboard, and the secret judge console own their full chrome.
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/judge")
  ) {
    return null;
  }

  const items: Item[] = [
    {
      href: "/",
      label: t.nav.home,
      match: (p) => p === "/",
      icon: () => <Icon d="M3 10.5L12 3l9 7.5M5.5 9.5V20a1 1 0 001 1h11a1 1 0 001-1V9.5" />,
    },
    {
      href: "/schedule",
      label: t.nav.schedule,
      match: (p) => p.startsWith("/schedule"),
      icon: () => (
        <Icon d="M7 3v3M17 3v3M4 8.5h16M5 5.5h14a1 1 0 011 1V20a1 1 0 01-1 1H5a1 1 0 01-1-1V6.5a1 1 0 011-1z" />
      ),
    },
    {
      href: "/register",
      label: t.nav.register,
      center: true,
      match: (p) => p.startsWith("/register"),
      icon: () => <Icon d="M12 5v14M5 12h14" />,
    },
    {
      href: "/participants",
      label: t.nav.participants,
      match: (p) => p.startsWith("/participants"),
      icon: () => (
        <Icon d="M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 10.5a3 3 0 100-6 3 3 0 000 6zM20 19v-1.5a3.5 3.5 0 00-2.6-3.4M15.5 4.6a3 3 0 010 5.8" />
      ),
    },
  ];

  const accountHref = user ? "/my-registrations" : "/login";
  const accountActive =
    pathname.startsWith("/my-registrations") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup");

  const allItems: Item[] = [
    ...items,
    {
      href: accountHref,
      label: t.nav.account,
      match: () => accountActive,
      icon: () => (
        <Icon d="M19 20v-1a5 5 0 00-5-5h-4a5 5 0 00-5 5v1M12 11a4 4 0 100-8 4 4 0 000 8z" />
      ),
    },
  ];

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
      <div className="glass pointer-events-auto flex items-end gap-0.5 rounded-[26px] p-1.5">
        {allItems.map((it) => {
          const active = it.match(pathname);
          if (it.center) {
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-label={it.label}
                className="group mx-0.5 flex flex-col items-center"
              >
                <span
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-[0_8px_22px_-6px_rgba(10,132,255,0.8)] transition-all active:scale-95",
                    active && "ring-2 ring-brand-300/50",
                  )}
                >
                  {it.icon(active)}
                </span>
                <span className="mt-0.5 text-[10px] font-semibold text-white/70">
                  {it.label}
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={it.href + it.label}
              href={it.href}
              aria-label={it.label}
              className={cn(
                "flex w-[60px] flex-col items-center gap-1 rounded-2xl px-1 py-2 transition-colors",
                active ? "text-white" : "text-white/50 hover:text-white/80",
              )}
            >
              <span
                className={cn(
                  "flex h-7 items-center justify-center transition-transform",
                  active && "scale-105",
                )}
              >
                {it.icon(active)}
              </span>
              <span className="text-[10px] font-medium">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
