"use client";

import { useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useTournament } from "@/components/tournament/TournamentProvider";
import { ScheduleView, RulesView } from "@/components/tournament/InfoViews";

export type LiveState = "loading" | "ready" | "none";

/** The tournament's own menu, in the shape the very first commit gave it
 *  (0855ebb, `{/* Secondary actions *\/}`): square tiles, emoji stacked over
 *  the label, laid out on a grid. Two columns rather than v1's three, because
 *  these labels are longer than the 375px thirds they would have to share.
 *
 *  ผลการจับคู่ is one of the tiles instead of the full-width row it had been.
 *  It is the same kind of thing as the other three — somewhere else to go — and
 *  keeping it out left two different tile languages stacked on one screen, and
 *  an odd number of tiles for a two-column grid. It still leaves the Next app
 *  for a raw route handler, hence the plain <a>.
 *
 *  Schedule and rules open in place as sheets: no route change, no back-button
 *  detour, the overview still underneath. The participant list keeps its own
 *  page — it has a search box, hundreds of rows and its own print styles.
 *
 *  The set is fixed: four tiles on every tournament, whether or not there is
 *  anything behind them. This reverses an earlier rule that hid a tile until
 *  its content existed. Hiding made each tournament's menu a different shape,
 *  so a visitor could not tell "this event has no schedule" from "the schedule
 *  is somewhere I haven't found" — and on this deployment most tournaments
 *  carry neither a schedule nor rules, which left the grid looking like a
 *  half-loaded page. An empty tile now opens and says ยังไม่มีกำหนดการ /
 *  ยังไม่มีข้อมูลกฎ กติกา, which is an answer.
 *
 *  ผลการจับคู่ stays the exception: it is dimmed rather than empty-on-open,
 *  because it leaves the app for a raw board page that has no sheet to dismiss
 *  and no way back except its own ← button. Dimmed and nothing else — no line
 *  of explanation under the label, by request. */
export function TournamentMenu({ liveState }: { liveState: LiveState }) {
  const { t } = useI18n();
  const { tournament, categories } = useTournament();
  const [open, setOpen] = useState<"schedule" | "rules" | null>(null);

  return (
    <>
      {/* Always four, always in this order — the grid never changes shape
          between tournaments, so it is never ambiguous whether a tile is
          missing or merely empty. */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <Tile
          emoji="📅"
          label={t.nav.schedule}
          onClick={() => setOpen("schedule")}
        />
        <Tile emoji="📋" label={t.nav.rules} onClick={() => setOpen("rules")} />
        <Tile
          emoji="👥"
          label={t.nav.participants}
          href={`/t/${tournament.id}/participants`}
        />
        {liveState === "loading" ? (
          <div
            aria-hidden="true"
            className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-4"
          >
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ) : (
          <Tile
            emoji="📡"
            label={t.nav.live}
            href={`/live/${tournament.id}`}
            external
            disabled={liveState === "none"}
          />
        )}
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

/** One square tile: emoji in a rounded chip, label under it. The label carries
 *  the meaning, so the emoji is decoration — unhidden, VoiceOver reads
 *  "calendar กำหนดการ".
 *
 *  Nothing but the emoji and the label: a tile that carried an explanatory
 *  line under its label grew taller than the three beside it, which is the
 *  one thing a grid of identical squares cannot absorb. A dimmed tile says
 *  unavailable on its own. */
function Tile({
  emoji,
  label,
  onClick,
  href,
  external,
  disabled,
}: {
  emoji: string;
  label: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  disabled?: boolean;
}) {
  const cls = cn(
    "flex h-full flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-4 text-center",
    disabled
      ? "cursor-not-allowed border-white/5 bg-white/[0.02]"
      : "focus-ring press hover-glass border-white/10 bg-white/[0.04]",
  );
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-xl text-lg leading-none ring-1 ring-inset",
          disabled
            ? "bg-white/[0.03] opacity-40 ring-white/5"
            : "bg-white/[0.06] ring-white/10",
        )}
      >
        {emoji}
      </span>
      <span
        className={cn(
          "text-sm font-medium",
          disabled ? "text-ink-faint" : "text-ink-secondary",
        )}
      >
        {label}
      </span>
    </>
  );

  if (disabled) {
    return (
      <div className={cls} aria-disabled="true">
        {body}
      </div>
    );
  }
  if (external && href) {
    return (
      <a href={href} className={cls}>
        {body}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}
