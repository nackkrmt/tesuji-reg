"use client";

import { useState } from "react";
import {
  type Control,
  type FieldErrors,
  useFieldArray,
  useForm,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  emptyScheduleEntry,
  emptyScheduleGroup,
  scheduleFormToGroups,
  scheduleGroupsToForm,
  tournamentConfigSchema,
  TournamentConfigValues,
} from "@/lib/validation/schemas";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import {
  type Category,
  SCHEDULE_EVENT_ICON,
  SCHEDULE_EVENT_LABEL,
  SCHEDULE_EVENT_TYPES,
  type ScheduleEventType,
  type Tournament,
  type TournamentStatus,
} from "@/lib/data/types";
import { newScheduleId } from "@/lib/schedule";
import { DEFAULT_MERCHANT_QR } from "@/lib/promptpay";
import { cn, formatThaiDateTime, isoToLocalInput, localInputToIso } from "@/lib/utils";
import { regWindow } from "@/lib/tournament-window";
import { fileToDownscaledDataUrl, MAX_UPLOAD_BYTES } from "@/lib/image";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { dangerGhost } from "@/components/ui/RowAction";
import { Field, Textarea, TextInput } from "@/components/ui/form";
import { Combobox } from "@/components/ui/Combobox";
import { CenterLoader, Pill } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { sampleTournamentInput } from "@/lib/demo-seed";

export default function AdminTournamentForm() {
  const { data: tournament, loading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  if (loading) return <CenterLoader label="กำลังโหลด…" />;
  return <FormGate tournament={tournament ?? null} />;
}

/** Load the รุ่น list BEFORE mounting the form, so the dropdowns have their
 *  options present when react-hook-form applies the saved values — otherwise
 *  the selected option is lost to an options-not-ready race. */
function FormGate({ tournament }: { tournament: Tournament | null }) {
  const { data: categories } = useLiveQuery(
    (d) => (tournament ? d.listCategories(tournament.id) : Promise.resolve([])),
    [tournament?.id],
  );
  if (categories === undefined) return <CenterLoader label="กำลังโหลด…" />;
  return (
    <TournamentFormInner
      key={tournament?.id ?? "new"}
      initial={tournament}
      categories={categories}
    />
  );
}

function defaults(t: Tournament | null): TournamentConfigValues {
  return {
    nameTh: t?.nameTh ?? "",
    bannerUrl: t?.bannerUrl ?? "",
    competitionDate: t?.competitionDate ?? "",
    locationText: t?.locationText ?? "",
    locationMapsUrl: t?.locationMapsUrl ?? "",
    registrationOpensAt: t ? isoToLocalInput(t.registrationOpensAt) : "",
    registrationClosesAt: t ? isoToLocalInput(t.registrationClosesAt) : "",
    scheduleGroups: scheduleGroupsToForm(t?.scheduleGroups ?? []),
    promptpayTargetType: "merchant_qr",
    promptpayTargetValue: t?.promptpayTargetValue ?? DEFAULT_MERCHANT_QR,
  };
}

function TournamentFormInner({
  initial,
  categories: cats,
}: {
  initial: Tournament | null;
  categories: Category[];
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null);
  const [status, setStatus] = useState<TournamentStatus>(
    initial?.status ?? "draft",
  );
  const [bannerUploading, setBannerUploading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<TournamentConfigValues>({
    resolver: zodResolver(tournamentConfigSchema),
    defaultValues: defaults(initial),
  });

  const {
    fields: groupFields,
    append: appendGroup,
    remove: removeGroup,
  } = useFieldArray({ control, name: "scheduleGroups" });

  const bannerUrl = watch("bannerUrl");
  // All groups' รุ่น selections — so each ตาราง can hide รุ่น already used by
  // another ตาราง (a รุ่น belongs to exactly one ตาราง).
  const allGroups = watch("scheduleGroups") ?? [];

  async function onSubmit(values: TournamentConfigValues) {
    const saved = await dl.upsertTournament({
      id: savedId ?? undefined,
      nameTh: values.nameTh,
      bannerUrl: values.bannerUrl || null,
      competitionDate: values.competitionDate,
      locationText: values.locationText,
      locationMapsUrl: values.locationMapsUrl || "",
      registrationOpensAt: localInputToIso(values.registrationOpensAt),
      registrationClosesAt: localInputToIso(values.registrationClosesAt),
      scheduleGroups: scheduleFormToGroups(values.scheduleGroups),
      // Rules live on their own /admin/rules page now — re-send the existing
      // sections unchanged so saving tournament config never wipes them.
      rulesSections: initial?.rulesSections ?? [],
      promptpayTargetType: "merchant_qr",
      // Use the baked-in shop QR when configured (locked, no manual paste);
      // otherwise the admin-pasted Thai-QR.
      promptpayTargetValue:
        DEFAULT_MERCHANT_QR || values.promptpayTargetValue.replace(/\s/g, ""),
      status,
    });
    setSavedId(saved.id);
    setStatus(saved.status);
    // Re-baseline the form to what we just saved so the sticky bar's "unsaved
    // changes" indicator clears (RHF keeps isDirty until the defaults move).
    reset(values);
    toast.show("บันทึกข้อมูลรายการแล้ว", "success");
  }

  async function onBanner(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.show("ไฟล์ใหญ่เกินไป (สูงสุด 8MB)", "error");
      return;
    }
    setBannerUploading(true);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file, 1280, 0.8);
      setValue("bannerUrl", dataUrl, { shouldDirty: true });
    } finally {
      setBannerUploading(false);
    }
  }

  async function changeStatus(next: TournamentStatus) {
    if (!savedId) {
      toast.show("กรุณาบันทึกข้อมูลก่อนเผยแพร่", "error");
      return;
    }
    await dl.setTournamentStatus(savedId, next);
    setStatus(next);
    toast.show(
      next === "published" ? "เผยแพร่รายการแล้ว" : "อัปเดตสถานะแล้ว",
      "success",
    );
  }

  function fillSample() {
    if (!window.confirm("ใส่ข้อมูลตัวอย่าง? ข้อมูลทั้งหมดในฟอร์มนี้จะถูกแทนที่"))
      return;
    const s = sampleTournamentInput();
    // keepDefaultValues → the form fills with the sample but the baseline
    // defaults don't move, so isDirty flips true and the sticky bar prompts a save.
    reset(
      {
        nameTh: s.nameTh,
        bannerUrl: "",
        competitionDate: s.competitionDate,
        locationText: s.locationText,
        locationMapsUrl: s.locationMapsUrl,
        registrationOpensAt: isoToLocalInput(s.registrationOpensAt),
        registrationClosesAt: isoToLocalInput(s.registrationClosesAt),
        scheduleGroups: scheduleGroupsToForm(s.scheduleGroups),
        promptpayTargetType: s.promptpayTargetType,
        promptpayTargetValue: s.promptpayTargetValue,
      },
      { keepDefaultValues: true },
    );
    toast.show("ใส่ข้อมูลตัวอย่างแล้ว — กดบันทึกเพื่อใช้งาน", "info");
  }

  // Reflects the *actual* registration window (open/before/closed), not just
  // the admin-set status — a published tournament reads differently before
  // its opening time than while it's actually accepting entries.
  const win = regWindow({
    status,
    registrationOpensAt: watch("registrationOpensAt"),
    registrationClosesAt: watch("registrationClosesAt"),
  });
  const statusLabel =
    status === "draft"
      ? { text: "แบบร่าง", tone: "neutral" as const }
      : status === "closed"
        ? { text: "เผยแพร่ · ปิดรับสมัคร (แอดมินปิดเอง)", tone: "bad" as const }
        : win === "before"
          ? {
              text: `เผยแพร่ · จะเปิดรับสมัคร ${formatThaiDateTime(
                localInputToIso(watch("registrationOpensAt")),
              )}`,
              tone: "warn" as const,
            }
          : win === "closed"
            ? { text: "เผยแพร่ · เลยเวลาปิดรับสมัครแล้ว", tone: "bad" as const }
            : { text: "เผยแพร่ · กำลังเปิดรับสมัคร", tone: "good" as const };

  const winLabel =
    win === "open"
      ? { text: "รับสมัคร: กำลังเปิด", tone: "good" as const }
      : win === "before"
        ? { text: "รับสมัคร: ยังไม่เปิด", tone: "warn" as const }
        : win === "closed"
          ? { text: "รับสมัคร: ปิดแล้ว", tone: "bad" as const }
          : { text: "รับสมัคร: ยังไม่เผยแพร่", tone: "neutral" as const };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <PageHeader
        title="ตั้งค่ารายการแข่งขัน"
        description="ข้อมูลรายการ · ช่วงรับสมัคร · การชำระเงิน · กำหนดการ"
      />

      {/* status bar */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={statusLabel.tone}>{statusLabel.text}</Pill>
          <Pill tone={winLabel.tone}>{winLabel.text}</Pill>
        </div>
        <div className="flex gap-2">
          {status !== "published" && (
            <Button
              type="button"
              variant="success"
              className="h-9 px-3 text-sm"
              onClick={() => changeStatus("published")}
            >
              เผยแพร่
            </Button>
          )}
          {status === "published" && (
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-sm"
              onClick={() => changeStatus("closed")}
            >
              ปิดรับสมัคร
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className="h-9 px-3 text-sm"
            onClick={fillSample}
          >
            ใส่ข้อมูลตัวอย่าง
          </Button>
        </div>
      </Card>

      {/* Quick jump — this form is long; let the admin hop to any section. */}
      <nav className="flex gap-1.5 overflow-x-auto pb-0.5">
        {[
          ["sec-info", "ข้อมูล"],
          ["sec-window", "เวลารับสมัคร"],
          ["sec-payment", "ชำระเงิน"],
          ["sec-schedule", "กำหนดการ"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white/90"
          >
            {label}
          </a>
        ))}
      </nav>

      <Card id="sec-info" className="scroll-mt-24 space-y-4 p-5">
        <SectionTitle>ข้อมูลรายการแข่งขัน</SectionTitle>
        <Field label="ชื่อรายการแข่งขัน" required error={errors.nameTh?.message}>
          <TextInput {...register("nameTh")} placeholder="เช่น การแข่งขันหมากล้อม..." invalid={!!errors.nameTh} />
        </Field>

        {/* banner */}
        <Field label="ภาพแบนเนอร์" hint="อัปโหลดรูป หรือวางลิงก์รูปภาพก็ได้">
          <div className="space-y-2">
            {bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bannerUrl}
                alt="banner preview"
                className="h-36 w-full rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-36 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-[#06122a] text-sm text-white/70">
                ยังไม่มีแบนเนอร์
              </div>
            )}
            <div className="flex gap-2">
              <label
                className={cn(
                  "glass inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3.5 text-sm font-semibold text-white outline-none transition-all hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-brand-400/60",
                  bannerUploading && "pointer-events-none opacity-70",
                )}
              >
                {bannerUploading && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 3a9 9 0 1 0 9 9"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
                {bannerUploading ? "กำลังประมวลผล…" : "อัปโหลดรูป"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onBanner(f);
                  }}
                />
              </label>
              {bannerUrl && (
                <button
                  type="button"
                  onClick={() => setValue("bannerUrl", "", { shouldDirty: true })}
                  className={dangerGhost}
                >
                  ลบรูป
                </button>
              )}
            </div>
            <TextInput
              {...register("bannerUrl")}
              placeholder="https://… (ลิงก์รูปภาพ)"
            />
          </div>
        </Field>

        <Field label="วันที่แข่งขัน" required error={errors.competitionDate?.message}>
          <TextInput type="date" {...register("competitionDate")} invalid={!!errors.competitionDate} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="สถานที่แข่งขัน" required error={errors.locationText?.message}>
            <TextInput {...register("locationText")} placeholder="ชื่อสถานที่ / ห้อง / อาคาร" invalid={!!errors.locationText} />
          </Field>
          <Field label="ลิงก์ Google Maps" error={errors.locationMapsUrl?.message} hint="วางลิงก์จาก Google Maps">
            <TextInput {...register("locationMapsUrl")} placeholder="https://maps.google.com/?q=…" inputMode="url" invalid={!!errors.locationMapsUrl} />
          </Field>
        </div>
      </Card>

      <Card id="sec-window" className="scroll-mt-24 space-y-4 p-5">
        <SectionTitle>ช่วงเวลารับสมัคร</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="เปิดรับสมัคร" required error={errors.registrationOpensAt?.message}>
            <TextInput type="datetime-local" {...register("registrationOpensAt")} invalid={!!errors.registrationOpensAt} />
          </Field>
          <Field label="ปิดรับสมัคร" required error={errors.registrationClosesAt?.message}>
            <TextInput type="datetime-local" {...register("registrationClosesAt")} invalid={!!errors.registrationClosesAt} />
          </Field>
        </div>
      </Card>

      <Card id="sec-payment" className="scroll-mt-24 space-y-4 p-5">
        <SectionTitle>การชำระเงิน (QR ร้านค้า K SHOP)</SectionTitle>
        {DEFAULT_MERCHANT_QR ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-white/80">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              ล็อกร้านค้าที่ตั้งไว้ (K SHOP) อัตโนมัติ
            </p>
            <p className="mt-1 text-white/45">
              ระบบจะสร้าง QR ล็อกยอดจากร้านที่ตั้งไว้ให้เอง ไม่ต้องวาง QR
              หากต้องการเปลี่ยนร้าน แก้ค่า{" "}
              <code className="rounded bg-white/10 px-1 font-semibold text-white/70">
                NEXT_PUBLIC_DEFAULT_MERCHANT_QR
              </code>{" "}
              ใน .env.local แล้วรีสตาร์ทเซิร์ฟเวอร์
            </p>
          </div>
        ) : (
          <Field
            label="ข้อความ QR ร้านค้า (Thai QR Payment)"
            required
            error={errors.promptpayTargetValue?.message}
            hint="สแกน QR ร้านจาก K SHOP แล้วก๊อปข้อความ (ขึ้นต้น 00020101…) มาวาง — ระบบจะใส่ยอดเงินให้อัตโนมัติ โดยเงินยังเข้าร้านใน K SHOP เหมือนเดิม"
          >
            <Textarea
              {...register("promptpayTargetValue")}
              placeholder="00020101021130810016A0000006770101120115…6304XXXX"
              spellCheck={false}
              invalid={!!errors.promptpayTargetValue}
            />
          </Field>
        )}
      </Card>

      {/* ── กำหนดการ จัดกลุ่มตามรุ่น (schedule builder) ──────────────────── */}
      <Card id="sec-schedule" className="scroll-mt-24 space-y-4 p-5">
        <div className="flex items-center justify-between">
          <SectionTitle>กำหนดการ</SectionTitle>
          <Button
            type="button"
            variant="secondary"
            className="h-9 px-3 text-sm"
            onClick={() => appendGroup(emptyScheduleGroup(newScheduleId()))}
          >
            + เพิ่มตาราง
          </Button>
        </div>

        {!initial && (
          <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            บันทึกข้อมูลรายการและเพิ่มรุ่นการแข่งขันก่อน เพื่อเลือกรุ่นในกำหนดการได้
          </p>
        )}

        {groupFields.length === 0 ? (
          <p className="py-4 text-sm text-white/45">
            ยังไม่มีตาราง — กด “เพิ่มตาราง” เลือกรุ่น (เลือกได้หลายรุ่น) แล้วเพิ่มเวลาทีละรายการ
          </p>
        ) : (
          <ul className="space-y-4">
            {groupFields.map((group, gi) => {
              const usedElsewhere = new Set(
                allGroups.flatMap((g, idx) =>
                  idx === gi ? [] : g?.categoryIds ?? [],
                ),
              );
              return (
                <ScheduleGroupField
                  key={group.id}
                  groupIndex={gi}
                  control={control}
                  register={register}
                  watch={watch}
                  setValue={setValue}
                  errors={errors}
                  categories={cats}
                  unavailableIds={usedElsewhere}
                  onRemove={() => removeGroup(gi)}
                />
              );
            })}
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
            <span className="text-white/45">บันทึกข้อมูลล่าสุดแล้ว</span>
          )}
        </p>
        <Button
          type="submit"
          loading={isSubmitting}
          disabled={!isDirty && !!savedId}
          className="h-11 shrink-0 px-6"
        >
          บันทึกข้อมูลรายการ
        </Button>
      </div>
    </form>
  );
}

// Separate hour (00–23) and minute (00–59, every 1) options for the time
// dropdowns.
const HOUR_OPTIONS: string[] = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
const MINUTE_OPTIONS: string[] = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0"),
);
const HOUR_COMBO = HOUR_OPTIONS.map((h) => ({ value: h, label: h }));
const MINUTE_COMBO = MINUTE_OPTIONS.map((m) => ({ value: m, label: m }));

/** Split a stored time ("09:30" or "09:30–12:00") into h/m parts. */
function splitTimeParts(time: string): {
  sH: string;
  sM: string;
  eH: string;
  eM: string;
} {
  const [startRaw, endRaw] = (time || "").split(/[–-]/).map((s) => s.trim());
  const [sH = "", sM = ""] = startRaw ? startRaw.split(":") : [];
  const [eH = "", eM = ""] = endRaw ? endRaw.split(":") : [];
  return { sH, sM, eH, eM };
}

/** Recombine h/m parts into the stored time string (minute → "00", end optional). */
function joinTimeParts(sH: string, sM: string, eH: string, eM: string): string {
  const start = sH ? `${sH}:${sM || "00"}` : "";
  const end = eH ? `${eH}:${eM || "00"}` : "";
  if (!start) return "";
  return end ? `${start}–${end}` : start;
}


/** One ตาราง: pick one OR MORE รุ่น (รุ่นที่แข่งเวลาเดียวกัน), then quick-add
 *  timed entries by event type. */
function ScheduleGroupField({
  groupIndex,
  control,
  register,
  watch,
  setValue,
  errors,
  categories,
  unavailableIds,
  onRemove,
}: {
  groupIndex: number;
  control: Control<TournamentConfigValues>;
  register: UseFormRegister<TournamentConfigValues>;
  watch: UseFormWatch<TournamentConfigValues>;
  setValue: UseFormSetValue<TournamentConfigValues>;
  errors: FieldErrors<TournamentConfigValues>;
  categories: Category[];
  unavailableIds: Set<string>;
  onRemove: () => void;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `scheduleGroups.${groupIndex}.entries`,
  });
  const gErr = errors.scheduleGroups?.[groupIndex];

  const selectedCats = watch(`scheduleGroups.${groupIndex}.categoryIds`) ?? [];
  const toggleCat = (id: string) => {
    const next = selectedCats.includes(id)
      ? selectedCats.filter((x) => x !== id)
      : [...selectedCats, id];
    setValue(`scheduleGroups.${groupIndex}.categoryIds`, next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  // Hide รุ่น already chosen in another ตาราง (keep ones this ตาราง selected).
  const visibleCategories = categories.filter(
    (c) => selectedCats.includes(c.id) || !unavailableIds.has(c.id),
  );

  // Quick-add: append an entry already set to the chosen event type.
  const addEntry = (type: ScheduleEventType) =>
    append({ ...emptyScheduleEntry(newScheduleId()), type });

  return (
    <li className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      {/* header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white/80">
          ตารางที่ {groupIndex + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className={cn(dangerGhost, "shrink-0")}
        >
          ลบตาราง
        </button>
      </div>

      {/* รุ่น — checkbox list (ติ๊กได้หลายรุ่น) */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-white/55">
          รุ่นในตารางนี้ <span className="text-white/40">— ติ๊กได้หลายรุ่น</span>
        </p>
        {categories.length === 0 ? (
          <p className="text-xs text-white/45">
            ยังไม่มีรุ่น (เพิ่มที่เมนูรุ่นการแข่งขัน)
          </p>
        ) : visibleCategories.length === 0 ? (
          <p className="text-xs text-white/45">
            ทุกรุ่นถูกเลือกในตารางอื่นแล้ว
          </p>
        ) : (
          <div className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
            {visibleCategories.map((c) => {
              const on = selectedCats.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 px-3 py-2.5 transition-colors",
                    on ? "bg-brand-500/15" : "hover:bg-white/[0.06]",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleCat(c.id)}
                    className="h-4 w-4 shrink-0 accent-brand-500"
                  />
                  <span
                    className={cn(
                      "text-sm",
                      on ? "font-medium text-brand-200" : "text-white/70",
                    )}
                  >
                    {c.name}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {gErr?.categoryIds && (
          <p className="text-xs font-medium text-rose-300">
            {gErr.categoryIds.message}
          </p>
        )}
      </div>

      {/* timed entries — compact rows */}
      {fields.length > 0 && (
        <ul className="space-y-1.5">
          {fields.map((entry, ei) => (
            <ScheduleEntryRow
              key={entry.id}
              groupIndex={groupIndex}
              entryIndex={ei}
              register={register}
              watch={watch}
              setValue={setValue}
              errors={errors}
              onRemove={() => remove(ei)}
            />
          ))}
        </ul>
      )}
      {fields.length === 0 && (
        <p className="text-xs font-medium text-rose-300">
          ยังไม่มีเวลา — กดปุ่ม “เพิ่มเวลา” ด้านล่าง
        </p>
      )}

      {/* quick-add by event type */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-2.5">
        <span className="text-xs text-white/40">เพิ่มเวลา:</span>
        {SCHEDULE_EVENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => addEntry(t)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/60 transition hover:border-brand-400/40 hover:bg-white/10 hover:text-white/90"
          >
            + {SCHEDULE_EVENT_ICON[t]} {SCHEDULE_EVENT_LABEL[t]}
          </button>
        ))}
      </div>
    </li>
  );
}

/** A single compact time row: icon · เวลา · ประเภท · กระดาน(match) · ✕, with an
 *  optional หมายเหตุ hidden behind a toggle. */
function ScheduleEntryRow({
  groupIndex,
  entryIndex,
  register,
  watch,
  setValue,
  errors,
  onRemove,
}: {
  groupIndex: number;
  entryIndex: number;
  register: UseFormRegister<TournamentConfigValues>;
  watch: UseFormWatch<TournamentConfigValues>;
  setValue: UseFormSetValue<TournamentConfigValues>;
  errors: FieldErrors<TournamentConfigValues>;
  onRemove: () => void;
}) {
  const timePath =
    `scheduleGroups.${groupIndex}.entries.${entryIndex}.time` as const;
  const eType = watch(`scheduleGroups.${groupIndex}.entries.${entryIndex}.type`);
  const noteVal = watch(
    `scheduleGroups.${groupIndex}.entries.${entryIndex}.note`,
  );
  const eErr = errors.scheduleGroups?.[groupIndex]?.entries?.[entryIndex];
  const [forceNote, setForceNote] = useState(false);
  const showNote = forceNote || !!noteVal;

  const { sH, sM, eH, eM } = splitTimeParts(watch(timePath) ?? "");
  const commit = (h1: string, m1: string, h2: string, m2: string) =>
    setValue(timePath, joinTimeParts(h1, m1, h2, m2), {
      shouldDirty: true,
      shouldValidate: true,
    });
  return (
    <li className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="w-6 shrink-0 text-center text-lg leading-none">
          {SCHEDULE_EVENT_ICON[eType]}
        </span>
        {/* start time: ชั่วโมง : นาที */}
        <div className="flex items-center gap-1">
          <Combobox
            compact
            className="w-16"
            panelClassName="w-24"
            value={sH}
            onChange={(v) => commit(v, sM, eH, eM)}
            options={[{ value: "", label: "ชม." }, ...HOUR_COMBO]}
            invalid={!!eErr?.time}
          />
          <span className="text-white/30">:</span>
          <Combobox
            compact
            className="w-16"
            panelClassName="w-24"
            value={sM}
            onChange={(v) => commit(sH, v, eH, eM)}
            options={[{ value: "", label: "นาที" }, ...MINUTE_COMBO]}
            invalid={!!eErr?.time}
          />
        </div>
        <span className="text-xs text-white/40">ถึง</span>
        {/* end time (optional) */}
        <div className="flex items-center gap-1">
          <Combobox
            compact
            className="w-16"
            panelClassName="w-24"
            value={eH}
            onChange={(v) => commit(sH, sM, v, eM)}
            options={[{ value: "", label: "—" }, ...HOUR_COMBO]}
          />
          <span className="text-white/30">:</span>
          <Combobox
            compact
            className="w-16"
            panelClassName="w-24"
            value={eM}
            onChange={(v) => commit(sH, sM, eH, v)}
            options={[{ value: "", label: "นาที" }, ...MINUTE_COMBO]}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="ลบเวลา"
          className={cn(dangerGhost, "ml-auto shrink-0 px-2 py-2")}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-1.5 pl-[1.875rem]">
        <div className="flex-1">
          <Combobox
            value={eType ?? ""}
            onChange={(v) =>
              setValue(
                `scheduleGroups.${groupIndex}.entries.${entryIndex}.type`,
                v as (typeof SCHEDULE_EVENT_TYPES)[number],
                { shouldValidate: true },
              )
            }
            options={SCHEDULE_EVENT_TYPES.map((t) => ({
              value: t,
              label: SCHEDULE_EVENT_LABEL[t],
            }))}
            searchable={false}
          />
        </div>
        {eType === "match" && (
          <div className="w-24 shrink-0">
            <TextInput
              {...register(
                `scheduleGroups.${groupIndex}.entries.${entryIndex}.boardNumber`,
              )}
              placeholder="กระดาน"
              inputMode="numeric"
              invalid={!!eErr?.boardNumber}
            />
          </div>
        )}
      </div>

      {showNote ? (
        <div className="pl-[1.875rem]">
          <TextInput
            {...register(
              `scheduleGroups.${groupIndex}.entries.${entryIndex}.note`,
            )}
            placeholder="หมายเหตุ เช่น รอบที่ 1–2"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setForceNote(true)}
          className="pl-[1.875rem] text-xs font-medium text-white/40 transition hover:text-brand-300"
        >
          + เพิ่มหมายเหตุ
        </button>
      )}

      {(eErr?.time || eErr?.boardNumber) && (
        <p className="pl-[1.875rem] text-xs font-medium text-rose-300">
          {eErr?.time?.message ?? eErr?.boardNumber?.message}
        </p>
      )}
    </li>
  );
}

