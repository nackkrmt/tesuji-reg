"use client";

import { useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import {
  AwardLimitStatus,
  GoPlayerSource,
  RankCandidate,
  RankSearchResult,
  RankStatus,
} from "@/lib/data/types";
import { powerToLabel, RANKS } from "@/lib/rank";
import { useDataLayer } from "@/lib/data/store";
import { getByPath } from "@/lib/utils";
import { Field } from "@/components/ui/form";
import { Combobox } from "@/components/ui/Combobox";
import { Spinner } from "@/components/ui/feedback";
import { useI18n } from "@/lib/i18n";

export function RankPicker({ prefix = "" }: { prefix?: string }) {
  const { t, locale } = useI18n();
  const { watch, setValue, formState } = useFormContext();
  const dl = useDataLayer();
  const name = (n: string) => `${prefix}${n}`;

  const sourceLabel: Record<GoPlayerSource, string> = {
    dan: t.rank.sourceDan,
    kyu: t.rank.sourceKyu,
    award: t.rank.sourceAward,
  };
  const matchLabel: Record<RankCandidate["matchType"], string> = {
    exact: t.rank.matchExact,
    normalized: t.rank.matchNormalized,
    fuzzy: t.rank.matchFuzzy,
  };

  const firstNameTh = ((watch(name("firstNameTh")) as string) ?? "").trim();
  const lastNameTh = ((watch(name("lastNameTh")) as string) ?? "").trim();
  const powerLevel = (watch(name("powerLevel")) as string) ?? "";
  const rankStatus = (watch(name("rankStatus")) as RankStatus) ?? "pending";
  const matchedId = watch(name("matchedGoPlayerId")) as string | null;
  const errMsg = (
    getByPath(formState.errors, name("powerLevel")) as
      | { message?: string }
      | undefined
  )?.message;

  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<RankSearchResult | null>(null);
  const [searchErr, setSearchErr] = useState<string>();
  const [awardBan, setAwardBan] = useState<AwardLimitStatus | null>(null);
  // Manual override: the user says the detected rank is wrong and picks their own.
  const [manual, setManual] = useState(false);

  // Editing the name invalidates the previous search — clear the candidate list,
  // error, and award warning so none of them advise a name no longer entered.
  useEffect(() => {
    setResult(null);
    setSearchErr(undefined);
    setAwardBan(null);
  }, [firstNameTh, lastNameTh]);

  function applyCandidate(c: RankCandidate) {
    setValue(name("powerLevel"), String(c.powerLevel), { shouldValidate: true });
    setValue(name("rankStatus"), "verified");
    setValue(name("matchedGoPlayerId"), c.id);
    setResult(null);
  }

  /** Not in any database → 15 kyu (power 0). Accepted as-is, no approval needed. */
  function applyBeginnerDefault() {
    setValue(name("powerLevel"), "0", { shouldValidate: true });
    setValue(name("rankStatus"), "verified");
    setValue(name("matchedGoPlayerId"), null);
  }

  /** User-declared rank (the DB match was wrong / they aren't listed). It's
   *  self-reported, so mark it pending for admin review and drop any DB link. */
  function applyManual(power: string) {
    setValue(name("powerLevel"), power, { shouldValidate: true });
    setValue(name("rankStatus"), "pending");
    setValue(name("matchedGoPlayerId"), null);
    setResult(null);
    setManual(false);
  }

  // 15 kyu … 8 dan, labelled in the active language.
  const rankOptions = RANKS.map((r) => ({
    value: String(r.power),
    label: powerToLabel(r.power, locale),
  }));

  async function search() {
    if (!firstNameTh || !lastNameTh) {
      setSearchErr(t.rank.enterNameFirst);
      return;
    }
    setSearching(true);
    setSearchErr(undefined);
    setResult(null);
    setAwardBan(null);
    try {
      // The award-ceiling check is advisory (reserve_seats is the hard gate), so
      // never let its failure block rank verification.
      const [r, ban] = await Promise.all([
        dl.searchRank(firstNameTh, lastNameTh),
        dl.checkAwardLimit(firstNameTh, lastNameTh).catch(() => null),
      ]);
      setResult(r);
      setAwardBan(ban);
      if (r.status === "matched") applyCandidate(r.candidate);
      if (r.status === "not_found") applyBeginnerDefault();
    } catch (e) {
      setSearchErr((e as Error).message || t.rank.searchFailed);
    } finally {
      setSearching(false);
    }
  }

  const hasValue = powerLevel !== "";
  const candidates =
    result && result.status !== "not_found" ? result.candidates : [];
  const notFound = result?.status === "not_found";

  return (
    <Field
      label={t.rank.label}
      required
      error={errMsg}
      hint={t.rank.hint}
    >
      <div className="space-y-3">
        {manual ? (
          <div className="space-y-2">
            <Combobox
              value={powerLevel || null}
              onChange={applyManual}
              options={rankOptions}
              placeholder={t.rank.chooseManual}
            />
            <button
              type="button"
              onClick={() => setManual(false)}
              className="text-sm font-medium text-white/55 transition hover:text-white/80"
            >
              {t.common.cancel}
            </button>
          </div>
        ) : (
          <>
        {/* not-found → beginner default */}
        {notFound && candidates.length === 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <div className="text-sm">
              <span className="font-semibold text-white/70">
                {t.rank.notFoundAssign}
              </span>
              <span className="ml-2 font-semibold text-white/90">{t.rank.fifteenKyu}</span>
              <span className="ml-1 text-white/45">{t.rank.beginner}</span>
            </div>
          </div>
        )}

        {/* current value badge (verified from DB) */}
        {hasValue && !notFound && candidates.length === 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2">
            <div className="text-sm">
              <span className="font-semibold text-emerald-300">
                {rankStatus === "verified"
                  ? t.rank.verifiedFromDb
                  : t.rank.currentLevel}
              </span>
              <span className="ml-2 text-white/80">
                {powerToLabel(Number(powerLevel), locale)}
              </span>
            </div>
          </div>
        )}

        {/* search button */}
        {candidates.length === 0 && (
          <button
            type="button"
            onClick={search}
            disabled={searching}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500/15 px-4 text-sm font-semibold text-brand-200 ring-1 ring-inset ring-brand-400/25 transition hover:bg-brand-500/25 disabled:opacity-60"
          >
            {searching && <Spinner className="h-4 w-4" />}
            {searching
              ? t.rank.searching
              : hasValue
                ? t.rank.recheck
                : t.rank.checkDb}
          </button>
        )}

        {searchErr && <p className="text-sm text-rose-300">{searchErr}</p>}

        {/* 1-kyu award ceiling — advisory (the hard gate is reserve_seats) */}
        {awardBan?.banned && (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2.5">
            <p className="text-sm font-semibold text-rose-200">
              {t.rank.awardBanWarningTitle}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-rose-100/80">
              {t.rank.awardBanWarningBody(awardBan.count)}
            </p>
          </div>
        )}

        {/* candidate list (matched / multiple) */}
        {candidates.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-white/55">
              {result?.status === "matched"
                ? t.rank.matchedFound
                : t.rank.nearMatches(candidates.length)}
            </p>
            {candidates.map((c) => {
              const isMatched = matchedId === c.id;
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => applyCandidate(c)}
                  className={
                    isMatched
                      ? "block w-full rounded-2xl border-2 border-brand-500/70 bg-brand-500/15 p-3 text-left"
                      : "block w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-brand-400/40 hover:bg-brand-500/10"
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white/90">
                      {c.firstNameTh} {c.lastNameTh}
                    </span>
                    <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                      {c.rank}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/45">
                    <span>{sourceLabel[c.source]}</span>
                    <span>·</span>
                    <span>{matchLabel[c.matchType]}</span>
                    {c.matchType === "fuzzy" && (
                      <span>· {Math.round(c.similarityScore * 100)}%</span>
                    )}
                  </div>
                  {c.evidence.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-white/55">
                      {c.evidence.map((e, i) => (
                        <li key={i}>· {e}</li>
                      ))}
                    </ul>
                  )}
                  {isMatched && (
                    <p className="mt-1 text-xs font-semibold text-brand-300">
                      {t.rank.selected}
                    </p>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setManual(true)}
              className="text-sm font-medium text-white/55 underline-offset-2 transition hover:text-white/80 hover:underline"
            >
              {t.rank.notInList}
            </button>
          </div>
        )}

        {/* override trigger — the detected rank is wrong → pick your own */}
        {hasValue && candidates.length === 0 && (
          <button
            type="button"
            onClick={() => setManual(true)}
            className="text-sm font-medium text-brand-300 underline-offset-2 transition hover:text-brand-200 hover:underline"
          >
            {t.rank.notThisRank}
          </button>
        )}
          </>
        )}
      </div>
    </Field>
  );
}
