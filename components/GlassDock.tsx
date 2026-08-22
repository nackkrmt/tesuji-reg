"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLiveQuery } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { IconHome, IconTicket, IconTrophy, IconUser } from "@/components/icons";

type Item = {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  match: (path: string) => boolean;
  badge?: number;
};

export function GlassDock() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useI18n();

  // Action-needed badge: registrations still waiting on payment. Only fetched
  // once signed in; a signed-out dock never issues the query.
  const { data: myRegs } = useLiveQuery(
    (d) => (user ? d.listMyRegistrations() : Promise.resolve([])),
    [user?.id],
    ["registrations"],
  );
  const actionCount = (myRegs ?? []).filter(
    (r) => r.batch.status === "pending_payment",
  ).length;

  // The dock belongs to the public browsing surface only — the register
  // wizard (legacy /register/* and /t/[tid]/register/*), the admin dashboard,
  // and the secret judge console own their full chrome.
  if (
    pathname.startsWith("/admin") ||
    /\/register(\/|$)/.test(pathname) ||
    pathname.startsWith("/judge")
  ) {
    return null;
  }

  const items: Item[] = [
    {
      href: "/",
      label: t.nav.home,
      match: (p) => p === "/" || p.startsWith("/t/"),
      icon: (active) => <IconHome filled={active} />,
    },
    {
      href: "/my-registrations",
      label: t.nav.myRegs,
      match: (p) => p.startsWith("/my-registrations"),
      icon: (active) => <IconTicket filled={active} />,
      badge: actionCount,
    },
    {
      href: "/results",
      label: t.nav.results,
      match: (p) => p.startsWith("/results"),
      icon: (active) => <IconTrophy filled={active} />,
    },
    {
      href: "/account",
      label: t.nav.account,
      match: (p) =>
        p.startsWith("/account") ||
        p.startsWith("/profile") ||
        p.startsWith("/login") ||
        p.startsWith("/signup"),
      icon: (active) => <IconUser filled={active} />,
    },
  ];

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
      <div className="glass pointer-events-auto flex items-center gap-0.5 rounded-[26px] p-1.5">
        {items.map((it) => {
          const active = it.match(pathname);
          const showBadge = (it.badge ?? 0) > 0;
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              aria-label={
                showBadge ? `${it.label} — ${t.myReg.badgeActionNeeded}` : it.label
              }
              className={cn(
                "flex w-[76px] flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 transition-colors",
                active ? "text-white" : "text-white/50 hover:text-white/80",
              )}
            >
              <span
                className={cn(
                  "relative flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                  active && "bg-white/[0.14]",
                )}
              >
                {it.icon(active)}
                {showBadge && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#0b1020]"
                  >
                    {(it.badge ?? 0) > 9 ? "9+" : it.badge}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  "max-w-full truncate text-[10px]",
                  active ? "font-semibold" : "font-medium",
                )}
              >
                {it.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
