"use client";

import Link from "next/link";
import { type Category, remainingSeats, type Tournament } from "@/lib/data/types";
import { formatThaiDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/feedback";
import { useI18n } from "@/lib/i18n";
import { regWindow, type RegWindowState } from "@/lib/tournament-window";

export function regState(tournament: Tournament, categories: Category[]) {
  const win = regWindow(tournament);
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

/** The one register entry point for a tournament: a bright CTA while the
 *  window is open, a disabled button that says WHY otherwise. */
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
      <Link href={href}>
        <Button fullWidth>{t.home.registerCta}</Button>
      </Link>
    );
  }
  const label = allFull
    ? t.home.allFull
    : win === "closed"
      ? t.home.closed
      : win === "before"
        ? t.home.notYetOpenAt(
            formatThaiDateTime(tournament.registrationOpensAt, locale),
          )
        : t.home.notYetOpen;
  return (
    <Button fullWidth disabled>
      {label}
    </Button>
  );
}
