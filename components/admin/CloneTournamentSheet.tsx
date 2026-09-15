"use client";

import { useEffect, useState } from "react";
import { useDataLayer } from "@/lib/data/store";
import type {
  Category,
  ScheduleGroup,
  Tournament,
  TournamentInput,
} from "@/lib/data/types";
import { localInputToIso } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Checkbox, Field, TextInput } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";

/** "คัดลอกจากรายการเดิม" — the missing prefill.
 *
 *  Every new event was retyped from scratch: seven รุ่น one at a time through
 *  the รุ่น sheet, then the whole กฎ กติกา block, then the กำหนดการ. This copies
 *  them into a fresh DRAFT and leaves the organiser to change the dates.
 *
 *  Two things are deliberately NOT copied. The banner and แผนผังงาน images: a
 *  new event gets a new poster, and pointing two tournaments at one stored
 *  object would make deleting either one's image break the other. And the
 *  status: the copy always lands as a draft, so a half-edited clone can never
 *  appear on the public home page. */
export function CloneTournamentSheet({
  source,
  onClose,
  onCloned,
}: {
  /** null = closed. */
  source: Tournament | null;
  onClose: () => void;
  onCloned: (newTournamentId: string) => void;
}) {
  const dl = useDataLayer();
  const toast = useToast();

  const [name, setName] = useState("");
  const [competitionDate, setCompetitionDate] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [withCategories, setWithCategories] = useState(true);
  const [withRules, setWithRules] = useState(true);
  const [withSchedule, setWithSchedule] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");

  useEffect(() => {
    if (!source) return;
    // Seed from the source, minus its dates — those are the whole point of the
    // new event and must be a deliberate choice, not an inherited default.
    setName(`${source.nameTh} (สำเนา)`);
    setCompetitionDate("");
    setOpensAt("");
    setClosesAt("");
    setWithCategories(true);
    setWithRules(true);
    setWithSchedule(true);
    setStep("");
  }, [source]);

  const ready =
    !!source &&
    name.trim().length > 0 &&
    competitionDate.trim().length > 0 &&
    opensAt.trim().length > 0 &&
    closesAt.trim().length > 0;

  async function run() {
    if (!source || !ready || busy) return;
    setBusy(true);
    let createdId: string | null = null;
    try {
      const base: TournamentInput = {
        nameTh: name.trim(),
        bannerUrl: null,
        venueMapUrl: null,
        competitionDate: competitionDate.trim(),
        locationText: source.locationText,
        locationMapsUrl: source.locationMapsUrl,
        registrationOpensAt: localInputToIso(opensAt),
        registrationClosesAt: localInputToIso(closesAt),
        // Filled in below once the new รุ่น ids exist to point at.
        scheduleGroups: [],
        rulesSections: withRules ? source.rulesSections : [],
        promptpayTargetType: source.promptpayTargetType,
        promptpayTargetValue: source.promptpayTargetValue,
        status: "draft",
      };

      setStep("สร้างรายการใหม่…");
      const created = await dl.upsertTournament(base);
      createdId = created.id;

      const idMap = new Map<string, string>();
      let sourceCategories: Category[] = [];
      if (withCategories) {
        sourceCategories = await dl.listCategories(source.id);
        // Sequential, not Promise.all: upsert_category assigns sortOrder and
        // checks the code for duplicates, and the รุ่น list must keep the
        // source's order.
        let i = 0;
        for (const c of sourceCategories) {
          i++;
          setStep(`คัดลอกรุ่น ${i}/${sourceCategories.length}…`);
          const made = await dl.upsertCategory({
            tournamentId: created.id,
            code: c.code,
            name: c.name,
            capacity: c.capacity,
            feeThb: c.feeThb,
            minPowerLevel: c.minPowerLevel,
            maxPowerLevel: c.maxPowerLevel,
            minAge: c.minAge,
            maxAge: c.maxAge,
            sortOrder: c.sortOrder,
          });
          idMap.set(c.id, made.id);
        }

        // Second pass: combinableCategoryIds point at รุ่น ids, which only all
        // exist now. Re-upsert just the รุ่น that have companions.
        const withCompanions = sourceCategories.filter(
          (c) => (c.combinableCategoryIds ?? []).length > 0,
        );
        for (const c of withCompanions) {
          const newId = idMap.get(c.id);
          if (!newId) continue;
          setStep("เชื่อมรุ่นที่แข่งรวมกัน…");
          await dl.upsertCategory({
            id: newId,
            tournamentId: created.id,
            code: c.code,
            name: c.name,
            capacity: c.capacity,
            feeThb: c.feeThb,
            minPowerLevel: c.minPowerLevel,
            maxPowerLevel: c.maxPowerLevel,
            minAge: c.minAge,
            maxAge: c.maxAge,
            sortOrder: c.sortOrder,
            combinableCategoryIds: (c.combinableCategoryIds ?? [])
              .map((id) => idMap.get(id))
              .filter((id): id is string => !!id),
          });
        }
      }

      if (withSchedule && source.scheduleGroups.length > 0) {
        // Drop รุ่น that were not copied rather than leaving dangling ids the
        // schedule builder would render as blank checkboxes.
        const groups: ScheduleGroup[] = source.scheduleGroups
          .map((g) => ({
            ...g,
            categoryIds: g.categoryIds
              .map((id) => idMap.get(id))
              .filter((id): id is string => !!id),
          }))
          .filter((g) => g.categoryIds.length > 0);
        if (groups.length > 0) {
          setStep("คัดลอกกำหนดการ…");
          await dl.upsertTournament({
            ...base,
            id: created.id,
            scheduleGroups: groups,
          });
        }
      }

      toast.show(
        `คัดลอกเป็นรายการใหม่แล้ว (แบบร่าง)${
          withCategories ? ` · ${idMap.size} รุ่น` : ""
        } — ตรวจข้อมูลแล้วค่อยเผยแพร่`,
        "success",
      );
      onCloned(created.id);
    } catch (e) {
      const msg = (e as Error).message;
      toast.show(
        (msg.includes("UNAUTHORIZED")
          ? "ไม่มีสิทธิ์ (กรุณาเข้าสู่ระบบ admin ใหม่)"
          : `คัดลอกไม่สำเร็จ — ${msg.slice(0, 120)}`) +
          (createdId
            ? " · รายการใหม่ถูกสร้างเป็นแบบร่างไว้แล้ว ตรวจและแก้ต่อได้"
            : ""),
        "error",
      );
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  return (
    <Sheet
      open={!!source}
      onClose={() => !busy && onClose()}
      title="คัดลอกเป็นรายการใหม่"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            ยกเลิก
          </Button>
          <Button fullWidth onClick={run} loading={busy} disabled={!ready}>
            คัดลอก
          </Button>
        </div>
      }
    >
      {source && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs text-ink-tertiary">คัดลอกจาก</p>
            <p className="font-semibold text-ink">{source.nameTh}</p>
            <p className="mt-0.5 text-xs text-ink-tertiary">
              รุ่นการแข่งขัน · กฎ กติกา · กำหนดการ · สถานที่ · QR ชำระเงิน
              (ไม่คัดลอกแบนเนอร์ แผนผังงาน และใบสมัคร)
            </p>
          </div>

          <Field label="ชื่อรายการใหม่" required>
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น ชิงแชมป์ประเทศไทย 2570"
            />
          </Field>

          <Field label="วันที่แข่งขัน" required>
            <TextInput
              type="date"
              value={competitionDate}
              onChange={(e) => setCompetitionDate(e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="เปิดรับสมัคร" required>
              <TextInput
                type="datetime-local"
                value={opensAt}
                onChange={(e) => setOpensAt(e.target.value)}
              />
            </Field>
            <Field label="ปิดรับสมัคร" required>
              <TextInput
                type="datetime-local"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <Checkbox
              checked={withCategories}
              onChange={setWithCategories}
              label="คัดลอกรุ่นการแข่งขัน (รหัส ชื่อ ค่าสมัคร จำนวนรับ ช่วงฝีมือ/อายุ)"
            />
            <Checkbox
              checked={withRules}
              onChange={setWithRules}
              label="คัดลอกกฎ กติกา"
            />
            <Checkbox
              checked={withSchedule && withCategories}
              onChange={setWithSchedule}
              disabled={!withCategories}
              label="คัดลอกกำหนดการ (ต้องคัดลอกรุ่นด้วย)"
            />
          </div>

          <p className="text-xs text-ink-tertiary">
            รายการใหม่จะเป็น <b className="text-ink-secondary">แบบร่าง</b> เสมอ —
            ยังไม่มีใครเห็นจนกว่าจะกดเผยแพร่
            {step && <span className="ml-1 text-brand-300">· {step}</span>}
          </p>
        </div>
      )}
    </Sheet>
  );
}
