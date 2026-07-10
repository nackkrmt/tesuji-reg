"use client";

import Link from "next/link";
import { z } from "zod";
import {
  type FieldErrors,
  useFieldArray,
  useForm,
  type UseFormRegister,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  emptyRulesSection,
  rulesFormToSections,
  rulesSectionFormSchema,
  rulesSectionsToForm,
} from "@/lib/validation/schemas";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import type { Tournament } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { dangerGhost } from "@/components/ui/RowAction";
import { Field, Textarea, TextInput } from "@/components/ui/form";
import { CenterLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";

// กฎ กติกา live in the tournament's rules_text column, so this page edits the
// active tournament — just its rules — and re-sends the rest of the row
// unchanged (upsert_tournament overwrites every column).
const rulesFormSchema = z.object({
  rulesSections: z.array(rulesSectionFormSchema).max(50, "สูงสุด 50 หัวข้อ"),
});
type RulesFormValues = z.infer<typeof rulesFormSchema>;

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

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<RulesFormValues>({
    resolver: zodResolver(rulesFormSchema),
    defaultValues: {
      rulesSections: rulesSectionsToForm(tournament.rulesSections ?? []),
    },
  });

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "rulesSections",
  });

  async function onSubmit(values: RulesFormValues) {
    // Re-send the whole tournament row so only rules_text changes; the RPC
    // overwrites every column from the payload.
    await dl.upsertTournament({
      id: tournament.id,
      nameTh: tournament.nameTh,
      bannerUrl: tournament.bannerUrl,
      competitionDate: tournament.competitionDate,
      locationText: tournament.locationText,
      locationMapsUrl: tournament.locationMapsUrl,
      registrationOpensAt: tournament.registrationOpensAt,
      registrationClosesAt: tournament.registrationClosesAt,
      scheduleGroups: tournament.scheduleGroups,
      rulesSections: rulesFormToSections(values.rulesSections),
      promptpayTargetType: tournament.promptpayTargetType,
      promptpayTargetValue: tournament.promptpayTargetValue,
      status: tournament.status,
    });
    // Re-baseline so the sticky bar's "unsaved changes" indicator clears.
    reset(values);
    toast.show("บันทึกกฎ กติกาแล้ว", "success");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <SectionTitle>หัวข้อกฎ กติกา</SectionTitle>
          <Button
            type="button"
            variant="secondary"
            className="h-9 px-3 text-sm"
            onClick={() => append(emptyRulesSection())}
          >
            + เพิ่มหัวข้อ
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="py-4 text-sm text-white/45">
            ยังไม่มีหัวข้อ — กด “เพิ่มหัวข้อ” (เช่น ประเภทการแข่งขัน, กฎ กติกา, รางวัล) แล้ววางเนื้อหาลงไป
          </p>
        ) : (
          <ul className="space-y-4">
            {fields.map((section, si) => (
              <RulesSectionField
                key={section.id}
                sectionIndex={si}
                total={fields.length}
                register={register}
                errors={errors}
                onRemove={() => remove(si)}
                onMoveUp={() => move(si, si - 1)}
                onMoveDown={() => move(si, si + 1)}
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
          type="submit"
          loading={isSubmitting}
          disabled={!isDirty}
          className="h-11 shrink-0 px-6"
        >
          บันทึกกฎ กติกา
        </Button>
      </div>
    </form>
  );
}

/** One กฎ กติกา หัวข้อ: a title plus a textarea (วางเนื้อหาบรรทัดละข้อ). Order is
 *  adjustable with the ↑/↓ buttons; the public page indents/tabulates the body. */
function RulesSectionField({
  sectionIndex,
  total,
  register,
  errors,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  sectionIndex: number;
  total: number;
  register: UseFormRegister<RulesFormValues>;
  errors: FieldErrors<RulesFormValues>;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const sErr = errors.rulesSections?.[sectionIndex];
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

      <Field label="ชื่อหัวข้อ" required error={sErr?.title?.message}>
        <TextInput
          {...register(`rulesSections.${sectionIndex}.title`)}
          placeholder="เช่น กติกาการแข่งขัน"
          invalid={!!sErr?.title}
        />
      </Field>

      <Field
        label="เนื้อหา"
        required
        error={sErr?.body?.message}
        hint="วางเนื้อหาจากเอกสารได้เลย บรรทัดละ 1 ข้อ — เว้นแท็บ/เว้นวรรคหน้าบรรทัด หรือใส่เลขซ้อนชั้น (เช่น 10.1.3.4.3) เพื่อจัดชั้นย่อย · บรรทัดแบบ “หัวข้อ [แท็บ] รายละเอียด” จะจัดเป็น 2 คอลัมน์ให้"
      >
        <Textarea
          {...register(`rulesSections.${sectionIndex}.body`)}
          placeholder={"1. ใช้กติกาสากล โคมิ 6.5 แต้ม\n2. เวลาแข่งขันฝ่ายละ 30 นาที\n2.1 หมดเวลาปรับแพ้ทันที\n\nกระดาน 19x19\tหักคะแนนต่อ 6.5"}
          rows={8}
          invalid={!!sErr?.body}
        />
      </Field>
    </li>
  );
}
