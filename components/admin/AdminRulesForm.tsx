"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { z } from "zod";
import { emptyRulesSection, rulesSectionSchema } from "@/lib/validation/schemas";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import type { RulesSection, Tournament } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { dangerGhost } from "@/components/ui/RowAction";
import { Field, TextInput } from "@/components/ui/form";
import { CenterLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { RulesBlockEditor } from "@/components/admin/rules/RulesBlockEditor";

// กฎ กติกา live in the tournament's rules_text column, so this page edits the
// active tournament — just its rules — and re-sends the rest of the row
// unchanged (upsert_tournament overwrites every column).
const rulesFormSchema = z.object({
  rulesSections: z.array(rulesSectionSchema).max(50, "สูงสุด 50 หัวข้อ"),
});

export default function AdminRulesForm() {
  const { data: tournament, loading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  if (loading) return <CenterLoader label="กำลังโหลด…" />;
  if (!tournament) {
    return (
      <Card className="space-y-3 p-5">
        <p className="text-sm text-white/70">
          ยังไม่มีรายการแข่งขัน — สร้างรายการแข่งขันก่อนจึงจะเพิ่มกฎ กติกาได้
        </p>
        <Link
          href="/admin/tournament"
          className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-500"
        >
          ไปหน้าตั้งค่ารายการแข่งขัน
        </Link>
      </Card>
    );
  }
  return <RulesFormInner key={tournament.id} tournament={tournament} />;
}

function RulesFormInner({ tournament }: { tournament: Tournament }) {
  const dl = useDataLayer();
  const toast = useToast();

  const initial = useMemo(
    () => tournament.rulesSections ?? [],
    [tournament.rulesSections],
  );
  const [sections, setSections] = useState<RulesSection[]>(initial);
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(initial));
  const [saving, setSaving] = useState(false);

  const isDirty = JSON.stringify(sections) !== snapshot;
  const titleErrors = sections.map((s) => (s.title.trim() ? null : "กรอกชื่อหัวข้อ"));

  function updateSection(si: number, patch: Partial<RulesSection>) {
    setSections((prev) => prev.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  }
  function removeSection(si: number) {
    setSections((prev) => prev.filter((_, i) => i !== si));
  }
  function moveSection(si: number, dir: -1 | 1) {
    setSections((prev) => {
      const j = si + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[si], next[j]] = [next[j], next[si]];
      return next;
    });
  }
  function appendSection() {
    setSections((prev) => [...prev, emptyRulesSection()]);
  }

  async function handleSave() {
    const parsed = rulesFormSchema.safeParse({ rulesSections: sections });
    if (!parsed.success) {
      toast.show(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", "error");
      return;
    }
    setSaving(true);
    try {
      // Re-send the whole tournament row so only rules_text changes; the RPC
      // overwrites every column from the payload.
      await dl.upsertTournament({
        id: tournament.id,
        nameTh: tournament.nameTh,
        bannerUrl: tournament.bannerUrl,
        venueMapUrl: tournament.venueMapUrl,
        competitionDate: tournament.competitionDate,
        locationText: tournament.locationText,
        locationMapsUrl: tournament.locationMapsUrl,
        registrationOpensAt: tournament.registrationOpensAt,
        registrationClosesAt: tournament.registrationClosesAt,
        scheduleGroups: tournament.scheduleGroups,
        rulesSections: parsed.data.rulesSections,
        promptpayTargetType: tournament.promptpayTargetType,
        promptpayTargetValue: tournament.promptpayTargetValue,
        status: tournament.status,
      });
      // Re-baseline so the sticky bar's "unsaved changes" indicator clears.
      setSections(parsed.data.rulesSections);
      setSnapshot(JSON.stringify(parsed.data.rulesSections));
      toast.show("บันทึกกฎ กติกาแล้ว", "success");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <SectionTitle>หัวข้อกฎ กติกา</SectionTitle>
          <Button
            type="button"
            variant="secondary"
            className="h-9 px-3 text-sm"
            onClick={appendSection}
            disabled={sections.length >= 50}
          >
            + เพิ่มหัวข้อ
          </Button>
        </div>

        {sections.length === 0 ? (
          <p className="py-4 text-sm text-white/45">
            ยังไม่มีหัวข้อ — กด “เพิ่มหัวข้อ” (เช่น ประเภทการแข่งขัน, กฎ กติกา, รางวัล) แล้วเพิ่มเนื้อหาเป็นบล็อกลงไป
          </p>
        ) : (
          <ul className="space-y-4">
            {sections.map((section, si) => (
              <RulesSectionField
                key={si}
                sectionIndex={si}
                total={sections.length}
                section={section}
                titleError={titleErrors[si]}
                onChangeTitle={(title) => updateSection(si, { title })}
                onChangeBlocks={(blocks) => updateSection(si, { blocks })}
                onRemove={() => removeSection(si)}
                onMoveUp={() => moveSection(si, -1)}
                onMoveDown={() => moveSection(si, 1)}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* Sticky save bar — always in reach, so a long scroll never hides it. */}
      <div className="glass-strong sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 rounded-t-2xl border-x-0 border-b-0 px-4 py-3 lg:-mx-8 lg:px-8">
        <p className="min-w-0 truncate text-xs">
          {isDirty ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-300">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
              มีการแก้ไขที่ยังไม่บันทึก
            </span>
          ) : (
            <span className="text-white/45">บันทึกกฎ กติกาล่าสุดแล้ว</span>
          )}
        </p>
        <Button
          type="button"
          onClick={handleSave}
          loading={saving}
          disabled={!isDirty || saving}
          className="h-11 shrink-0 px-6"
        >
          บันทึกกฎ กติกา
        </Button>
      </div>
    </div>
  );
}

/** One กฎ กติกา หัวข้อ: a title plus its ordered content blocks. Order is
 *  adjustable with the ↑/↓ buttons; each block renders as-is on the public page. */
function RulesSectionField({
  sectionIndex,
  total,
  section,
  titleError,
  onChangeTitle,
  onChangeBlocks,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  sectionIndex: number;
  total: number;
  section: RulesSection;
  titleError: string | null;
  onChangeTitle: (title: string) => void;
  onChangeBlocks: (blocks: RulesSection["blocks"]) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const iconBtn =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/60 outline-none transition hover:bg-white/10 hover:text-white/90 disabled:pointer-events-none disabled:opacity-30";
  return (
    <li className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      {/* header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white/80">
          หัวข้อที่ {sectionIndex + 1}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={sectionIndex === 0}
            aria-label="เลื่อนหัวข้อขึ้น"
            className={iconBtn}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={sectionIndex === total - 1}
            aria-label="เลื่อนหัวข้อลง"
            className={iconBtn}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onRemove}
            className={cn(dangerGhost, "shrink-0")}
          >
            ลบหัวข้อ
          </button>
        </div>
      </div>

      <Field label="ชื่อหัวข้อ" required error={titleError ?? undefined}>
        <TextInput
          value={section.title}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder="เช่น กติกาการแข่งขัน"
          invalid={!!titleError}
        />
      </Field>

      <Field label="เนื้อหา" required>
        <RulesBlockEditor blocks={section.blocks} onChange={onChangeBlocks} />
      </Field>
    </li>
  );
}
