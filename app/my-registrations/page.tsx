"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BatchWithSeats,
  Category,
  RegistrationSeat,
  RegistrationStatus,
  Tournament,
} from "@/lib/data/types";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLiveQuery } from "@/lib/data/store";
import { PublicHeader } from "@/components/PublicHeader";
import { CountdownTimer } from "@/components/register/CountdownTimer";
import { WithdrawSheet } from "@/components/registrations/WithdrawSheet";
import { SwapSeatSheet } from "@/components/registrations/SwapSeatSheet";
import { Card } from "@/components/ui/Card";
import {
  CenterLoader,
  EmptyState,
  ErrorState,
  Pill,
  StatusBadge,
} from "@/components/ui/feedback";
import { cn, formatThaiDateTime, formatThb, fullNameTh } from "@/lib/utils";
import { useI18n, type Locale } from "@/lib/i18n";

interface MyRegsData {
  regs: BatchWithSeats[];
  catMap: Record<string, Category>;
  tournMap: Record<string, Tournament>;
}

export default function MyRegistrationsPage() {
  const { user, loading: authLoading } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();
  const [showExpired, setShowExpired] = useState(false);

  useEffect(() => {
    if (!authLoading && !user)
      router.replace("/login?next=/my-registrations");
  }, [authLoading, user, router]);

  const { data, loading, error, refetch } = useLiveQuery<MyRegsData>(
    async (d) => {
      const regs = await d.listMyRegistrations();
      const tids = Array.from(new Set(regs.map((r) => r.batch.tournamentId)));
      const [catLists, tourns] = await Promise.all([
        Promise.all(tids.map((t) => d.listCategories(t))),
        Promise.all(tids.map((t) => d.getTournament(t))),
      ]);
      const catMap: Record<string, Category> = {};
      catLists.flat().forEach((c) => (catMap[c.id] = c));
      const tournMap: Record<string, Tournament> = {};
      tourns.forEach((t) => {
        if (t) tournMap[t.id] = t;
      });
      return { regs, catMap, tournMap };
    },
    [user?.id],
  );

  if (authLoading || !user) return <CenterLoader />;

  const regs = data?.regs ?? [];
  const activeRegs = regs.filter((r) => r.batch.status !== "expired");
  const expiredRegs = regs.filter((r) => r.batch.status === "expired");

  return (
    <>
      <PublicHeader back="/" title={t.account.myRegistrations} />
      <main className="mx-auto max-w-app px-4 pb-dock pt-4">
        <p className="mb-3 text-sm text-white/55">
          {t.myReg.subtitle}
        </p>

        {loading ? (
          <CenterLoader />
        ) : error ? (
          <ErrorState onRetry={refetch} />
        ) : regs.length === 0 ? (
          <EmptyState
            title={t.myReg.emptyTitle}
            description={t.myReg.emptyDesc}
            action={
              <Link
                href="/register"
                className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_18px_-8px_rgba(10,132,255,0.9)] transition hover:bg-brand-500"
              >
                {t.myReg.registerAction}
              </Link>
            }
          />
        ) : (
          <>
            {activeRegs.length === 0 && expiredRegs.length > 0 ? (
              <EmptyState
                title={t.myReg.emptyTitle}
                description={t.myReg.emptyDesc}
                action={
                  <Link
                    href="/register"
                    className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_6px_18px_-8px_rgba(10,132,255,0.9)] transition hover:bg-brand-500"
                  >
                    {t.myReg.registerAction}
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {activeRegs.map((reg) => (
                  <RegCard
                    key={reg.batch.id}
                    reg={reg}
                    catMap={data?.catMap}
                    tournament={data?.tournMap[reg.batch.tournamentId]}
                    locale={locale}
                    onExpire={refetch}
                    onChanged={refetch}
                  />
                ))}
              </div>
            )}

            {expiredRegs.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowExpired((v) => !v)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/60 transition hover:bg-white/[0.06]"
                >
                  {showExpired
                    ? t.myReg.hideExpired
                    : t.myReg.showExpired(expiredRegs.length)}
                </button>

                {showExpired && (
                  <div className="mt-3 space-y-3">
                    {expiredRegs.map((reg) => (
                      <RegCard
                        key={reg.batch.id}
                        reg={reg}
                        catMap={data?.catMap}
                        tournament={data?.tournMap[reg.batch.tournamentId]}
                        locale={locale}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

function RegCard({
  reg,
  catMap,
  tournament,
  locale,
  onExpire,
  onChanged,
}: {
  reg: BatchWithSeats;
  catMap: Record<string, Category> | undefined;
  tournament: Tournament | undefined;
  locale: Locale;
  onExpire?: () => void;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const { batch, seats, hold } = reg;

  // Withdraw + swap are only meaningful once a batch is committed (paid slip in
  // review, or confirmed). Swapping additionally closes when registration does.
  const canAct =
    batch.status === "confirmed" || batch.status === "pending_review";
  const swapAllowed =
    canAct &&
    !!tournament &&
    Date.now() < Date.parse(tournament.registrationClosesAt);

  const [withdrawTarget, setWithdrawTarget] = useState<RegistrationSeat | null>(
    null,
  );
  const [swapTarget, setSwapTarget] = useState<RegistrationSeat | null>(null);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white/90">
            {tournament?.nameTh ?? t.myReg.tournamentFallback}
          </p>
          <p className="mt-0.5 text-xs text-white/45">
            {t.myReg.refLine(
              batch.referenceCode,
              formatThaiDateTime(batch.createdAt, locale),
            )}
          </p>
        </div>
        <StatusBadge status={batch.status} />
      </div>

      {batch.status === "pending_payment" && hold?.expiresAt && (
        <div className="mt-3">
          <CountdownTimer
            expiresAt={hold.expiresAt}
            onExpire={onExpire ?? (() => {})}
          />
        </div>
      )}

      <ul className="mt-3 divide-y divide-white/10 border-y border-white/10">
        {seats.map((s) => {
          const cat = catMap?.[s.categoryId];
          const withdrawn = !!s.withdrawnAt;
          return (
            <li key={s.id} className="py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={cn(
                    "min-w-0 truncate text-sm",
                    withdrawn ? "text-white/35 line-through" : "text-white/80",
                  )}
                >
                  {fullNameTh(s)}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-medium",
                    withdrawn ? "text-white/30" : "text-brand-300",
                  )}
                >
                  {cat ? `${cat.code} · ${cat.name}` : t.person.dash}
                </span>
              </div>
              {withdrawn ? (
                <div className="mt-1.5">
                  <Pill tone="bad" size="sm">
                    {t.myReg.withdrawnBadge}
                  </Pill>
                </div>
              ) : canAct ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <SeatActionButton onClick={() => setWithdrawTarget(s)} danger>
                    {t.myReg.withdrawAction}
                  </SeatActionButton>
                  {swapAllowed && (
                    <SeatActionButton onClick={() => setSwapTarget(s)}>
                      {t.myReg.swapAction}
                    </SeatActionButton>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {withdrawTarget && (
        <WithdrawSheet
          open={!!withdrawTarget}
          onClose={() => setWithdrawTarget(null)}
          seat={withdrawTarget}
          category={catMap?.[withdrawTarget.categoryId]}
          onDone={() => onChanged?.()}
        />
      )}
      {swapTarget && (
        <SwapSeatSheet
          open={!!swapTarget}
          onClose={() => setSwapTarget(null)}
          seat={swapTarget}
          tournamentId={batch.tournamentId}
          onDone={() => onChanged?.()}
        />
      )}

      <div className="mt-3 flex items-center justify-between">
        <StatusNote status={batch.status} note={batch.adminNote} />
        <span className="shrink-0 text-sm">
          <span className="text-white/45">{t.myReg.total}</span>
          <span className="font-bold text-white/90">
            {formatThb(batch.totalAmountThb)} ฿
          </span>
        </span>
      </div>

      {/* Still owes money → let them jump back to the QR / slip screen
          (rebuilt from this batch), for when they closed the tab or
          lost the QR before paying. */}
      {batch.status === "pending_payment" && (
        <Link
          href={`/register/payment?batch=${batch.id}`}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_18px_-8px_rgba(10,132,255,0.9)] transition hover:bg-brand-500 active:scale-[0.99]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 17h3v-3M17 21h4v-4M21 14v.01M14 21v.01" />
          </svg>
          {t.myReg.payNow}
        </Link>
      )}
    </Card>
  );
}

/** Small per-seat action chip (ถอนตัว / เปลี่ยนคน). */
function SeatActionButton({
  onClick,
  danger,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
        danger
          ? "border-rose-400/30 text-rose-300 hover:bg-rose-500/10"
          : "border-white/15 text-white/70 hover:bg-white/10 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

/** Short, human note explaining what each status means for the applicant. */
function StatusNote({
  status,
  note,
}: {
  status: RegistrationStatus;
  note?: string | null;
}) {
  const { t } = useI18n();
  switch (status) {
    case "confirmed":
      return (
        <span className="text-xs font-medium text-emerald-300">
          {t.myReg.noteConfirmed}
        </span>
      );
    case "pending_review":
      return (
        <span className="text-xs font-medium text-sky-300">
          {t.myReg.notePendingReview}
        </span>
      );
    case "rejected":
      return (
        <span className="text-xs font-medium text-rose-300">
          {t.myReg.noteRejected(note ?? null)}
        </span>
      );
    case "pending_payment":
      return (
        <span className="text-xs font-medium text-amber-300">
          {t.myReg.notePendingPayment}
        </span>
      );
    case "expired":
      return (
        <span className="text-xs font-medium text-white/40">
          {t.myReg.noteExpired}
        </span>
      );
    default:
      return <span className="text-xs text-white/40">{t.myReg.noteDefault}</span>;
  }
}
