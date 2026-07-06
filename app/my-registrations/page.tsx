"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BatchWithSeats, Category, RegistrationStatus } from "@/lib/data/types";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLiveQuery } from "@/lib/data/store";
import { PublicHeader } from "@/components/PublicHeader";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState, ErrorState, StatusBadge } from "@/components/ui/feedback";
import { formatThaiDateTime, formatThb, fullNameTh } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface MyRegsData {
  regs: BatchWithSeats[];
  catMap: Record<string, Category>;
  tournMap: Record<string, string>;
}

export default function MyRegistrationsPage() {
  const { user, loading: authLoading } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();

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
      const tournMap: Record<string, string> = {};
      tourns.forEach((t) => {
        if (t) tournMap[t.id] = t.nameTh;
      });
      return { regs, catMap, tournMap };
    },
    [user?.id],
  );

  if (authLoading || !user) return <CenterLoader />;

  const regs = data?.regs ?? [];

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
          <div className="space-y-3">
            {regs.map(({ batch, seats }) => (
              <Card key={batch.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white/90">
                      {data?.tournMap[batch.tournamentId] ?? t.myReg.tournamentFallback}
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

                <ul className="mt-3 divide-y divide-white/10 border-y border-white/10">
                  {seats.map((s) => {
                    const cat = data?.catMap[s.categoryId];
                    return (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm text-white/80">
                          {fullNameTh(s)}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-brand-300">
                          {cat ? `${cat.code} · ${cat.name}` : t.person.dash}
                        </span>
                      </li>
                    );
                  })}
                </ul>

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
            ))}
          </div>
        )}
      </main>
    </>
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
