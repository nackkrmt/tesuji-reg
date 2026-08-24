"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLiveQuery } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { regState } from "@/components/tournament/RegisterCta";
import { useToast } from "@/components/ui/Toast";
import { formatThaiDateTime } from "@/lib/utils";
import {
  IconCalendar,
  IconHome,
  IconPlus,
  IconTicket,
  IconTrophy,
  IconUser,
  IconUsers,
} from "@/components/icons";

type Item = {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  match: (path: string) => boolean;
  badge?: number;
};

/** GitHub-style contextual dock: on the global surface it navigates the app
 *  (list / my entries / results / account); inside /t/[tid] it becomes that
 *  tournament's own dock — the classic five buttons, register in the middle. */
export function GlassDock() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const toast = useToast();

  // Tournament context from the URL (the dock mounts outside the /t/[tid]
  // provider tree, so it resolves its own context).
  const tid = /^\/t\/([^/]+)/.exec(pathname)?.[1] ?? null;

  // Action-needed badge (global mode): registrations still waiting on payment.
  const { data: myRegs } = useLiveQuery(
    (d) => (user ? d.listMyRegistrations() : Promise.resolve([])),
    [user?.id],
    ["registrations"],
  );
  const actionCount = (myRegs ?? []).filter(
    (r) => r.batch.status === "pending_payment",
  ).length;

  // Tournament mode: the center + needs the reg window + seat state. Loaded
  // once per tournament — the dock persists across in-tournament navigation.
  const { data: dockTournament } = useLiveQuery(
    (d) => (tid ? d.getTournament(tid) : Promise.resolve(null)),
    [tid],
  );
  const { data: dockCategories } = useLiveQuery(
    (d) => (tid ? d.listCategories(tid) : Promise.resolve([])),
    [tid],
  );

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

  if (tid) {
    const base = `/t/${tid}`;
    const reg = dockTournament
      ? regState(dockTournament, dockCategories ?? [])
      : null;
    // Why the + is grey — surfaced as a toast on tap instead of a silent
    // dead button (the why/when pattern from RegisterCta).
    const disabledReason = !dockTournament || !reg
      ? t.register.gateTitleUnavailable
      : reg.allFull
        ? t.home.allFull
        : reg.win === "before"
          ? t.home.notYetOpenAt(
              formatThaiDateTime(dockTournament.registrationOpensAt, locale),
            )
          : t.home.closed;
    const left: Item[] = [
      {
        href: base,
        label: t.nav.overview,
        // Overview and its card children (rules) belong to the home tab;
        // schedule / participants have their own.
        match: (p) =>
          p.startsWith(base) &&
          !p.startsWith(`${base}/schedule`) &&
          !p.startsWith(`${base}/participants`),
        icon: (active) => <IconHome filled={active} />,
      },
      {
        href: `${base}/schedule`,
        label: t.nav.schedule,
        match: (p) => p.startsWith(`${base}/schedule`),
        icon: () => <IconCalendar />,
      },
    ];
    const right: Item[] = [
      {
        href: `${base}/participants`,
        label: t.nav.participants,
        match: (p) => p.startsWith(`${base}/participants`),
        icon: () => <IconUsers />,
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
        {left.map((it) => (
          <DockTab key={it.href} item={it} pathname={pathname} narrow />
        ))}
        <CenterRegister
          href={`${base}/register`}
          enabled={reg?.canRegister ?? false}
          label={t.nav.register}
          onDisabledTap={() => toast.show(disabledReason, "info")}
        />
        {right.map((it) => (
          <DockTab key={it.href} item={it} pathname={pathname} narrow />
        ))}
      </DockFrame>
    );
  }

  const items: Item[] = [
    {
      href: "/",
      label: t.nav.home,
      match: (p) => p === "/",
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
      <div className="glass pointer-events-auto flex items-end gap-0.5 rounded-3xl p-1.5">
        {children}
      </div>
    </nav>
  );
}

function DockTab({
  item,
  pathname,
  narrow,
  badgeLabel,
}: {
  item: Item;
  pathname: string;
  /** Tournament mode squeezes five slots into the pill. */
  narrow?: boolean;
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
        "focus-ring flex flex-col items-center gap-0.5 rounded-2xl px-0.5 py-1.5 transition-colors",
        narrow ? "min-w-[60px]" : "min-w-[76px]",
        active ? "text-ink" : "text-ink-tertiary hover:text-ink-secondary",
      )}
    >
      <span
        className={cn(
          "relative flex h-8 items-center justify-center rounded-full transition-colors",
          narrow ? "w-12" : "w-14",
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
          "whitespace-nowrap text-[10px] leading-snug",
          active ? "font-semibold" : "font-medium",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

/** The classic raised register button — honest about the window: grey while
 *  registration isn't open (closed / not yet / full / loading), but still a
 *  real, focusable button that explains itself on tap instead of a dead div. */
function CenterRegister({
  href,
  enabled,
  label,
  onDisabledTap,
}: {
  href: string;
  enabled: boolean;
  label: string;
  onDisabledTap: () => void;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl transition-colors",
          enabled
            ? "bg-brand-600 text-white shadow-glow-sm"
            : "bg-white/[0.06] text-ink-faint ring-1 ring-inset ring-white/10",
        )}
      >
        <IconPlus />
      </span>
      <span
        className={cn(
          "mt-0.5 whitespace-nowrap text-[10px] font-semibold leading-snug",
          enabled ? "text-ink-secondary" : "text-ink-faint",
        )}
      >
        {label}
      </span>
    </>
  );
  if (!enabled) {
    return (
      <button
        type="button"
        aria-disabled="true"
        aria-label={label}
        onClick={onDisabledTap}
        className="focus-ring mx-0.5 flex cursor-not-allowed flex-col items-center rounded-2xl"
      >
        {inner}
      </button>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="focus-ring press mx-0.5 flex flex-col items-center rounded-2xl"
    >
      {inner}
    </Link>
  );
}
