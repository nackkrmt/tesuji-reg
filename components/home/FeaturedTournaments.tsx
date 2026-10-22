"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { competitionDatesLabel } from "@/lib/competition-dates";
import type { FeaturedTournament } from "@/lib/tournament-list";
import { useI18n } from "@/lib/i18n";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { IconCalendar, IconChevronRight, IconPin } from "@/components/icons";

/** The top of the home page in the days around a tournament: what is being
 *  played today, and what starts within lib/tournament-list's
 *  FEATURE_LEAD_DAYS. Larger than a list row on purpose — on those days it is
 *  the one thing most visitors came for. Renders nothing the rest of the time,
 *  so the page opens on its search box as before. */
export function FeaturedTournaments({ items }: { items: FeaturedTournament[] }) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  const live = items.filter((f) => f.daysUntil === 0).length;
  const heading =
    live === items.length
      ? t.home.featuredHeadingLive
      : live === 0
        ? t.home.featuredHeadingSoon
        : t.home.featuredHeadingBoth;
  return (
    <section>
      <SectionHeading>{heading}</SectionHeading>
      <div className="space-y-2.5">
        {items.map((f, i) => (
          <FeaturedCard key={f.tournament.id} item={f} delayIndex={i} />
        ))}
      </div>
    </section>
  );
}

function FeaturedCard({
  item,
  delayIndex,
}: {
  item: FeaturedTournament;
  delayIndex: number;
}) {
  const { t, locale } = useI18n();
  const { tournament, daysUntil, day, dayCount } = item;
  const live = daysUntil === 0;
  const when = live
    ? t.home.featuredToday
    : daysUntil === 1
      ? t.home.featuredTomorrow
      : t.home.featuredInDays(daysUntil);
  return (
    // /t/[tid] hands a competition-day visitor on to the pairing board itself
    // (TournamentDetailClient), so one link serves both states.
    <Link
      href={`/t/${tournament.id}`}
      className={cn(
        "focus-ring press relative flex min-h-[132px] animate-rise-in flex-col justify-end overflow-hidden rounded-3xl border p-4 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.8)]",
        live ? "border-brand-400/40" : "border-white/10",
      )}
      style={{ animationDelay: `${Math.min(delayIndex, 8) * 30}ms` }}
    >
      {tournament.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tournament.bannerUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-brand-600 via-brand-800 to-[#06122a]"
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {[20, 40, 60, 80].map((p) => (
              <g key={p} stroke="rgba(255,255,255,0.08)" strokeWidth="0.4">
                <line x1={p} y1="0" x2={p} y2="100" />
                <line x1="0" y1={p} x2="100" y2={p} />
              </g>
            ))}
          </svg>
        </span>
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/65 to-black/35" />

      <span className="relative flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset",
            live
              ? "bg-emerald-950/85 text-emerald-200 ring-emerald-400/50"
              : "bg-amber-950/85 text-amber-200 ring-amber-400/50",
          )}
        >
          {live && (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
            </span>
          )}
          {when}
        </span>
        {day > 1 && (
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-xs font-medium text-white/85">
            {t.home.featuredDayOf(day, dayCount)}
          </span>
        )}
      </span>

      <span className="relative mt-2 flex items-end gap-2">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-lg font-bold text-white text-balance drop-shadow">
            {tournament.nameTh}
          </span>
          <span className="mt-1 flex items-center gap-3 text-sm text-white/75">
            <span className="inline-flex shrink-0 items-center gap-1">
              <IconCalendar size={14} />
              {competitionDatesLabel(tournament, locale, "compact")}
            </span>
            {tournament.locationText && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <IconPin size={14} className="shrink-0" />
                <span className="truncate">{tournament.locationText}</span>
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-white/70">
          <IconChevronRight size={20} />
        </span>
      </span>
    </Link>
  );
}
