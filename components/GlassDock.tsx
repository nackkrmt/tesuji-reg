"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { setQueryErrorReporter, useLiveQuery } from "@/lib/data/store";
import { isTransientError } from "@/lib/retry";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import {
  IconHome,
  IconTicket,
  IconTrophy,
  IconUser,
} from "@/components/icons";

type Item = {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  match: (path: string) => boolean;
  badge?: number;
};

/** The app's one bottom dock: four fixed top-level destinations (list / my
 *  entries / results / account), identical on every public screen. It does not
 *  reshape itself inside /t/[tid] — a bar that swaps its own tabs as you walk
 *  into a section stops being a landmark. In-tournament navigation is the
 *  overview's badge row (components/tournament/TournamentBadges). */
export function GlassDock() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useI18n();
  const toast = useToast();

  // The dock is the one component mounted on every route from inside the Toast
  // provider (AppStoreProvider, which owns the data layer, sits above it), so
  // it is where the app-wide "a live query failed" handler gets installed —
  // without it a failed read stays invisible on the ~50 call sites that read
  // only { data, loading }. Deduped by message: six queries failing on one
  // dropped connection are one dropped connection, not six toasts.
  useEffect(() => {
    let last: { message: string; at: number } | null = null;
    return setQueryErrorReporter((error) => {
      const message = error.message || "";
      const now = Date.now();
      if (last && last.message === message && now - last.at < 5_000) return;
      last = { message, at: now };
      toast.show(
        isTransientError(error) ? t.common.loadErrorDesc : t.common.loadErrorTitle,
        "error",
      );
    });
  }, [toast, t]);

  // Action-needed badge: registrations still waiting on payment.
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
      // A tournament is reached from the list, so browsing one keeps the user
      // visibly in the Home branch. Anchored, not startsWith: a future /team
      // must not light this tab.
      match: (p) => p === "/" || /^\/t(\/|$)/.test(p),
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
    <DockFrame>
      {items.map((it) => (
        <DockTab key={it.href} item={it} pathname={pathname} badgeLabel={t.myReg.badgeActionNeeded} />
      ))}
    </DockFrame>
  );
}

function DockFrame({ children }: { children: React.ReactNode }) {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
      <div className="glass pointer-events-auto flex w-full max-w-[22rem] items-stretch gap-0.5 rounded-3xl p-1.5">
        {children}
      </div>
    </nav>
  );
}

function DockTab({
  item,
  pathname,
  badgeLabel,
}: {
  item: Item;
  pathname: string;
  badgeLabel?: string;
}) {
  const active = item.match(pathname);
  const showBadge = (item.badge ?? 0) > 0;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={
        showBadge && badgeLabel ? `${item.label} — ${badgeLabel}` : item.label
      }
      className={cn(
        // Fluid, not min-w-[76px]: four fixed-width tabs plus gaps overflowed a
        // 320px viewport (SE 1, small Androids) and pushed the pill off-screen.
        "focus-ring flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 rounded-2xl px-0.5 py-1.5 transition-colors",
        active ? "text-ink" : "text-ink-tertiary hover:text-ink-secondary",
      )}
    >
      <span
        className={cn(
          "relative flex h-8 w-14 max-w-full items-center justify-center rounded-full transition-colors",
          active && "animate-scale-in bg-white/[0.14]",
        )}
      >
        {item.icon(active)}
        {showBadge && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface-deep"
          >
            {(item.badge ?? 0) > 9 ? "9+" : item.badge}
          </span>
        )}
      </span>
      <span
        className={cn(
          "max-w-full truncate text-[10px] leading-snug",
          active ? "font-semibold" : "font-medium",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}
