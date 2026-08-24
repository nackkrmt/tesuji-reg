"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "@/lib/data/store";
import { ParticipantRow } from "@/lib/data/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  CodeChip,
  EmptyState,
  ErrorState,
  Pill,
} from "@/components/ui/feedback";
import { TextInput } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/Skeleton";
import { useI18n } from "@/lib/i18n";
import { normalizeThaiName } from "@/lib/go-database";
import { IconX } from "@/components/icons";
import { useTournament } from "@/components/tournament/TournamentProvider";

interface Group {
  code: string;
  name: string;
  rows: ParticipantRow[];
}

export default function ParticipantsClient() {
  const { t } = useI18n();
  const { tournament } = useTournament();
  const tid = tournament.id;
  const {
    data: rows,
    loading,
    error,
    refetch,
  } = useLiveQuery((d) => d.listParticipants(tid), [tid]);
  const [q, setQ] = useState("");

  // Normalized search — same folding the rank database uses, so "ศักดิ์"
  // matches "สักดิ์" and stray spaces don't hide a name.
  const needle = normalizeThaiName(q);
  const filtered = useMemo(
    () =>
      (rows ?? []).filter((r) =>
        needle ? normalizeThaiName(r.fullNameTh).includes(needle) : true,
      ),
    [rows, needle],
  );

  const groups = useMemo<Group[]>(() => {
    const byCode = new Map<string, Group>();
    for (const r of filtered) {
      let g = byCode.get(r.categoryCode);
      if (!g) {
        g = { code: r.categoryCode, name: r.categoryName, rows: [] };
        byCode.set(r.categoryCode, g);
      }
      g.rows.push(r);
    }
    return Array.from(byCode.values()).sort((a, b) =>
      a.code.localeCompare(b.code),
    );
  }, [filtered]);

  const total = rows?.length ?? 0;
  const confirmedCount = (rows ?? []).filter(
    (r) => r.status === "confirmed",
  ).length;
  const pendingCount = total - confirmedCount;

  if (loading) {
    return (
      <main aria-busy="true" className="mx-auto max-w-app px-4 pb-dock pt-4">
        <div className="space-y-4">
          <Skeleton className="h-[52px] rounded-2xl" />
          <Skeleton className="h-4 w-44" />
          {[0, 1].map((i) => (
            <div
              key={i}
              className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
            >
              <Skeleton className="h-11 rounded-none" />
              <div className="space-y-3 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-3/5" />
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-app px-4 pb-dock pt-4">
      {error ? (
        <ErrorState onRetry={refetch} />
      ) : total === 0 ? (
        <EmptyState
          title={t.participants.emptyTitle}
          description={t.participants.emptyDesc}
        />
      ) : (
        <div className="space-y-4">
          <div>
            <div className="relative">
              <TextInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t.participants.searchPlaceholder}
                className={q ? "pr-12" : undefined}
              />
              {q !== "" && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  aria-label={t.participants.clearSearch}
                  className="focus-ring absolute inset-y-0 right-1 my-auto flex h-11 w-11 items-center justify-center rounded-xl text-ink-tertiary transition-colors hover:text-ink"
                >
                  <IconX size={18} />
                </button>
              )}
            </div>
            {/* The count follows the filter — it's the search's live answer. */}
            <p className="mt-2 text-sm text-ink-tertiary" aria-live="polite">
              {needle
                ? t.participants.matchCount(filtered.length, total)
                : t.participants.totalCount(total) +
                  (pendingCount > 0
                    ? t.participants.breakdown(confirmedCount, pendingCount)
                    : "")}
            </p>
          </div>

          {groups.length === 0 ? (
            <EmptyState
              title={t.participants.noMatch}
              action={
                <Button variant="secondary" onClick={() => setQ("")}>
                  {t.participants.clearSearch}
                </Button>
              }
            />
          ) : (
            groups.map((g, gi) => (
              <div
                key={g.code}
                className="animate-rise-in"
                style={{ animationDelay: `${Math.min(gi, 8) * 30}ms` }}
              >
                <Card className="overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
                    <CodeChip>{g.code}</CodeChip>
                    <span className="font-semibold text-ink">{g.name}</span>
                    <span className="ml-auto text-sm tabular-nums text-ink-tertiary">
                      {t.participants.countPeople(g.rows.length)}
                    </span>
                  </div>
                  <ol className="divide-y divide-white/[0.07]">
                    {g.rows.map((r, i) => (
                      <li
                        key={`${r.fullNameTh}-${i}`}
                        className="flex items-center gap-3 px-4 py-2.5"
                      >
                        <span className="w-6 text-right text-sm tabular-nums text-ink-faint">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 text-ink">
                          {r.fullNameTh}
                        </span>
                        {r.status === "pending_review" && (
                          <Pill tone="warn">{t.participants.pendingReview}</Pill>
                        )}
                      </li>
                    ))}
                  </ol>
                </Card>
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
}
