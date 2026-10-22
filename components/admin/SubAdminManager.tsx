"use client";

import { ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/PageHeader";
import { Field, TextInput } from "@/components/ui/form";
import { CenterLoader, EmptyState, ErrorState } from "@/components/ui/feedback";
import { RowAction } from "@/components/ui/RowAction";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { getAdminSecret } from "@/lib/admin-auth";
import { listSubAdmins, setSubAdminRole } from "@/lib/live/client";
import { useAdminTournament } from "@/components/admin/AdminTournamentContext";
import type { SubAdminInfo } from "@/lib/live/types";

/** Every write here comes back with a stable code; map each one so the admin
 *  knows what to do next instead of reading "ไม่สำเร็จ". */
function subAdminErrorMessage(raw: string, fallback: string): string {
  if (raw.includes("ACCOUNT_NOT_FOUND"))
    return "ไม่พบบัญชีนี้ในระบบ — ให้สมัครสมาชิกก่อน";
  if (raw.includes("ACCOUNT_IS_ADMIN"))
    return "บัญชีนี้เป็นผู้ดูแลระบบอยู่แล้ว — เข้าได้ทุกรายการโดยไม่ต้องตั้ง";
  if (raw.includes("UNAUTHORIZED")) return "ไม่มีสิทธิ์ (เข้าสู่ระบบ admin ใหม่)";
  if (raw.includes("TOURNAMENT_NOT_FOUND"))
    return "ไม่พบรายการแข่งขันนี้ (อาจถูกลบไปแล้ว) — รีเฟรชหน้านี้";
  return fallback;
}

/** SubAdmin roster for ONE tournament (/admin/subadmins, scoped by the admin
 *  shell's tournament picker; admin-only). Add an existing account as a
 *  SubAdmin of this tournament and remove with a confirm step. Each tournament
 *  keeps its own list — being a SubAdmin here grants nothing on any other
 *  event, and an account with no rows left loses the back office entirely.
 *  Accounts are never created here (ACCOUNT_NOT_FOUND means the person must
 *  sign up first). */
export function SubAdminManager() {
  const { tournament, loading: tournamentLoading } = useAdminTournament();
  const tid = tournament?.id ?? null;
  const toast = useToast();
  const [subadmins, setSubadmins] = useState<SubAdminInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  const [revoking, setRevoking] = useState<SubAdminInfo | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!tid) {
      setSubadmins([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(false);
    try {
      setSubadmins(await listSubAdmins(getAdminSecret(), tid));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Switching tournaments swaps the whole roster; drop any half-typed state.
    setEmail("");
    setRevoking(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid]);

  async function addSubAdmin() {
    const trimmed = email.trim();
    if (!trimmed || busy || !tid) return;
    setBusy(true);
    try {
      await setSubAdminRole(getAdminSecret(), tid, trimmed, true);
      toast.show("ตั้งเป็นผู้ช่วยแอดมินของรายการนี้แล้ว", "success");
      setEmail("");
      await load();
    } catch (e) {
      toast.show(
        subAdminErrorMessage((e as Error).message, "ตั้งเป็นผู้ช่วยแอดมินไม่สำเร็จ"),
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!revoking || saving || !tid) return;
    setSaving(true);
    try {
      await setSubAdminRole(getAdminSecret(), tid, revoking.email, false);
      toast.show("ถอดออกจากผู้ช่วยแอดมินของรายการนี้แล้ว", "success");
      setRevoking(null);
      await load();
    } catch (e) {
      toast.show(
        subAdminErrorMessage((e as Error).message, "ถอดสิทธิ์ไม่สำเร็จ"),
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  // A SubAdmin may open this tournament's judge console, which refuses anyone
  // without a Thai first name on their profile (it signs each result with it).
  const notReady = subadmins.filter((s) => !s.firstNameTh?.trim());

  // While the list is loading (or failed), a literal 0 would read as "nobody"
  // — show a dash until real numbers exist.
  const statValue = (n: number) => (loading || loadError ? "–" : n);

  if (tournamentLoading) return <CenterLoader label="กำลังโหลด…" />;
  if (!tournament || !tid)
    return (
      <EmptyState
        title="ยังไม่มีรายการแข่งขัน"
        description="สร้างรายการแข่งขันก่อน แล้วค่อยตั้งผู้ช่วยแอดมินของรายการนั้น"
      />
    );

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-secondary">
        ผู้ช่วยแอดมินของ <b className="text-ink">{tournament.nameTh}</b> — เข้าหน้าหลังบ้านได้เฉพาะรายการนี้:
        ใบสมัคร ถอนตัว เปลี่ยนรุ่น โค้ดส่วนลด รุ่น กฎกติกา ผลแข่งสด กรรมการ และคอนโซลกรรมการ
        ไม่เห็นฐานข้อมูลระดับฝีมือ สถาบัน รีเซ็ต และสร้างรายการใหม่ไม่ได้
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <Stat tone="brand" icon={<StatIcon d={ICON.users} />} label="ผู้ช่วยแอดมินทั้งหมด" value={statValue(subadmins.length)} />
        <Stat tone="amber" icon={<StatIcon d={ICON.alert} />} label="ยังไม่มีชื่อในโปรไฟล์" value={statValue(notReady.length)} />
      </div>

      {notReady.length > 0 && !loading && !loadError && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3.5 text-sm text-amber-100">
          <p className="font-semibold">
            {notReady.length} คนยังส่งผลในคอนโซลกรรมการไม่ได้
          </p>
          <p className="mt-1 text-amber-100/85">
            ยังไม่มีชื่อ (ภาษาไทย) ในโปรไฟล์:{" "}
            {notReady.map((s) => s.email).join(", ")} — หน้าหลังบ้านใช้ได้ปกติ
            แต่ถ้าจะส่งผลแข่งเองต้องกรอกชื่อในหน้าโปรไฟล์ก่อนวันแข่ง
          </p>
        </div>
      )}

      {/* Add */}
      <section>
        <SectionTitle className="mb-2">เพิ่มผู้ช่วยแอดมิน</SectionTitle>
        <Card className="p-4 sm:p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addSubAdmin();
            }}
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
          >
            <Field label="อีเมลของบัญชี" htmlFor="subadmin-email">
              <TextInput
                id="subadmin-email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="off"
              />
            </Field>
            <Button type="submit" loading={busy} disabled={!email.trim()}>
              ตั้งเป็นผู้ช่วยแอดมิน
            </Button>
          </form>
          <p className="mt-3 text-xs text-ink-faint">
            ต้องเป็นบัญชีที่สมัครสมาชิกไว้แล้ว — หากไม่พบอีเมล ให้เจ้าตัวสมัครก่อนแล้วลองอีกครั้ง
            สิทธิ์มีผลเมื่อเขาเข้าสู่ระบบหลังบ้าน (หรือโหลดหน้าใหม่)
          </p>
        </Card>
      </section>

      {/* Current list */}
      <section>
        <SectionTitle className="mb-2">ผู้ช่วยแอดมินปัจจุบัน ({subadmins.length})</SectionTitle>
        {loading ? (
          <CenterLoader label="กำลังโหลด…" />
        ) : loadError ? (
          <ErrorState onRetry={load} />
        ) : subadmins.length === 0 ? (
          <EmptyState
            title="ยังไม่มีผู้ช่วยแอดมิน"
            description="เพิ่มคนแรกได้จากฟอร์มด้านบน"
          />
        ) : (
          <Card className="divide-y divide-white/[0.07] p-0">
            {subadmins.map((s) => (
              <SubAdminRow key={s.accountId} subadmin={s} onRevoke={() => setRevoking(s)} />
            ))}
          </Card>
        )}
      </section>

      {/* Revoke confirm */}
      <Sheet
        open={!!revoking}
        onClose={() => {
          if (!saving) setRevoking(null);
        }}
        title="ถอดสิทธิ์ผู้ช่วยแอดมิน"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setRevoking(null)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button variant="danger" fullWidth onClick={confirmRevoke} loading={saving}>
              ถอดสิทธิ์
            </Button>
          </div>
        }
      >
        {revoking && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="font-semibold text-ink">{revoking.firstNameTh || revoking.email}</p>
              <p className="mt-0.5 text-xs text-ink-tertiary">{revoking.email}</p>
            </div>
            <p className="text-sm leading-relaxed text-ink-secondary">
              บัญชีนี้จะเข้าหน้าหลังบ้านของรายการนี้ไม่ได้อีก (ทุกคำสั่งถูกปฏิเสธทันที
              และเมนูหายเมื่อโหลดหน้าใหม่) ถ้าไม่ได้เป็นผู้ช่วยแอดมินของรายการอื่น
              ก็จะเข้าหลังบ้านไม่ได้เลย — รายชื่อกรรมการของเขา (ถ้ามี) ไม่ถูกแตะ
            </p>
          </div>
        )}
      </Sheet>
    </div>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────────

function SubAdminRow({
  subadmin,
  onRevoke,
}: {
  subadmin: SubAdminInfo;
  onRevoke: () => void;
}) {
  const display = subadmin.firstNameTh || subadmin.email;
  const noProfileName = !subadmin.firstNameTh?.trim();
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-200 ring-1 ring-inset ring-brand-400/25">
        {display.trim().charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{display}</p>
        <p className="truncate text-xs text-ink-tertiary">{subadmin.email}</p>
        {noProfileName && (
          <p className="mt-0.5 text-xs font-medium text-amber-300">
            ยังไม่มีชื่อในโปรไฟล์ — ส่งผลในคอนโซลกรรมการไม่ได้
          </p>
        )}
      </div>
      <RowAction tone="danger" onClick={onRevoke}>
        ถอดสิทธิ์
      </RowAction>
    </div>
  );
}

const statTone = {
  brand: { tile: "bg-brand-500/15 text-brand-300 ring-brand-400/25", num: "text-brand-200" },
  amber: { tile: "bg-amber-400/15 text-amber-300 ring-amber-400/25", num: "text-amber-300" },
} as const;

function Stat({
  tone,
  icon,
  label,
  value,
}: {
  tone: keyof typeof statTone;
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="p-3.5 sm:p-4">
      <div
        className={cn(
          "mb-3 flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset",
          statTone[tone].tile,
        )}
      >
        {icon}
      </div>
      <p className={cn("text-2xl font-bold sm:text-3xl", statTone[tone].num)}>{value}</p>
      <p className="mt-1 text-[11px] text-ink-tertiary sm:text-xs">{label}</p>
    </Card>
  );
}

function StatIcon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICON = {
  users:
    "M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 10.5a3 3 0 100-6 3 3 0 000 6z",
  alert: "M10.3 3.9l-8 14A2 2 0 004 21h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0zM12 9v4M12 17h.01",
} as const;
