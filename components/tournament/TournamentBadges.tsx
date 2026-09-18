"use client";

import { useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/ui/Sheet";
import { useI18n } from "@/lib/i18n";
import { useTournament } from "@/components/tournament/TournamentProvider";
import { ScheduleView, RulesView } from "@/components/tournament/InfoViews";

/** The tournament's own menu, v1-style: a row of small badges under the hero
 *  that open their content in place. Replaces the sub-tab bar the header used
 *  to carry — a row of pills that reshaped the chrome on every sub-page, for
 *  content most visitors read once.
 *
 *  Schedule and rules are short and self-contained, so they open as sheets: no
 *  route change, no back-button detour, and the overview stays underneath. The
 *  participant list is a page of its own (search, hundreds of rows, its own
 *  print styles), so its badge is an ordinary link.
 *
 *  A badge appears only when it has something behind it — an organiser who
 *  hasn't written a schedule yet would otherwise be handing out a button whose
 *  only answer is "ยังไม่มีกำหนดการ". */
export function TournamentBadges() {
  const { t } = useI18n();
  const { tournament, categories } = useTournament();
  const [open, setOpen] = useState<"schedule" | "rules" | null>(null);

  const hasSchedule = (tournament.scheduleGroups?.length ?? 0) > 0;
  const hasRules = (tournament.rulesSections?.length ?? 0) > 0;

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {hasSchedule && (
          <Badge emoji="📅" onClick={() => setOpen("schedule")}>
            {t.nav.schedule}
          </Badge>
        )}
        {hasRules && (
          <Badge emoji="📋" onClick={() => setOpen("rules")}>
            {t.nav.rules}
          </Badge>
        )}
        <Badge emoji="👥" href={`/t/${tournament.id}/participants`}>
          {t.nav.participants}
        </Badge>
      </div>

      <Sheet
        open={open === "schedule"}
        onClose={() => setOpen(null)}
        title={`📅 ${t.nav.schedule}`}
      >
        <ScheduleView tournament={tournament} categories={categories} />
      </Sheet>

      <Sheet
        open={open === "rules"}
        onClose={() => setOpen(null)}
        title={`📋 ${t.nav.rules}`}
      >
        <RulesView tournament={tournament} />
      </Sheet>
    </>
  );
}

const CLS =
  "focus-ring press inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-sm font-semibold text-ink-secondary transition-colors hover:bg-white/10 hover:text-ink";

/** One badge. The label carries the meaning, so the emoji is decoration —
 *  unhidden, VoiceOver reads "calendar กำหนดการ". */
function Badge({
  emoji,
  children,
  onClick,
  href,
}: {
  emoji: string;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) {
  const body = (
    <>
      <span aria-hidden="true" className="text-base leading-none">
        {emoji}
      </span>
      {children}
    </>
  );
  return href ? (
    <Link href={href} className={CLS}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={CLS}>
      {body}
    </button>
  );
}
