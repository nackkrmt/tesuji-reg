"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicHeader } from "@/components/PublicHeader";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useLive } from "@/lib/live/useLive";
import { roundsOf, type LiveMatch } from "@/lib/live/types";
import { checkToken, setCheckin, submitResult } from "@/lib/live/client";

const TH = {
  title: "กรรมการ · บันทึกผล",
  checking: "กำลังตรวจสอบลิงก์…",
  invalidTitle: "ลิงก์ไม่ถูกต้อง",
  invalidDesc: "ลิงก์กรรมการนี้ใช้ไม่ได้หรือหมดอายุแล้ว ติดต่อผู้จัดเพื่อขอลิงก์ใหม่",
  emptyTitle: "ยังไม่มีข้อมูลการแข่งขัน",
  emptyDesc: "รอผู้จัด/MacMahon อัปโหลดคู่จับก่อน แล้วจึงบันทึกผลได้",
  round: "รอบ",
  table: "โต๊ะ",
  blackWin: "ดำชนะ",
  whiteWin: "ขาวชนะ",
  clear: "ล้างผล",
  checkedIn: "มาแล้ว",
  checkIn: "เช็คชื่อ",
  saved: "บันทึกผลแล้ว",
  saveFailed: "บันทึกไม่สำเร็จ",
  noMatches: "ยังไม่มีคู่แข่งในรอบนี้",
};

export function JudgeClient({ secret }: { secret: string }) {
  const [authState, setAuthState] = useState<"checking" | "ok" | "bad">("checking");

  useEffect(() => {
    let alive = true;
    checkToken(secret).then((ok) => {
      if (alive) setAuthState(ok ? "ok" : "bad");
    });
    return () => {
      alive = false;
    };
  }, [secret]);

  if (authState === "checking") {
    return (
      <>
        <PublicHeader title={TH.title} />
        <main className="mx-auto max-w-app px-4 pb-dock pt-10">
          <CenterLoader label={TH.checking} />
        </main>
      </>
    );
  }

  if (authState === "bad") {
    return (
      <>
        <PublicHeader title={TH.title} />
        <main className="mx-auto max-w-app px-4 pb-dock pt-10">
          <EmptyState title={TH.invalidTitle} description={TH.invalidDesc} />
        </main>
      </>
    );
  }

  return <JudgeConsole secret={secret} />;
}

function JudgeConsole({ secret }: { secret: string }) {
  const { divisions, matches, loading, refetch } = useLive();
  const toast = useToast();
  const [divId, setDivId] = useState<string | null>(null);
  const [round, setRound] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // match id being written

  useEffect(() => {
    if (divisions.length === 0) return;
    if (!divId || !divisions.some((d) => d.id === divId)) setDivId(divisions[0].id);
  }, [divisions, divId]);

  const divMatches = useMemo(
    () => matches.filter((m) => m.divisionId === divId),
    [matches, divId],
  );
  const rounds = useMemo(() => roundsOf(divMatches), [divMatches]);

  useEffect(() => {
    if (rounds.length === 0) {
      if (round !== null) setRound(null);
    } else if (!round || !rounds.includes(round)) {
      setRound(rounds[0]);
    }
  }, [rounds, round]);

  const roundMatches = divMatches
    .filter((m) => m.round === round)
    .sort((a, b) => {
      const na = parseInt(a.table, 10);
      const nb = parseInt(b.table, 10);
      return Number.isNaN(na) || Number.isNaN(nb)
        ? a.table.localeCompare(b.table)
        : na - nb;
    });

  async function write(fn: () => Promise<void>, matchId: string) {
    setBusy(matchId);
    try {
      await fn();
      refetch();
      toast.show(TH.saved, "success");
    } catch {
      toast.show(TH.saveFailed, "error");
    } finally {
      setBusy(null);
    }
  }

  async function onResult(m: LiveMatch, result: string) {
    if (!divId || !round) return;
    await write(
      () => submitResult(secret, divId, round, m.table, result, undefined, "judge"),
      m.id,
    );
  }

  async function onToggleCheckin(m: LiveMatch) {
    if (!divId || !round) return;
    const next = m.checkIn ? "" : "1";
    await write(() => setCheckin(secret, divId, round, m.table, next), m.id);
  }

  return (
    <>
      <PublicHeader title={TH.title} />
      <main className="mx-auto max-w-app px-4 pb-dock pt-4">
        {loading ? (
          <CenterLoader label="กำลังโหลด…" />
        ) : divisions.length === 0 ? (
          <EmptyState title={TH.emptyTitle} description={TH.emptyDesc} />
        ) : (
          <div className="space-y-4">
            {divisions.length > 1 && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {divisions.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDivId(d.id)}
                    className={cn(
                      "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition",
                      d.id === divId
                        ? "bg-brand-600 text-white"
                        : "glass text-white/60 hover:text-white/90",
                    )}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            )}

            {rounds.length > 0 && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {rounds.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRound(r)}
                    className={cn(
                      "shrink-0 rounded-xl px-3.5 py-1.5 text-sm font-semibold transition",
                      r === round
                        ? "bg-white/15 text-white ring-1 ring-inset ring-white/25"
                        : "text-white/45 hover:text-white/80",
                    )}
                  >
                    {TH.round} {r}
                  </button>
                ))}
              </div>
            )}

            {roundMatches.length === 0 ? (
              <EmptyState title={TH.noMatches} />
            ) : (
              <div className="space-y-3">
                {roundMatches.map((m) => (
                  <MatchEditor
                    key={m.id}
                    match={m}
                    busy={busy === m.id}
                    onBlackWin={() => onResult(m, "1-0")}
                    onWhiteWin={() => onResult(m, "0-1")}
                    onClear={() => onResult(m, "?-?")}
                    onToggleCheckin={() => onToggleCheckin(m)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function MatchEditor({
  match,
  busy,
  onBlackWin,
  onWhiteWin,
  onClear,
  onToggleCheckin,
}: {
  match: LiveMatch;
  busy: boolean;
  onBlackWin: () => void;
  onWhiteWin: () => void;
  onClear: () => void;
  onToggleCheckin: () => void;
}) {
  const blackWon = match.result === "1-0";
  const whiteWon = match.result === "0-1";
  return (
    <Card className={cn("p-4 transition", busy && "opacity-60")}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/40">
          {TH.table} {match.table}
        </span>
        <button
          onClick={onToggleCheckin}
          disabled={busy}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition",
            match.checkIn
              ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/25"
              : "text-white/50 ring-white/15 hover:text-white/80",
          )}
        >
          {match.checkIn ? `✓ ${TH.checkedIn}` : TH.checkIn}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <WinnerButton
          label={match.black || "—"}
          side="black"
          active={blackWon}
          disabled={busy}
          onClick={onBlackWin}
        />
        <WinnerButton
          label={match.white || "—"}
          side="white"
          active={whiteWon}
          disabled={busy}
          onClick={onWhiteWin}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-xs text-white/40">{match.result}</span>
        {(blackWon || whiteWon) && (
          <button
            onClick={onClear}
            disabled={busy}
            className="text-xs font-medium text-white/40 hover:text-rose-300"
          >
            {TH.clear}
          </button>
        )}
      </div>
    </Card>
  );
}

function WinnerButton({
  label,
  side,
  active,
  disabled,
  onClick,
}: {
  label: string;
  side: "black" | "white";
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center transition active:scale-[0.98]",
        active
          ? "border-emerald-400/40 bg-emerald-400/15"
          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ring-1",
          side === "black"
            ? "bg-black text-white ring-white/30"
            : "bg-white text-black ring-black/20",
        )}
      >
        ●
      </span>
      <span
        className={cn(
          "line-clamp-2 text-sm font-semibold",
          active ? "text-emerald-200" : "text-white/85",
        )}
      >
        {label}
      </span>
      {active && (
        <span className="text-[10px] font-bold uppercase text-emerald-300">
          ✓ ชนะ
        </span>
      )}
    </button>
  );
}
