"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Select, Textarea } from "@/components/ui/form";
import { EmptyState, Pill } from "@/components/ui/feedback";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { RowAction } from "@/components/ui/RowAction";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { useToast } from "@/components/ui/Toast";
import { getAdminSecret } from "@/lib/admin-auth";
import { useLive } from "@/lib/live/useLive";
import { isResultDecided, roundsOf } from "@/lib/live/types";
import {
  deleteRound,
  getAnnouncement,
  getToken,
  listJudges,
  rotateToken,
  setAnnouncement,
} from "@/lib/live/client";
import { useAdminTournament } from "@/components/admin/AdminTournamentContext";
import type {
  JudgeInfo,
  LiveAnnouncement,
  LiveDivision,
  LiveMatch,
  LiveStanding,
} from "@/lib/live/types";

/** /admin/live — ONE tournament's live board: the one chosen in the admin
 *  shell's tournament picker. Divisions, pairings, wall lists, the announcement
 *  and the MacMahon/judge token are all that tournament's alone; switching the
 *  picker switches everything on this page. */
export function AdminLiveClient() {
  const { tournament, loading: tournamentLoading } = useAdminTournament();
  const tid = tournament?.id ?? null;
  const { divisions, matches, standings, loading, refetch } = useLive(tid);
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  // A failed token read used to be indistinguishable from "still loading": the
  // launcher rows showed "…", rotation was disabled, and an admin could copy
  // the literal ellipsis into launcher.properties on competition morning.
  const [tokenError, setTokenError] = useState(false);
  const [tokenReload, setTokenReload] = useState(0);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    setToken(null);
    setTokenError(false);
    if (!tid) return;
    let active = true;
    getToken(getAdminSecret(), tid)
      .then((t) => active && setToken(t))
      .catch(() => {
        if (!active) return;
        setToken(null);
        setTokenError(true);
      });
    return () => {
      active = false;
    };
  }, [tid, tokenReload]);

  const decided = matches.filter((m) => isResultDecided(m.result)).length;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`คัดลอก${label}แล้ว`, "success");
    } catch {
      toast.show("คัดลอกไม่สำเร็จ", "error");
    }
  }

  if (tournamentLoading || (tid && loading))
    return (
      <div aria-busy="true" className="space-y-6">
        <SkeletonRows count={5} />
      </div>
    );

  if (!tournament || !tid)
    return (
      <div className="space-y-6">
        <PageHeader title="ผลแข่งสด" description="อัปโหลดผลจับคู่จาก MacMahon และติดตามผลการแข่งขัน" />
        <EmptyState
          title="ยังไม่มีรายการแข่งขัน"
          description="สร้างรายการแข่งขันก่อน แล้วค่อยตั้งค่าผลแข่งสดของรายการนั้น"
        />
      </div>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="ผลแข่งสด"
        description={`${tournament.nameTh} — อัปโหลดผลจับคู่จาก MacMahon และติดตามผลการแข่งขันของรายการนี้`}
        action={
          <Link
            href="/admin/judges"
            className="focus-ring rounded-lg text-xs font-semibold text-brand-300 hover:text-brand-200"
          >
            จัดการกรรมการ →
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="รุ่นแข่ง" value={divisions.length} />
        <Stat label="คู่แข่งทั้งหมด" value={matches.length} />
        <Stat label="บันทึกผลแล้ว" value={decided} />
      </div>

      {/* Is this event actually ready to run? */}
      <ReadinessSection
        key={`rd-${tid}`}
        tournamentId={tid}
        divisionCount={divisions.length}
        token={token}
        tokenError={tokenError}
      />

      {/* Announcement banner on this tournament's /live board + judge console */}
      <AnnouncementSection key={tid} tournamentId={tid} />

      {/* Round completion + live toast on transition */}
      <RoundCompletionNotices key={`rc-${tid}`} divisions={divisions} matches={matches} />

      {/* Match schedule + who submitted each result */}
      <section>
        <SectionTitle className="mb-2">ตารางการแข่ง</SectionTitle>
        <MatchScheduleTable
          key={`ms-${tid}`}
          divisions={divisions}
          matches={matches}
          onRoundDeleted={refetch}
        />
      </section>

      {/* Wall list (ตารางคะแนน) uploaded from MacMahon's Export Wall List */}
      <section>
        <SectionTitle className="mb-2">Wall List (ตารางคะแนน)</SectionTitle>
        <WallListSection key={`wl-${tid}`} divisions={divisions} standings={standings} />
      </section>

      {/* MacMahon config — this tournament's own token */}
      <LauncherSection
        key={`tk-${tid}`}
        tournamentId={tid}
        tournamentName={tournament.nameTh}
        origin={origin}
        token={token}
        tokenError={tokenError}
        onRetryToken={() => setTokenReload((n) => n + 1)}
        onRotated={(t) => {
          setToken(t);
          setTokenError(false);
        }}
        onCopy={copy}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-bold text-ink sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-ink-tertiary">{label}</p>
    </Card>
  );
}

/** `value` is null while the token is unknown (loading or failed) — the copy
 *  button is disabled then, so the placeholder can never be pasted into
 *  launcher.properties as if it were the token. */
function ConfigRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string | null;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <span className="shrink-0 font-mono text-xs text-ink-tertiary sm:w-28">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-white/[0.06] px-2.5 py-2 text-xs text-ink-secondary">
          {value ?? "…"}
        </code>
        <RowAction
          tone="brand"
          onClick={() => value && onCopy(value, label)}
          disabled={!value}
          className="shrink-0"
        >
          คัดลอก
        </RowAction>
      </div>
    </div>
  );
}

/** Pre-event readiness (PRODUCT-7): the four prerequisites a judge needs before
 *  they can record a single result, each of which used to fail silently — and
 *  on the morning of the event, mid-first-round. Read-only; every check is a
 *  fact already on this page or one roster read away. */
function ReadinessSection({
  tournamentId,
  divisionCount,
  token,
  tokenError,
}: {
  tournamentId: string;
  divisionCount: number;
  token: string | null;
  tokenError: boolean;
}) {
  const [judges, setJudges] = useState<JudgeInfo[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setJudges(null);
    setFailed(false);
    listJudges(getAdminSecret(), tournamentId)
      .then((js) => active && setJudges(js))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [tournamentId]);

  const withName = (judges ?? []).filter((j) => j.firstNameTh?.trim()).length;
  const withDivision = (judges ?? []).filter((j) => j.defaultDivisionId).length;

  const checks: {
    label: string;
    state: "ok" | "warn" | "bad" | "unknown";
    detail: string;
  }[] = [
    {
      label: "token ของรายการ",
      state: token ? "ok" : tokenError ? "bad" : "unknown",
      detail: token
        ? "พร้อมใช้กับ MacMahon และคอนโซลกรรมการ"
        : tokenError
          ? "อ่านไม่สำเร็จ — ดูหัวข้อ launcher.properties ด้านล่าง"
          : "กำลังตรวจ…",
    },
    {
      label: "รุ่นแข่ง (อัปโหลดจาก MacMahon)",
      state: divisionCount > 0 ? "ok" : "bad",
      detail:
        divisionCount > 0
          ? `${divisionCount} รุ่นบนกระดานผลสด`
          : "ยังไม่มีรุ่น — อัปโหลดคู่จับรอบแรกจาก MacMahon ก่อน",
    },
    {
      label: "กรรมการของรายการนี้",
      state: judges === null ? "unknown" : judges.length > 0 ? "ok" : "bad",
      detail:
        judges === null
          ? failed
            ? "อ่านรายชื่อกรรมการไม่สำเร็จ"
            : "กำลังตรวจ…"
          : judges.length > 0
            ? `${judges.length} คน · กำหนดรุ่นเริ่มต้นแล้ว ${withDivision} คน`
            : "ยังไม่มีกรรมการ — เพิ่มที่หน้า “จัดการกรรมการ”",
    },
    {
      label: "กรรมการมีชื่อในโปรไฟล์",
      state:
        judges === null || judges.length === 0
          ? "unknown"
          : withName === judges.length
            ? "ok"
            : "warn",
      detail:
        judges === null || judges.length === 0
          ? "ตรวจได้เมื่อมีกรรมการแล้ว"
          : withName === judges.length
            ? "ทุกคนบันทึกผลได้"
            : `${judges.length - withName} คนยังไม่มีชื่อ (ภาษาไทย) — คอนโซลจะไม่ให้บันทึกผล`,
    },
  ];

  const blocking = checks.filter((c) => c.state === "bad").length;

  return (
    <section>
      <SectionTitle className="mb-2">ความพร้อมก่อนเริ่มแข่ง</SectionTitle>
      <Card className="divide-y divide-white/[0.07] p-0">
        {checks.map((c) => (
          <div key={c.label} className="flex items-start gap-3 px-4 py-3">
            <span
              className={
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-inset " +
                (c.state === "ok"
                  ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/25"
                  : c.state === "warn"
                    ? "bg-amber-400/15 text-amber-300 ring-amber-400/25"
                    : c.state === "bad"
                      ? "bg-rose-400/15 text-rose-300 ring-rose-400/25"
                      : "bg-white/10 text-white/50 ring-white/15")
              }
              aria-hidden="true"
            >
              {c.state === "ok" ? "✓" : c.state === "unknown" ? "–" : "!"}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{c.label}</p>
              <p className="mt-0.5 text-xs text-ink-tertiary">{c.detail}</p>
            </div>
          </div>
        ))}
        {blocking > 0 && (
          <p className="px-4 py-2.5 text-xs font-medium text-rose-300">
            ยังมี {blocking} ข้อที่กรรมการจะบันทึกผลไม่ได้
          </p>
        )}
      </Card>
    </section>
  );
}

/** The per-tournament write token: the value for THIS event's
 *  launcher.properties, and the [key] segment of its judge console URL — which
 *  judges now reach by the button on /t/<id> and /results, so the URL is never
 *  handed out by hand and is not shown here. Rotating the token invalidates
 *  this event's MacMahon config and any console page still open on the old
 *  token — and nothing else. */
function LauncherSection({
  tournamentId,
  tournamentName,
  origin,
  token,
  tokenError,
  onRetryToken,
  onRotated,
  onCopy,
}: {
  tournamentId: string;
  tournamentName: string;
  origin: string;
  token: string | null;
  tokenError: boolean;
  onRetryToken: () => void;
  onRotated: (token: string) => void;
  onCopy: (text: string, label: string) => void;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doRotate() {
    setBusy(true);
    try {
      const next = await rotateToken(getAdminSecret(), tournamentId);
      onRotated(next);
      setConfirm(false);
      toast.show("สร้าง token ใหม่แล้ว — launcher.properties เดิมของรายการนี้ใช้ไม่ได้อีก", "success");
    } catch {
      toast.show("สร้าง token ใหม่ไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SectionTitle className="mb-2">
        ตั้งค่าโปรแกรม MacMahon (launcher.properties)
      </SectionTitle>
      <Card className="space-y-2.5 p-4">
        <p className="text-xs text-ink-tertiary">
          ใส่ค่าสองบรรทัดนี้ในไฟล์ launcher.properties ของเครื่องที่รันรายการ{" "}
          <b className="text-ink-secondary">{tournamentName}</b> — token นี้ใช้ได้กับรายการนี้เท่านั้น
          รายการอื่นมี token ของตัวเอง
        </p>
        {tokenError && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100">
            <span>
              อ่าน token ของรายการนี้ไม่สำเร็จ — ค่าด้านล่างยังใช้ไม่ได้
              (ถ้าเพิ่งเข้าระบบนานแล้ว ให้เข้าสู่ระบบ admin ใหม่)
            </span>
            <RowAction tone="brand" onClick={onRetryToken} className="shrink-0">
              ลองอีกครั้ง
            </RowAction>
          </div>
        )}
        <ConfigRow label="tesuji.url" value={origin} onCopy={onCopy} />
        <ConfigRow label="tesuji.token" value={token} onCopy={onCopy} />
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] pt-2.5">
          <p className="text-xs text-ink-tertiary">
            token นี้คือสิทธิ์เขียนผลของรายการนี้ ถ้าหลุดออกไปนอกทีม ให้สร้าง token ใหม่
            แล้วแก้ launcher.properties · กรรมการไม่ต้องทำอะไร ปุ่ม “ระบบกรรมการ” จะพาไปที่ token ใหม่เอง
          </p>
          <RowAction tone="danger" onClick={() => setConfirm(true)} disabled={!token || busy} className="shrink-0">
            สร้าง token ใหม่
          </RowAction>
        </div>
      </Card>
      <ConfirmSheet
        open={confirm}
        onClose={() => !busy && setConfirm(false)}
        onConfirm={doRotate}
        title="สร้าง token ใหม่ของรายการนี้"
        description={`ค่า tesuji.token ปัจจุบันของ "${tournamentName}" จะใช้ไม่ได้ทันที โปรแกรม MacMahon ต้องแก้ launcher.properties ก่อนอัปโหลดรอบถัดไป · กรรมการที่เปิดคอนโซลค้างไว้ต้องกลับไปกดปุ่ม “ระบบกรรมการ” ใหม่อีกครั้ง (ปุ่มพาไปที่ token ใหม่ให้เอง) รายการอื่นไม่ได้รับผลกระทบ`}
        confirmLabel="สร้าง token ใหม่"
        loading={busy}
      />
    </section>
  );
}

const ANNOUNCEMENT_PRESETS = [
  "อีก 5 นาทีรอบถัดไปจะเริ่ม กรุณาประจำโต๊ะแข่งขัน",
  "พักรับประทานอาหารกลางวัน",
  "เชิญร่วมพิธีมอบรางวัลที่เวทีกลาง",
];

/** Compose the announcement banner shown on this tournament's /live board and
 *  judge console (stored in live_config under the tournament, picked up by
 *  their 3s snapshot poll). One announcement per tournament at a time: sending
 *  replaces the previous one, clearing hides the banner. */
function AnnouncementSection({ tournamentId }: { tournamentId: string }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [current, setCurrent] = useState<LiveAnnouncement | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getAnnouncement(tournamentId)
      .then((a) => {
        if (!active) return;
        setCurrent(a);
        // Seed the editor with what's already live so "edit + resend" works.
        if (a.text) {
          setText(a.text);
          setUrgent(a.urgent);
        }
      })
      .catch(() => active && setCurrent(null));
    return () => {
      active = false;
    };
  }, [tournamentId]);

  async function send(nextText: string, nextUrgent: boolean, doneMsg: string): Promise<boolean> {
    setBusy(true);
    try {
      await setAnnouncement(getAdminSecret(), tournamentId, nextText, nextUrgent);
      setCurrent({ text: nextText, urgent: nextUrgent, updatedAt: new Date().toISOString() });
      toast.show(doneMsg, "success");
      return true;
    } catch {
      toast.show(nextText ? "ส่งประกาศไม่สำเร็จ" : "ล้างประกาศไม่สำเร็จ", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (await send("", false, "ล้างประกาศแล้ว")) {
      setText("");
      setUrgent(false);
    }
  }

  const currentAt =
    current?.text && current.updatedAt
      ? new Date(current.updatedAt).toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <section>
      <SectionTitle className="mb-2">📢 ประกาศถึงหน้างาน (Live/Judge)</SectionTitle>
      <Card className="space-y-3 p-4">
        <p className="text-xs text-ink-tertiary">
          ข้อความขึ้นเป็นแถบประกาศบนหน้า Live และหน้ากรรมการของรายการนี้ภายใน ~3 วินาที — แสดงได้ทีละ 1
          ข้อความ ส่งใหม่จะแทนที่อันเดิม
        </p>
        <div className="flex flex-wrap gap-1.5">
          {ANNOUNCEMENT_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setText(p)}
              className="focus-ring press rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs text-ink-secondary transition hover:border-brand-400/50 hover:text-ink"
            >
              {p}
            </button>
          ))}
        </div>
        <Textarea
          rows={2}
          className="min-h-16"
          placeholder="พิมพ์ข้อความประกาศ เช่น รอบต่อไปเริ่มเวลา 13:00"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-secondary">
            <input
              type="checkbox"
              checked={urgent}
              onChange={(e) => setUrgent(e.target.checked)}
              className="h-4 w-4 accent-rose-500"
            />
            🔴 ด่วน (แถบสีแดง)
          </label>
          <div className="ml-auto flex items-center gap-2">
            {current?.text && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void handleClear()}>
                ล้างประกาศ
              </Button>
            )}
            <Button
              size="sm"
              loading={busy}
              disabled={!text.trim()}
              onClick={() =>
                void send(text.trim(), urgent, "ส่งประกาศแล้ว — ขึ้นหน้า Live/Judge ใน ~3 วินาที")
              }
            >
              ส่งประกาศ
            </Button>
          </div>
        </div>
        <p className="text-xs text-ink-tertiary">
          {current?.text ? (
            <>
              กำลังแสดง:{" "}
              <span className={current.urgent ? "font-semibold text-rose-300" : "font-semibold text-amber-300"}>
                «{current.text}»
              </span>
              {current.urgent ? " (ด่วน)" : ""}
              {currentAt ? ` — ประกาศเมื่อ ${currentAt} น.` : ""}
            </>
          ) : (
            "ยังไม่มีประกาศ"
          )}
        </p>
      </Card>
    </section>
  );
}

interface RoundStatus {
  division: LiveDivision;
  round: string | null;
  decided: number;
  total: number;
}

/** Current (= highest-numbered) round per division, with how many of its
 *  tables have a decided result. A division with no matches yet has no round. */
function currentRoundStatuses(divisions: LiveDivision[], matches: LiveMatch[]): RoundStatus[] {
  return divisions.map((d) => {
    const divMatches = matches.filter((m) => m.divisionId === d.id);
    const round = roundsOf(divMatches)[0] ?? null;
    if (!round) return { division: d, round: null, decided: 0, total: 0 };
    const roundMatches = divMatches.filter((m) => m.round === round);
    const decided = roundMatches.filter((m) => isResultDecided(m.result)).length;
    return { division: d, round, decided, total: roundMatches.length };
  });
}

/** Banner listing each division's current-round progress, + a one-time toast
 *  the moment a round transitions from incomplete to fully submitted. "ครบ"
 *  here means the current round only — the system has no fixed round count
 *  per division (MacMahon uploads one round at a time), so there's no way to
 *  know when a division's whole tournament is "done". */
function RoundCompletionNotices({
  divisions,
  matches,
}: {
  divisions: LiveDivision[];
  matches: LiveMatch[];
}) {
  const toast = useToast();
  const notifiedRef = useRef<Set<string> | null>(null);
  const statuses = currentRoundStatuses(divisions, matches);

  useEffect(() => {
    if (notifiedRef.current === null) {
      // First load: remember rounds that are already complete, but don't toast
      // for them — only new completions during this session should notify.
      notifiedRef.current = new Set(
        statuses
          .filter((s) => s.round && s.total > 0 && s.decided === s.total)
          .map((s) => `${s.division.id}|${s.round}`),
      );
      return;
    }
    for (const s of statuses) {
      if (!s.round || s.total === 0) continue;
      const key = `${s.division.id}|${s.round}`;
      const complete = s.decided === s.total;
      if (complete && !notifiedRef.current.has(key)) {
        notifiedRef.current.add(key);
        toast.show(`${s.division.name} รอบ ${s.round} ผลครบแล้ว! (${s.total}/${s.total})`, "success");
      } else if (!complete) {
        notifiedRef.current.delete(key); // allow re-notify if a result gets reverted later
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisions, matches, toast]);

  const withRounds = statuses.filter((s) => s.round);
  if (withRounds.length === 0) return null;

  return (
    <section>
      <SectionTitle className="mb-2">สถานะรอบปัจจุบัน</SectionTitle>
      <Card className="divide-y divide-white/[0.07] p-0">
        {withRounds.map((s) => {
          const complete = s.total > 0 && s.decided === s.total;
          return (
            <div key={s.division.id} className="flex items-center gap-3 px-4 py-2.5">
              <Pill tone={complete ? "good" : "warn"} size="sm">
                {complete ? "ครบ" : "รอผล"}
              </Pill>
              <p className="min-w-0 flex-1 truncate text-sm text-ink">
                {s.division.name} — รอบ {s.round}
              </p>
              <span className="shrink-0 text-xs text-ink-tertiary">
                {s.decided}/{s.total} โต๊ะ{complete ? " · ครบแล้ว" : ""}
              </span>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

// MacMahon's "Export Pairings" literal for an empty bye seat (same constant as
// BYE_NAME in public/live-assets/results.js).
const BYE_NAME = "ไม่มีผู้เข้าแข่งขัน";

/** Player name cell for the pairings table: BYE seats render dim/italic, and a
 *  side the judge marked absent gets a red ไม่มา chip + dimmed name (mirrors
 *  the /live pairings view). */
function PlayerNameCell({ name, absent }: { name: string; absent: boolean }) {
  if (name === BYE_NAME) {
    return <span className="italic text-ink-faint">{name}</span>;
  }
  return (
    <>
      <span className={absent ? "text-ink-faint" : undefined}>{name}</span>
      {absent && (
        <span className="ml-1.5 inline-block rounded-full border border-red-400/30 bg-red-500/15 px-1.5 text-[10px] font-bold leading-normal text-red-400">
          ไม่มา
        </span>
      )}
    </>
  );
}

function MatchScheduleTable({
  divisions,
  matches,
  onRoundDeleted,
}: {
  divisions: LiveDivision[];
  matches: LiveMatch[];
  onRoundDeleted: () => void;
}) {
  const toast = useToast();
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [round, setRound] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!divisionId && divisions[0]) setDivisionId(divisions[0].id);
  }, [divisions, divisionId]);

  const divMatches = matches.filter((m) => m.divisionId === divisionId);
  const rounds = roundsOf(divMatches);
  const activeRound = round || rounds[0] || "";
  const rows = divMatches
    .filter((m) => m.round === activeRound)
    .sort((a, b) => {
      const na = parseFloat(a.table);
      const nb = parseFloat(b.table);
      return Number.isNaN(na) || Number.isNaN(nb) ? a.table.localeCompare(b.table) : na - nb;
    });

  function handleDeleteRound() {
    if (!divisionId || !activeRound || rows.length === 0) return;
    setConfirmDelete(true);
  }

  async function doDeleteRound() {
    if (!divisionId || !activeRound) return;
    setDeleting(true);
    try {
      await deleteRound(getAdminSecret(), divisionId, activeRound);
      toast.show(`ลบผลจับคู่รอบ ${activeRound} แล้ว`, "success");
      setConfirmDelete(false);
      setRound(""); // the deleted round is gone — fall back to the newest remaining
      onRoundDeleted();
    } catch {
      toast.show("ลบผลจับคู่ไม่สำเร็จ", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value={divisionId}
          onChange={(e) => {
            setDivisionId(e.target.value);
            setRound("");
          }}
          className="sm:w-56"
        >
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select value={activeRound} onChange={(e) => setRound(e.target.value)} className="sm:w-32">
          {rounds.map((r) => (
            <option key={r} value={r}>
              รอบ {r}
            </option>
          ))}
        </Select>
        <RowAction
          tone="danger"
          onClick={handleDeleteRound}
          disabled={deleting || rows.length === 0}
          className="disabled:pointer-events-none disabled:opacity-40 sm:ml-auto"
        >
          {deleting ? "กำลังลบ…" : "🗑 ลบผลจับคู่รอบนี้"}
        </RowAction>
      </div>

      {/* Desktop / tablet: full pairing table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.07] text-xs uppercase tracking-wider text-ink-faint">
              <th className="px-2 py-2 font-medium">โต๊ะ</th>
              <th className="px-2 py-2 font-medium">ชื่อ</th>
              <th className="px-2 py-2 text-center font-medium">ผล</th>
              <th className="px-2 py-2 font-medium">ชื่อ</th>
              <th className="px-2 py-2 font-medium">ส่งผลโดย</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-xs text-ink-faint">
                  ไม่มีคู่แข่งในรอบนี้
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id} className="text-ink">
                  <td className="px-2 py-2 text-ink-secondary">{m.table}</td>
                  <td className="px-2 py-2">
                    <PlayerNameCell name={m.black} absent={m.absent === "B" || m.absent === "BOTH"} />
                  </td>
                  <td className="px-2 py-2 text-center text-ink-secondary">{m.result}</td>
                  <td className="px-2 py-2">
                    <PlayerNameCell name={m.white} absent={m.absent === "W" || m.absent === "BOTH"} />
                  </td>
                  <td className="px-2 py-2 text-ink-secondary">{m.submittedBy || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per match. The table's two "ชื่อ" columns don't say
          which colour is which, so each name is labelled ดำ / ขาว here. */}
      <div className="space-y-2 sm:hidden">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-ink-faint">ไม่มีคู่แข่งในรอบนี้</p>
        ) : (
          rows.map((m) => (
            <div
              key={m.id}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-lg bg-white/[0.06] px-2 py-0.5 text-xs font-semibold text-ink-secondary ring-1 ring-inset ring-white/10">
                  โต๊ะ {m.table}
                </span>
                <span className="font-mono text-sm text-ink-secondary">{m.result || "—"}</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="flex w-11 shrink-0 items-center gap-1.5 text-[11px] font-medium text-ink-tertiary">
                    <span className="h-2.5 w-2.5 rounded-full bg-neutral-950 ring-1 ring-inset ring-white/30" />
                    ดำ
                  </span>
                  <span className="min-w-0 text-sm text-ink">
                    <PlayerNameCell name={m.black} absent={m.absent === "B" || m.absent === "BOTH"} />
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex w-11 shrink-0 items-center gap-1.5 text-[11px] font-medium text-ink-tertiary">
                    <span className="h-2.5 w-2.5 rounded-full bg-white" />
                    ขาว
                  </span>
                  <span className="min-w-0 text-sm text-ink">
                    <PlayerNameCell name={m.white} absent={m.absent === "W" || m.absent === "BOTH"} />
                  </span>
                </div>
              </div>
              <div className="mt-2 border-t border-white/[0.07] pt-2 text-xs text-ink-tertiary">
                ส่งผลโดย {m.submittedBy || "—"}
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDeleteRound}
        title="ลบผลการจับคู่รอบนี้"
        description={`ลบผลการจับคู่ รอบ ${activeRound} ของ "${
          divisions.find((d) => d.id === divisionId)?.name ?? divisionId
        }" ทั้งหมด ${rows.length} โต๊ะ? การลบไม่สามารถย้อนกลับได้ (อัปโหลดใหม่จาก MacMahon ได้ภายหลัง)`}
        confirmLabel="ลบรอบนี้"
        loading={deleting}
      >
        {rows.filter((m) => isResultDecided(m.result)).length > 0 && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
            ⚠️ ผลที่บันทึกแล้ว{" "}
            {rows.filter((m) => isResultDecided(m.result)).length} โต๊ะในรอบนี้จะถูกลบไปด้วย
          </div>
        )}
      </ConfirmSheet>
    </Card>
  );
}

/** Wall list (ตารางคะแนน) per division, as uploaded by MacMahon's Export Wall
 *  List. Columns vary with whatever the .jar exported, so headers/rows render
 *  as-is; the list is overwritten each round, so updated_at shows freshness. */
function WallListSection({
  divisions,
  standings,
}: {
  divisions: LiveDivision[];
  standings: LiveStanding[];
}) {
  const [divisionId, setDivisionId] = useState("");

  // Default to the first division that actually has a wall list, else the first.
  useEffect(() => {
    if (divisionId || divisions.length === 0) return;
    const has = new Set(standings.map((s) => s.divisionId));
    setDivisionId((divisions.find((d) => has.has(d.id)) ?? divisions[0]).id);
  }, [divisions, standings, divisionId]);

  const standing = standings.find((s) => s.divisionId === divisionId);
  const hasRows = !!standing && standing.rows.length > 0;
  const updatedAt = standing?.updatedAt
    ? new Date(standing.updatedAt).toLocaleString("th-TH", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={divisionId} onChange={(e) => setDivisionId(e.target.value)} className="sm:w-56">
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Pill tone={hasRows ? "good" : "warn"} size="sm">
            {hasRows ? `${standing!.rows.length} คน` : "ยังไม่มีข้อมูล"}
          </Pill>
          {updatedAt && (
            <span className="text-xs text-ink-tertiary">อัปเดต {updatedAt}</span>
          )}
        </div>
      </div>

      {!hasRows ? (
        <p className="py-6 text-center text-xs text-ink-faint">
          ยังไม่มี Wall list ของรุ่นนี้ — อัปโหลดจากโปรแกรม MacMahon (Export Wall List)
        </p>
      ) : (
        <>
          {/* The wall-list columns come from MacMahon's export and aren't fixed,
              so the table scrolls sideways on mobile — hint that it does. */}
          <p className="text-[11px] text-ink-faint sm:hidden">
            เลื่อนซ้าย-ขวาเพื่อดูคอลัมน์ทั้งหมด →
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] text-xs uppercase tracking-wider text-ink-faint">
                  {standing!.headers.map((h, i) => (
                    <th key={i} className={`px-2 py-2 font-medium ${i === 0 ? "text-center" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {standing!.rows.map((row, ri) => (
                  <tr key={ri} className="text-ink">
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={
                          ci === 0
                            ? "px-2 py-2 text-center text-ink-secondary"
                            : ci === 1
                              ? "whitespace-nowrap px-2 py-2 font-medium text-ink"
                              : "whitespace-nowrap px-2 py-2 text-ink-secondary"
                        }
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
