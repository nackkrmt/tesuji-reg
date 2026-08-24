"use client";

import Link from "next/link";
import { type Category, remainingSeats, type Tournament } from "@/lib/data/types";
import { cn, formatThaiDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/feedback";
import { useI18n } from "@/lib/i18n";
import { effectiveRegWindow, type RegWindowState } from "@/lib/tournament-window";
import { IconClock } from "@/components/icons";

export function regState(tournament: Tournament, categories: Category[]) {
  const win = effectiveRegWindow(tournament);
  const allFull =
    categories.length > 0 && categories.every((c) => remainingSeats(c) === 0);
  return { win, allFull, canRegister: win === "open" && !allFull };
}

export function RegStatusPill({
  win,
  full,
}: {
  win: RegWindowState;
  full: boolean;
}) {
  const { t } = useI18n();
  if (win === "open" && !full) return <Pill tone="good">{t.home.pillOpen}</Pill>;
  if (win === "open" && full) return <Pill tone="bad">{t.home.pillFull}</Pill>;
  if (win === "before") return <Pill tone="warn">{t.home.notYetOpen}</Pill>;
  if (win === "closed") return <Pill tone="bad">{t.home.closed}</Pill>;
  return <Pill tone="neutral">{t.home.pillSoon}</Pill>;
}

/** The one register entry point for a tournament. Open window → the bright
 *  CTA. Otherwise a readable STATUS BANNER that says what's happening and —
 *  for a not-yet-open window — exactly when it opens, instead of the old
 *  low-contrast disabled button. */
export function RegisterCta({
  tournament,
  categories,
  href,
}: {
  tournament: Tournament;
  categories: Category[];
  href: string;
}) {
  const { t, locale } = useI18n();
  const { win, allFull, canRegister } = regState(tournament, categories);

  if (canRegister) {
    return (
      <Link href={href} className="focus-ring block rounded-2xl">
        <Button fullWidth>{t.home.registerCta}</Button>
      </Link>
    );
  }

  const before = win === "before";
  const title = allFull
    ? t.home.allFull
    : before
      ? t.register.gateTitleBefore
      : t.register.gateTitleClosed;
  const desc = allFull
    ? null
    : before
      ? t.register.gateDescBefore(
          formatThaiDateTime(tournament.registrationOpensAt, locale),
        )
      : t.register.gateDescClosed;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border px-4 py-3.5",
        before
          ? "border-amber-400/25 bg-amber-400/[0.08]"
          : "border-white/10 bg-white/[0.05]",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0",
          before ? "text-amber-300" : "text-ink-tertiary",
        )}
      >
        <IconClock size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {desc && <p className="mt-0.5 text-sm text-ink-secondary">{desc}</p>}
      </div>
    </div>
  );
}
