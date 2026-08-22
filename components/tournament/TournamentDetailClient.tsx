"use client";

import { useEffect, useState } from "react";
import { cn, formatThaiDate, formatThaiDateTime } from "@/lib/utils";
import { CategoryTable } from "@/components/home/CategoryTable";
import { useI18n } from "@/lib/i18n";
import { listDivisions } from "@/lib/live/client";
import {
  IconBroadcast,
  IconCalendar,
  IconDot,
  IconPin,
} from "@/components/icons";
import { useTournament } from "@/components/tournament/TournamentProvider";
import {
  RegisterCta,
  RegStatusPill,
  regState,
} from "@/components/tournament/RegisterCta";

/** Overview tab of /t/[tid] — the per-tournament version of the old home page
 *  hero + meta + category table (schedule/rules/participants live in the
 *  sub-tab bar now). */
export default function TournamentDetailClient() {
  const { t, locale } = useI18n();
  const { tournament, categories } = useTournament();
  const { win, allFull } = regState(tournament, categories);

  // Grey the live-board entry until the live system has รุ่น posted — same
  // rule the old home page used.
  const [hasLiveData, setHasLiveData] = useState(false);
  useEffect(() => {
    let active = true;
    listDivisions()
      .then((divs) => {
        if (active) setHasLiveData(divs.length > 0);
      })
      .catch(() => {
        if (active) setHasLiveData(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-app px-4 pb-dock pt-3">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.8)]">
        {tournament.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tournament.bannerUrl}
            alt={tournament.nameTh}
            className="h-52 w-full object-cover sm:h-60"
          />
        ) : (
          <div className="h-52 w-full bg-gradient-to-br from-brand-600 via-brand-800 to-[#06122a] sm:h-60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <RegStatusPill win={win} full={allFull} />
          <h1 className="mt-2 text-xl font-bold leading-snug text-white text-balance drop-shadow">
            {tournament.nameTh}
          </h1>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        <RegisterCta
          tournament={tournament}
          categories={categories}
          href="/register"
        />

        {/* /live is a raw route handler (v1 results.html), not a Next page —
            plain <a>, not <Link>. */}
        <LiveCard href="/live" disabled={!hasLiveData} label={t.nav.live} />
      </div>

      {/* Meta */}
      <div className="glass-card mt-4 divide-y divide-white/[0.07] rounded-3xl">
        <MetaRow
          icon={<IconCalendar size={18} />}
          label={t.home.competitionDate}
          value={formatThaiDate(tournament.competitionDate, locale)}
        />
        <div className="flex items-start gap-3 px-4 py-3.5">
          <IconWrap>
            <IconPin size={18} />
          </IconWrap>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-white/55">{t.home.location}</p>
            <p className="font-medium text-white/90">{tournament.locationText}</p>
            {tournament.locationMapsUrl && (
              <a
                href={tournament.locationMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-brand-300 transition hover:text-brand-200"
              >
                {t.home.openInMaps}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-9 9M10 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4" />
                </svg>
              </a>
            )}
          </div>
        </div>
        <MetaRow
          icon={<IconDot className="text-emerald-400" />}
          label={t.home.regOpens}
          value={formatThaiDateTime(tournament.registrationOpensAt, locale)}
        />
        <MetaRow
          icon={<IconDot className="text-rose-400" />}
          label={t.home.regCloses}
          value={formatThaiDateTime(tournament.registrationClosesAt, locale)}
        />
      </div>

      {/* Categories */}
      <section className="mt-6">
        <h2 className="mb-2.5 text-base font-bold text-white">
          {t.home.categoriesTitle}
        </h2>
        <CategoryTable categories={categories} win={win} />
      </section>
    </main>
  );
}

function LiveCard({
  href,
  disabled,
  label,
}: {
  href: string;
  disabled: boolean;
  label: string;
}) {
  const cls = cn(
    "flex items-center justify-center gap-2 rounded-2xl border py-3.5 text-sm font-medium transition",
    disabled
      ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-white/30"
      : "hover-glass border-white/10 bg-white/[0.04] text-white/80",
  );
  const icon = (
    <span className={disabled ? "text-white/25" : "text-brand-300"}>
      <IconBroadcast size={18} />
    </span>
  );
  if (disabled) {
    return (
      <div className={cls} aria-disabled="true">
        {icon}
        {label}
      </div>
    );
  }
  return (
    <a href={href} className={cls}>
      {icon}
      {label}
    </a>
  );
}

function IconWrap({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70 ring-1 ring-inset ring-white/10">
      {children}
    </span>
  );
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <IconWrap>{icon}</IconWrap>
      <div className="min-w-0">
        <p className="text-xs text-white/55">{label}</p>
        <p className="font-medium text-white/90">{value}</p>
      </div>
    </div>
  );
}
