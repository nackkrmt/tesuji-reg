"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Checkbox, TextInput } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import {
  RESET_PHRASE,
  RESET_TARGETS,
  ResetTargetKey,
  selectiveReset,
} from "@/lib/admin-reset";

// ── dependency graph (static — derived once from RESET_TARGETS) ──────────────
// Ticking a group pulls in everything it needs; unticking pulls out everything
// that needs IT. Both directions keep the invariant the RPC re-validates
// (deps ⊆ selection), with no greyed-out boxes.
const DEPS = new Map<ResetTargetKey, ResetTargetKey[]>(
  RESET_TARGETS.map((t) => [t.key, t.deps]),
);

function transitive(
  start: ResetTargetKey,
  edges: (k: ResetTargetKey) => ResetTargetKey[],
): Set<ResetTargetKey> {
  const out = new Set<ResetTargetKey>([start]);
  const queue = [start];
  while (queue.length) {
    for (const next of edges(queue.pop()!)) {
      if (!out.has(next)) {
        out.add(next);
        queue.push(next);
      }
    }
  }
  return out;
}

const withDeps = (key: ResetTargetKey) =>
  transitive(key, (k) => DEPS.get(k) ?? []);
const withDependents = (key: ResetTargetKey) =>
  transitive(key, (k) =>
    RESET_TARGETS.filter((t) => t.deps.includes(k)).map((t) => t.key),
  );

/** The unified reset checklist: tick which data groups to delete, confirm once.
 *  Always kept: the tournament settings' app_config, the db structure, and the
 *  acting admin's own account (the server never wipes the caller). Replaces the
 *  old TournamentDangerZone / LiveDangerZone / FactoryResetDangerZone cards. */
export function ResetChecklist({
  activeTournamentName,
}: {
  activeTournamentName?: string | null;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<ResetTargetKey>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const confirmOk = confirmText.trim() === RESET_PHRASE;
  const allSelected = selected.size === RESET_TARGETS.length;
  const selectedTargets = RESET_TARGETS.filter((t) => selected.has(t.key));

  function toggle(key: ResetTargetKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        for (const k of withDependents(key)) next.delete(k);
      } else {
        for (const k of withDeps(key)) next.add(k);
      }
      return next;
    });
  }

  async function runReset() {
    if (!confirmOk || busy || selectedTargets.length === 0) return;
    setBusy(true);
    try {
      const r = await selectiveReset(
        confirmText,
        selectedTargets.map((t) => t.key),
      );
      const parts = selectedTargets.map(
        (t) => `${t.label} ${r.counts[t.key] ?? 0}`,
      );
      if (r.slips_deleted > 0) parts.push(`ไฟล์สลิป ${r.slips_deleted}`);
      if (r.assets_deleted > 0) parts.push(`ไฟล์แบนเนอร์/กติกา ${r.assets_deleted}`);
      const storageError = r.slip_error || r.asset_error;
      toast.show(
        `ลบแล้ว: ${parts.join(" · ")}` +
          (storageError ? " (บางไฟล์ลบไม่สำเร็จ ลองรันกลุ่มเดิมซ้ำ)" : ""),
        storageError ? "error" : "success",
      );
      setConfirmOpen(false);
      setConfirmText("");
      setSelected(new Set());
      // Everything on screen (participants, stats, seat counts) is now stale —
      // reload so the whole app re-reads the emptied tables.
      setTimeout(() => window.location.reload(), 1600);
    } catch (e) {
      const raw = (e as Error).message;
      const msg = raw.includes("CONFIRM_MISMATCH")
        ? "คำยืนยันไม่ตรง"
        : raw.includes("UNAUTHORIZED")
          ? "ไม่มีสิทธิ์ (เข้าสู่ระบบ admin ใหม่)"
          : "ล้างข้อมูลไม่สำเร็จ";
      toast.show(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-rose-400/30 bg-rose-500/[0.08] p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-rose-200">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0 text-rose-300"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>เลือกข้อมูลที่ต้องการลบ — ลบถาวร ย้อนกลับไม่ได้</span>
        </p>
        <p className="mt-1 text-xs text-white/55">
          ติ๊กเฉพาะกลุ่มที่ต้องการล้าง แล้วยืนยันครั้งเดียว · เก็บไว้เสมอ:
          การตั้งค่าระบบ + <b className="text-emerald-300/90">บัญชีของคุณเอง</b>{" "}
          (คุณจะยังล็อกอินอยู่)
        </p>

        <div className="mt-3 border-b border-white/10 pb-2">
          <Checkbox
            checked={allSelected}
            onChange={(v) =>
              setSelected(
                v ? new Set(RESET_TARGETS.map((t) => t.key)) : new Set(),
              )
            }
            label={<b>เลือกทั้งหมด (ล้างทุกอย่าง)</b>}
          />
        </div>

        <div className="mt-2.5 space-y-2">
          {RESET_TARGETS.map((t) => (
            <label
              key={t.key}
              className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/10 px-3 py-2 transition hover:bg-white/[0.06]"
            >
              <input
                type="checkbox"
                checked={selected.has(t.key)}
                onChange={() => toggle(t.key)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded accent-brand-500"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white/85">
                  {t.label}
                  {t.key === "tournament" && activeTournamentName ? (
                    <span className="ml-1.5 font-normal text-white/45">
                      ({activeTournamentName})
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-white/45">
                  {t.desc}
                </span>
              </span>
            </label>
          ))}
        </div>

        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => {
            setConfirmText("");
            setConfirmOpen(true);
          }}
          className="mt-3 shrink-0 rounded-xl border border-rose-400/50 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-100 transition enabled:hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ลบข้อมูลที่เลือก ({selected.size})
        </button>
      </div>

      <Sheet
        open={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        title="ยืนยันการลบข้อมูล"
        footer={
          <Button
            variant="danger"
            fullWidth
            disabled={!confirmOk}
            loading={busy}
            onClick={runReset}
          >
            ยืนยันลบถาวร
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            <p className="font-semibold">
              จะลบถาวร ({selectedTargets.length} กลุ่ม) — ย้อนกลับไม่ได้:
            </p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-rose-100/90">
              {selectedTargets.map((t) => (
                <li key={t.key}>{t.label}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1.5 text-sm text-white/60">พิมพ์คำนี้เพื่อยืนยัน:</p>
            <p className="mb-2 select-all rounded-lg bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white/80">
              {RESET_PHRASE}
            </p>
            <TextInput
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`พิมพ์ "${RESET_PHRASE}"`}
              invalid={confirmText.length > 0 && !confirmOk}
              autoComplete="off"
            />
          </div>
        </div>
      </Sheet>
    </>
  );
}
