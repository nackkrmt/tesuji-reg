"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLiveQuery } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { regState } from "@/components/tournament/RegisterCta";
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
  const { t } = useI18n();

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
    const canRegister =
      dockTournament != null &&
      regState(dockTournament, dockCategories ?? []).canRegister;
    const left: Item[] = [
      {
        href: base,
        label: t.nav.home,
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
          enabled={canRegister}
          label={t.nav.register}
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
      <div className="glass pointer-events-auto flex items-end gap-0.5 rounded-[26px] p-1.5">
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
        "flex flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 transition-colors",
        narrow ? "w-[62px]" : "w-[76px]",
        active ? "text-white" : "text-white/50 hover:text-white/80",
      )}
    >
      <span
        className={cn(
          "relative flex h-8 items-center justify-center rounded-full transition-colors",
          narrow ? "w-12" : "w-14",
          active && "bg-white/[0.14]",
        )}
      >
        {item.icon(active)}
        {showBadge && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#0b1020]"
          >
            {(item.badge ?? 0) > 9 ? "9+" : item.badge}
          </span>
        )}
      </span>
      <span
        className={cn(
          "max-w-full truncate text-[10px]",
          active ? "font-semibold" : "font-medium",
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

/** The classic raised register button — but honest about the window: grey and
 *  inert while registration isn't open (closed / not yet / full / loading). */
function CenterRegister({
  href,
  enabled,
  label,
}: {
  href: string;
  enabled: boolean;
  label: string;
}) {
  const inner = (
    <>
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-2xl transition-all",
          enabled
            ? "bg-brand-600 text-white shadow-[0_8px_22px_-6px_rgba(10,132,255,0.8)] active:scale-95"
            : "bg-white/[0.06] text-white/30 ring-1 ring-inset ring-white/10",
        )}
      >
        <IconPlus />
      </span>
      <span
        className={cn(
          "mt-0.5 text-[10px] font-semibold",
          enabled ? "text-white/70" : "text-white/35",
        )}
      >
        {label}
      </span>
    </>
  );
  if (!enabled) {
    return (
      <div
        aria-disabled="true"
        aria-label={label}
        className="mx-0.5 flex cursor-not-allowed flex-col items-center"
      >
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="group mx-0.5 flex flex-col items-center"
    >
      {inner}
    </Link>
  );
}
