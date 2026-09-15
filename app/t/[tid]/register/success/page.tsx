"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { SUCCESS_KEY } from "@/components/register/RegisterFlowProvider";
import { useTournament } from "@/components/tournament/TournamentProvider";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { BatchWithSeats, Category } from "@/lib/data/types";
import { Card } from "@/components/ui/Card";
import { CenterLoader, StatusBadge } from "@/components/ui/feedback";
import { cn, formatThaiDateTime, formatThb, fullNameTh } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface SuccessInfo {
  referenceCode: string;
  batchId?: string;
}

interface SummaryData {
  reg: BatchWithSeats;
  catMap: Record<string, Category>;
  tournamentName: string | null;
}

export default function SuccessStep() {
  const { t, locale } = useI18n();
  const { tournament } = useTournament();
  const dl = useDataLayer();

  const [info] = useState<SuccessInfo | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem(SUCCESS_KEY);
      return raw ? (JSON.parse(raw) as SuccessInfo) : null;
    } catch {
      return null;
    }
  });

  const { data, loading } = useLiveQuery<SummaryData | null>(
    async (d) => {
      if (!info?.batchId) return null;
      const reg = await d.getBatch(info.batchId);
      if (!reg) return null;
      const [cats, tournament] = await Promise.all([
        d.listCategories(reg.batch.tournamentId),
        d.getTournament(reg.batch.tournamentId),
      ]);
      const catMap: Record<string, Category> = {};
      cats.forEach((c) => (catMap[c.id] = c));
      return { reg, catMap, tournamentName: tournament?.nameTh ?? null };
    },
    [info?.batchId],
  );

  if (!info) {
    // No sessionStorage data at all (e.g. deep link / storage cleared) — bail
    // out to a neutral landing rather than erroring.
    return (
      <div className="mx-auto max-w-app px-4 py-10">
        <Card className="flex flex-col items-center gap-4 p-8 text-center">
          <SuccessIcon />
          <h1 className="text-xl font-bold text-white">{t.register.successHeading}</h1>
          <div className="flex w-full flex-col gap-2">
            <LinkButton href="/my-registrations">
              {t.register.viewMyRegs}
            </LinkButton>
          </div>
        </Card>
      </div>
    );
  }

  if (info.batchId && loading) return <CenterLoader />;

  const summary = data;

  return (
    <div className="mx-auto max-w-app px-4 py-10">
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <SuccessIcon />
        <div>
          <h1 className="text-xl font-bold text-white">{t.register.successHeading}</h1>
          <p className="mt-1 text-sm text-white/55">{t.register.successDesc}</p>
        </div>

        {/* Screenshot warning */}
        <div className="flex w-full items-start gap-2.5 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-left">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 shrink-0"
          >
            <rect x="2" y="6" width="20" height="14" rx="2.5" />
            <path d="M8 6 9.5 3.5h5L16 6" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-200">
              {t.register.screenshotWarnTitle}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-200/80">
              {t.register.screenshotWarnBody}
            </p>
          </div>
        </div>

        {/* Registration summary */}
        {summary ? (
          <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {summary.tournamentName && (
                  <p className="truncate text-sm font-semibold text-white/90">
                    {summary.tournamentName}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-white/45">
                  {formatThaiDateTime(summary.reg.batch.createdAt, locale)}
                </p>
              </div>
              <StatusBadge status={summary.reg.batch.status} />
            </div>

            <div className="mt-3 border-t border-white/10 pt-3">
              <p className="text-xs text-white/45">{t.register.referenceNo}</p>
              <p className="text-lg font-bold tracking-wide text-brand-200">
                {summary.reg.batch.referenceCode}
              </p>
            </div>

            <p className="mt-3 text-xs font-medium text-white/45">
              {t.register.participantsLabel}
            </p>
            <ul className="mt-1 divide-y divide-white/10 border-y border-white/10">
              {summary.reg.seats.map((s) => {
                const cat = summary.catMap[s.categoryId];
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-white/80">
                      {fullNameTh(s)}
                    </span>
                    <span className="shrink-0 text-xs font-medium text-brand-300">
                      {cat ? `${cat.code} · ${cat.name}` : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-white/45">{t.myReg.total}</span>
              <span className="text-right">
                {summary.reg.batch.discountThb ? (
                  <span className="block text-xs text-emerald-300">
                    {t.register.discountLabel(
                      formatThb(summary.reg.batch.discountThb),
                      summary.reg.batch.promoCode ?? null,
                    )}
                  </span>
                ) : null}
                <span className="font-bold text-white/90">
                  {formatThb(summary.reg.batch.totalAmountThb)} ฿
                </span>
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs text-white/45">{t.register.referenceNo}</p>
              <p className="text-lg font-bold tracking-wide text-brand-200">
                {info.referenceCode}
              </p>
            </div>
            <span className="rounded-full bg-sky-400/15 px-3 py-1 text-sm font-semibold text-sky-300 ring-1 ring-inset ring-sky-400/25">
              {t.register.statusPending}
            </span>
          </>
        )}

        <p className="text-xs text-white/40">{t.register.saveRefHint}</p>

        <div className="flex w-full flex-col gap-2">
          <LinkButton href="/my-registrations" variant="secondary">
            {t.register.viewMyRegs}
          </LinkButton>
          <LinkButton
            href={`/t/${tournament.id}/participants`}
            variant="secondary"
          >
            {t.register.viewParticipants}
          </LinkButton>
          <LinkButton href="/">{t.register.backHome}</LinkButton>
        </div>
      </Card>
    </div>
  );
}

/** A link that LOOKS like a button. The three CTAs here used to be a <Button>
 *  inside a <Link>, i.e. a <button> inside an <a>: invalid HTML, announced as
 *  "link, button" by screen readers, and two focus stops for one action. The
 *  shared Button renders a real <button> and takes no `as`/href, so the styles
 *  are restated on an <a> — the same thing /my-registrations does for its own
 *  link-shaped actions. */
function LinkButton({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: "primary" | "secondary";
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-12 w-full items-center justify-center rounded-2xl px-5 text-base font-semibold outline-none transition-all duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-brand-400/70",
        variant === "primary"
          ? "bg-brand-600 text-white shadow-[0_8px_24px_-8px_rgba(10,132,255,0.7)] hover:bg-brand-500 active:bg-brand-700"
          : "glass text-white hover:bg-white/10",
      )}
    >
      {children}
    </Link>
  );
}

function SuccessIcon() {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-inset ring-emerald-400/30">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}
