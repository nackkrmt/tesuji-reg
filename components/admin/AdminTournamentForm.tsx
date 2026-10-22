"use client";

import { useId, useState } from "react";
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
  type ScheduleGroupFormValues,
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
import { isPerDaySchedule, newScheduleId } from "@/lib/schedule";
import { formatCompetitionDay, normalizeCompetitionDates } from "@/lib/competition-dates";
import { DEFAULT_MERCHANT_QR } from "@/lib/promptpay";
import { cn, formatThaiDateTime, isoToLocalInput, localInputToIso } from "@/lib/utils";
import { regWindow } from "@/lib/tournament-window";
import { fileToDownscaledDataUrl, MAX_UPLOAD_BYTES } from "@/lib/image";
import { Button } from "@/components/ui/Button";
import { Card, SectionTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { dangerGhost } from "@/components/ui/RowAction";
import { Field, Textarea, TextInput, Toggle, invalidControl } from "@/components/ui/form";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { CenterLoader, EmptyState, Pill } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import { useAdminTournament } from "@/components/admin/AdminTournamentContext";
import { sampleTournamentInput } from "@/lib/demo-seed";
import { CopyFromTournamentSheet } from "@/components/admin/CopyFromTournamentSheet";
import { copyScheduleGroups, type CopyMode } from "@/lib/copy-from";
import { CompetitionDatesField } from "@/components/admin/CompetitionDatesField";

export default function AdminTournamentForm({
  tournamentId,
}: {
  /** null = create a new tournament */
  tournamentId: string | null;
}) {
  const { data: tournament, loading } = useLiveQuery(
    (d) => (tournamentId ? d.getTournament(tournamentId) : Promise.resolve(null)),
    [tournamentId],
  );
  if (loading) return <CenterLoader label="กำลังโหลด…" />;
  if (tournamentId && !tournament) {
    return (
      <EmptyState
        title="ไม่พบรายการแข่งขัน"
        description="รายการนี้อาจถูกลบไปแล้ว"
      />
    );
  }
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
    venueMapUrl: t?.venueMapUrl ?? "",
    competitionDates: t?.competitionDates ?? [],
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
  const router = useRouter();
  const { setTid: setAdminTid } = useAdminTournament();
  const [savedId, setSavedId] = useState<string | null>(initial?.id ?? null);
  // The saved row is the truth for status: it can be flipped from the
  // tournaments list (another tab, or this admin a minute ago) and a local copy
  // seeded once from `initial` would then show — and re-send — a stale value.
  // Local state covers only the not-yet-saved draft, which has no row yet.
  const [draftStatus, setDraftStatus] = useState<TournamentStatus>("draft");
  const status = initial?.status ?? draftStatus;
  const [bannerUploading, setBannerUploading] = useState(false);
  const [mapUploading, setMapUploading] = useState(false);
  const [showSampleConfirm, setShowSampleConfirm] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<TournamentStatus | null>(
    null,
  );
  const [statusBusy, setStatusBusy] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  // What a schedule copy could not carry over (รุ่น with no match here). Kept on
  // screen, not in a toast: the organiser has to act on it before saving.
  const [copyNote, setCopyNote] = useState<string | null>(null);
  // กำหนดการ per competition day (ScheduleGroup.day). While the form holds
  // ตาราง, their days ARE the mode; this only remembers the switch for an
  // empty schedule, so turning "ใช้กำหนดการเดียวกันทุกวัน" off sticks before
  // the first ตาราง is added.
  const [perDayWanted, setPerDayWanted] = useState(() =>
    isPerDaySchedule(initial?.scheduleGroups ?? []),
  );
  const [activeTab, setActiveTab] = useState<ScheduleTabKey>(1);
  const [mergeKeep, setMergeKeep] = useState<number | null>(null); // non-null = sheet open
  const [copyDayFrom, setCopyDayFrom] = useState<number | null>(null); // non-null = sheet open
  const sameEveryDayId = useId(); // names the switch: its label only wraps it

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    trigger,
    formState: { errors, isSubmitting, isDirty, isSubmitted, defaultValues: savedValues },
  } = useForm<TournamentConfigValues>({
    resolver: zodResolver(tournamentConfigSchema),
    defaultValues: defaults(initial),
  });

  const {
    fields: groupFields,
    append: appendGroup,
    remove: removeGroup,
    replace: replaceGroups,
  } = useFieldArray({ control, name: "scheduleGroups" });

  const bannerUrl = watch("bannerUrl");
  const venueMapUrl = watch("venueMapUrl");
  const competitionDates = watch("competitionDates") ?? [];
  // All groups' values — their days pick the tab each ตาราง is on, and their
  // รุ่น let each ตาราง hide the ones another ตาราง of the same day already has
  // (a รุ่น is in one ตาราง per day). Read days from here, never from
  // groupFields: those are snapshots from when each ตาราง was added.
  const allGroups = watch("scheduleGroups") ?? [];

  const days = normalizeCompetitionDates(competitionDates);
  const dayCount = days.length;
  const perDay = allGroups.length > 0 ? isPerDaySchedule(allGroups) : perDayWanted;
  // A one-day event keeps the card exactly as it was — unless its schedule is
  // already per-day (a day was removed), which must stay visible to be fixed.
  const showDays = perDay || dayCount >= 2;
  const tabs = perDay ? scheduleTabs(allGroups, days, errors.scheduleGroups) : [];
  const currentTab: ScheduleTabKey = tabs.some((t) => t.key === activeTab)
    ? activeTab
    : (tabs[0]?.key ?? 1);
  const currentTabInfo = tabs.find((t) => t.key === currentTab);
  /** The day a new or copied ตาราง goes on: the tab being looked at, when it is
   *  a day the tournament has. */
  const targetDay =
    typeof currentTab === "number" && currentTab <= dayCount ? currentTab : null;
  // The ตาราง on the tab being looked at (every one when the schedule is the
  // same every day), each with its index into the whole field array.
  const visibleGroups = groupFields
    .map((field, gi) => ({ field, gi }))
    .filter(({ gi }) => !perDay || tabKeyOf(allGroups[gi]) === currentTab);
  // Days whose ตาราง "คัดลอกจากวันอื่น" can bring here: any other day with
  // ตาราง, a removed one included — copying is one way to rescue it.
  const copyDaySources = mergeCandidates(allGroups).filter((d) => d.day !== targetDay);
  const mergeOptions = mergeCandidates(allGroups);
  const mergeDropped = mergeOptions
    .filter((d) => d.day !== mergeKeep)
    .reduce((n, d) => n + d.count, 0);
  // A ตาราง's day is a position in the date list. Moving the dates as a block
  // (a postponed event) keeps every ตาราง right; removing a day from the
  // middle slides each later day's ตาราง onto the next date. So name each
  // numbered day that now stands for a different date than the one saved.
  const savedDays = normalizeCompetitionDates(
    (savedValues?.competitionDates ?? []).filter((d): d is string => typeof d === "string"),
  );
  const redated = perDay
    ? days.flatMap((iso, i) => {
        const was = savedDays[i];
        return was && was !== iso && allGroups.some((g) => g.day === i + 1)
          ? [{ day: i + 1, iso, was }]
          : [];
      })
    : [];

  // Structural edits (move, merge, copy a day) change which ตาราง clash; after
  // a failed save, re-check so the tab markers follow.
  const recheckSchedule = () => {
    if (isSubmitted) void trigger("scheduleGroups");
  };

  function addGroup() {
    appendGroup(emptyScheduleGroup(newScheduleId(), perDay ? targetDay ?? 1 : null));
  }

  /** "ใช้กำหนดการเดียวกันทุกวัน". Off: the ตาราง there are become วันที่ 1's —
   *  nothing is lost, so no question. On: one day's ตาราง become everyone's,
   *  and the rest would go, so ask first (mergeToEveryDay). */
  function setSameEveryDay(same: boolean) {
    if (!same) {
      allGroups.forEach((_, i) =>
        setValue(`scheduleGroups.${i}.day`, 1, { shouldDirty: true }),
      );
      setPerDayWanted(true);
      setActiveTab(1);
      recheckSchedule();
      return;
    }
    if (allGroups.length === 0) {
      setPerDayWanted(false);
      return;
    }
    const numbered = mergeCandidates(allGroups);
    // Nothing numbered = only ตาราง with no day (a mix): they already apply
    // every day, so there is nothing to choose between.
    if (numbered.length === 0) {
      mergeToEveryDay(null);
      return;
    }
    setMergeKeep(numbered.find((d) => d.day <= dayCount)?.day ?? numbered[0].day);
  }

  /** Keep `keep`'s ตาราง (and any with no day) as the every-day schedule. */
  function mergeToEveryDay(keep: number | null) {
    replaceGroups(
      allGroups
        .filter((g) => g.day == null || g.day === keep)
        .map((g) => ({ ...g, day: null })),
    );
    setPerDayWanted(false);
    setMergeKeep(null);
    recheckSchedule();
  }

  /** "คัดลอกจากวันอื่น": `from`'s ตาราง replace the current day's, with fresh
   *  entry ids (the editor keys on them). */
  function copyDay(from: number) {
    if (targetDay == null) return;
    const to = targetDay;
    const copies: ScheduleGroupFormValues[] = allGroups
      .filter((g) => g.day === from)
      .map((g) => ({
        categoryIds: [...g.categoryIds],
        entries: g.entries.map((e) => ({ ...e, id: newScheduleId() })),
        day: to,
      }));
    replaceGroups([...allGroups.filter((g) => g.day !== to), ...copies]);
    setCopyDayFrom(null);
    recheckSchedule();
  }

  /** A save the schema refused may be refusing a ตาราง on another day's tab:
   *  go to the first day with a problem, unless this one has its own. */
  function onInvalid(errs: FieldErrors<TournamentConfigValues>) {
    if (!perDay || !errs.scheduleGroups) return;
    const marked = scheduleTabs(allGroups, days, errs.scheduleGroups);
    if (marked.find((t) => t.key === currentTab)?.hasError) return;
    const first = marked.find((t) => t.hasError);
    if (first) setActiveTab(first.key);
  }

  async function onSubmit(values: TournamentConfigValues) {
    const saved = await dl.upsertTournament({
      id: savedId ?? undefined,
      nameTh: values.nameTh,
      bannerUrl: values.bannerUrl || null,
      venueMapUrl: values.venueMapUrl || null,
      competitionDates: values.competitionDates,
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
    const wasNew = savedId === null;
    setSavedId(saved.id);
    setDraftStatus(saved.status);
    if (wasNew) {
      setAdminTid(saved.id);
      router.replace(`/admin/tournaments/${saved.id}`);
    }
    // Re-baseline the form to what we just saved so the sticky bar's "unsaved
    // changes" indicator clears (RHF keeps isDirty until the defaults move).
    // Image fields take the STORED urls back, not the submitted values — a
    // freshly-picked image is still a data: URL in `values`, and re-baselining
    // to that would re-upload the same bytes (a new orphan file) on every
    // subsequent save.
    reset({
      ...values,
      bannerUrl: saved.bannerUrl ?? "",
      venueMapUrl: saved.venueMapUrl ?? "",
    });
    setCopyNote(null); // the schema refused empty ตาราง, so the note is moot now
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

  async function onVenueMap(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.show("ไฟล์ใหญ่เกินไป (สูงสุด 8MB)", "error");
      return;
    }
    setMapUploading(true);
    try {
      // Floor plans carry small table labels that must survive pinch-zooming
      // on a phone, so keep more pixels than the banner (2048 vs 1280).
      const dataUrl = await fileToDownscaledDataUrl(file, 2048, 0.85);
      setValue("venueMapUrl", dataUrl, { shouldDirty: true });
    } finally {
      setMapUploading(false);
    }
  }

  function askChangeStatus(next: TournamentStatus) {
    if (!savedId) {
      toast.show("กรุณาบันทึกข้อมูลก่อนเผยแพร่", "error");
      return;
    }
    setPendingStatus(next);
  }

  async function changeStatus(next: TournamentStatus) {
    if (!savedId) return;
    setStatusBusy(true);
    try {
      await dl.setTournamentStatus(savedId, next);
      setDraftStatus(next);
      setPendingStatus(null);
      toast.show(
        next === "published" ? "เผยแพร่รายการแล้ว" : "อัปเดตสถานะแล้ว",
        "success",
      );
    } catch (e) {
      // Previously an unhandled rejection: the RPC failed, the pill kept
      // claiming the old status and nothing told the admin.
      toast.show(
        (e as Error).message.includes("UNAUTHORIZED")
          ? "ไม่มีสิทธิ์ (กรุณาเข้าสู่ระบบ admin ใหม่)"
          : "อัปเดตสถานะไม่สำเร็จ ลองใหม่อีกครั้ง",
        "error",
      );
    } finally {
      setStatusBusy(false);
    }
  }

  // "คัดลอกจากรายการอื่น" for the กำหนดการ: re-point the source's ตาราง at
  // this tournament's รุ่น (lib/copy-from.ts) and load them into the form.
  // Nothing is saved until the sticky bar's save.
  async function copyScheduleFrom(source: Tournament, mode: CopyMode): Promise<boolean> {
    if (cats.length === 0) {
      toast.show("รายการนี้ยังไม่มีรุ่น — เพิ่มรุ่นการแข่งขันก่อน แล้วค่อยคัดลอกกำหนดการ", "error");
      return false;
    }
    let sourceCats: Category[];
    try {
      sourceCats = await dl.listCategories(source.id);
    } catch {
      toast.show("โหลดรุ่นของรายการต้นทางไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
      return false;
    }
    const copy = copyScheduleGroups(source.scheduleGroups ?? [], sourceCats, cats, {
      // Append keeps what is here: the copy skips รุ่น a day already has, and
      // an every-day source lands on the day being looked at.
      existing:
        mode === "append"
          ? allGroups.map((g) => ({ categoryIds: g?.categoryIds ?? [], day: g?.day ?? null }))
          : undefined,
      appendDay: targetDay ?? 1,
      dayCount,
      newId: newScheduleId,
    });
    if ("refused" in copy) {
      toast.show(copy.refused, "error");
      return false;
    }
    const groups = scheduleGroupsToForm(copy.groups);
    if (mode === "replace") replaceGroups(groups);
    else appendGroup(groups);
    if (copy.ontoDay != null) setActiveTab(copy.ontoDay);
    else if (mode === "replace" && isPerDaySchedule(copy.groups)) setActiveTab(1);

    const notes: string[] = [];
    if (copy.unmatched.length > 0) {
      notes.push(`ไม่พบรุ่นเหล่านี้ในรายการนี้: ${copy.unmatched.join(", ")}`);
    }
    if (copy.emptyGroups > 0) {
      notes.push(
        `${copy.emptyGroups} ตารางยังไม่มีรุ่น — ติ๊กรุ่นให้ตารางนั้นหรือลบตารางทิ้งก่อนบันทึก`,
      );
    }
    if (copy.beyondDays > 0) {
      notes.push(
        `${copy.beyondDays} ตารางอยู่ในวันที่รายการนี้ไม่มี (รายการนี้แข่ง ${dayCount} วัน) — ย้ายไปวันอื่นหรือลบทิ้งก่อนบันทึก`,
      );
    }
    if (copy.ontoDay != null) {
      notes.push(
        `กำหนดการต้นทางใช้ตารางเดียวกันทุกวัน จึงคัดลอกมาไว้ในวันที่ ${copy.ontoDay}`,
      );
    }
    setCopyNote(notes.length ? notes.join(" · ") : null);
    recheckSchedule();
    toast.show(
      `คัดลอกกำหนดการ ${copy.groups.length} ตารางจาก “${source.nameTh}” แล้ว — ตรวจแล้วกดบันทึก`,
      notes.length ? "info" : "success",
    );
    return true;
  }

  function confirmFillSample() {
    setShowSampleConfirm(false);
    const s = sampleTournamentInput();
    // keepDefaultValues → the form fills with the sample but the baseline
    // defaults don't move, so isDirty flips true and the sticky bar prompts a save.
    reset(
      {
        nameTh: s.nameTh,
        bannerUrl: "",
        competitionDates: s.competitionDates,
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
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-5">
      <PageHeader
        title="ตั้งค่ารายการแข่งขัน"
        description={
          initial
            ? `${initial.nameTh} — ข้อมูลรายการ · ช่วงรับสมัคร · การชำระเงิน · กำหนดการ`
            : "รายการใหม่ — ข้อมูลรายการ · ช่วงรับสมัคร · การชำระเงิน · กำหนดการ"
        }
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
              onClick={() => askChangeStatus("published")}
            >
              เผยแพร่
            </Button>
          )}
          {status === "published" && (
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-sm"
              onClick={() => askChangeStatus("closed")}
            >
              ปิดรับสมัคร
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className="h-9 px-3 text-sm"
            onClick={() => setShowSampleConfirm(true)}
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
            className="focus-ring whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-ink-secondary transition hover:bg-white/10 hover:text-ink"
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
                  "focus-ring press glass inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3.5 text-sm font-semibold text-ink transition-all hover:bg-white/10",
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
                    e.target.value = "";
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

        <CompetitionDatesField
          value={competitionDates}
          onChange={(next) =>
            setValue("competitionDates", next, { shouldDirty: true, shouldValidate: true })
          }
          error={errors.competitionDates?.message}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="สถานที่แข่งขัน" required error={errors.locationText?.message}>
            <TextInput {...register("locationText")} placeholder="ชื่อสถานที่ / ห้อง / อาคาร" invalid={!!errors.locationText} />
          </Field>
          <Field label="ลิงก์ Google Maps" error={errors.locationMapsUrl?.message} hint="วางลิงก์จาก Google Maps">
            <TextInput {...register("locationMapsUrl")} placeholder="https://maps.google.com/?q=…" inputMode="url" invalid={!!errors.locationMapsUrl} />
          </Field>
        </div>

        {/* venue floor plan (แผนผังงาน) */}
        <Field
          label="แผนผังงาน"
          hint='แสดงเป็นปุ่ม "🗺️ แผนที่" บนหน้าผลแข่งสด (/live) ให้ผู้เข้าแข่งขันซูมหาโต๊ะตัวเอง'
        >
          <div className="space-y-2">
            {venueMapUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={venueMapUrl}
                alt="venue map preview"
                className="max-h-72 w-full rounded-xl bg-white/5 object-contain ring-1 ring-white/10"
              />
            ) : (
              <div className="flex h-24 w-full items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-sm text-ink-tertiary">
                ยังไม่มีแผนผังงาน
              </div>
            )}
            <div className="flex gap-2">
              <label
                className={cn(
                  "focus-ring press glass inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3.5 text-sm font-semibold text-ink transition-all hover:bg-white/10",
                  mapUploading && "pointer-events-none opacity-70",
                )}
              >
                {mapUploading && (
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
                {mapUploading ? "กำลังประมวลผล…" : "อัปโหลดรูป"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onVenueMap(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {venueMapUrl && (
                <button
                  type="button"
                  onClick={() => setValue("venueMapUrl", "", { shouldDirty: true })}
                  className={dangerGhost}
                >
                  ลบรูป
                </button>
              )}
            </div>
            <TextInput
              {...register("venueMapUrl")}
              placeholder="https://… (ลิงก์รูปภาพ)"
            />
          </div>
        </Field>
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
            <p className="flex items-center gap-1.5 font-medium text-ink-secondary">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              ล็อกร้านค้าที่ตั้งไว้ (K SHOP) อัตโนมัติ
            </p>
            <p className="mt-1 text-ink-tertiary">
              ระบบจะสร้าง QR ล็อกยอดจากร้านที่ตั้งไว้ให้เอง ไม่ต้องวาง QR
              หากต้องการเปลี่ยนร้าน แก้ค่า{" "}
              <code className="rounded bg-white/10 px-1 font-semibold text-ink-secondary">
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>กำหนดการ</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {initial && (
              <Button
                type="button"
                variant="secondary"
                className="h-9 px-3 text-sm"
                onClick={() => setCopyOpen(true)}
              >
                คัดลอกจากรายการอื่น
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-sm"
              onClick={addGroup}
              // A removed day's tab is for moving ตาราง off, not adding more.
              disabled={perDay && targetDay == null}
            >
              + เพิ่มตาราง
            </Button>
          </div>
        </div>

        {copyNote && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
            <p className="min-w-0 flex-1">⚠️ {copyNote}</p>
            <button
              type="button"
              onClick={() => setCopyNote(null)}
              className="focus-ring shrink-0 rounded-lg text-xs font-semibold text-amber-100 hover:text-white"
            >
              ปิด
            </button>
          </div>
        )}

        {!initial && (
          <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            บันทึกข้อมูลรายการและเพิ่มรุ่นการแข่งขันก่อน เพื่อเลือกรุ่นในกำหนดการได้
          </p>
        )}

        {showDays && (
          <div className="space-y-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <Toggle
              id={sameEveryDayId}
              checked={!perDay}
              onChange={setSameEveryDay}
              label="ใช้กำหนดการเดียวกันทุกวัน"
            />
            <p className="text-xs text-ink-tertiary">
              {perDay
                ? "แต่ละวันมีตารางของตัวเอง — หน้ากำหนดการแยกหัวข้อตามวัน และหน้าผลสด/คอนโซลกรรมการแสดงเฉพาะตารางของวันนั้น"
                : `ตารางด้านล่างใช้กับทั้ง ${dayCount} วัน — ปิดเพื่อแยกตารางเวลาของแต่ละวัน (เช่น เสาร์กับอาทิตย์เวลาไม่เหมือนกัน)`}
            </p>
          </div>
        )}

        {perDay && (
          <ScheduleDayTabs tabs={tabs} current={currentTab} onSelect={setActiveTab} />
        )}

        {redated.length > 0 && (
          <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
            ⚠️ วันแข่งเปลี่ยนจากที่บันทึกไว้ และตารางผูกกับลำดับวัน ไม่ใช่วันที่:{" "}
            {redated
              .map(
                (d) =>
                  `วันที่ ${d.day} ตอนนี้คือ ${formatCompetitionDay(d.iso, "th", "short")} (เดิม ${formatCompetitionDay(d.was, "th", "short")})`,
              )
              .join(", ")}{" "}
            — ตรวจว่าตารางของแต่ละวันยังอยู่ถูกวัน
          </p>
        )}

        {perDay && currentTabInfo?.stray ? (
          <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
            ⚠️{" "}
            {currentTab === "none"
              ? "ตารางเหล่านี้ไม่ได้อยู่ในวันแข่งวันใด"
              : `วันที่ ${currentTab} ไม่มีในวันแข่งแล้ว (ตอนนี้แข่ง ${dayCount} วัน) — ตารางเหล่านี้จะไม่แสดงบนหน้าเว็บและหน้าผลสด`}
            {" "}— กด “ย้ายไปวัน” ที่แต่ละตาราง หรือลบทิ้ง ก่อนบันทึก
          </p>
        ) : (
          perDay &&
          tabs.some((t) => t.stray) && (
            <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
              ⚠️ มี {tabs.filter((t) => t.stray).reduce((n, t) => n + t.count, 0)}{" "}
              ตารางที่ไม่อยู่ในวันแข่งวันใด (แท็บ ⚠️) — บันทึกไม่ได้จนกว่าจะย้ายไปวันแข่งหรือลบทิ้ง
            </p>
          )
        )}

        {perDay && targetDay != null && copyDaySources.length > 0 && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              className="h-9 px-3 text-sm"
              onClick={() => setCopyDayFrom(copyDaySources[0].day)}
            >
              คัดลอกตารางจากวันอื่นมาวันนี้
            </Button>
          </div>
        )}

        {visibleGroups.length === 0 ? (
          <p className="py-4 text-sm text-ink-tertiary">
            {!perDay
              ? "ยังไม่มีตาราง — กด “เพิ่มตาราง” เลือกรุ่น (เลือกได้หลายรุ่น) แล้วเพิ่มเวลาทีละรายการ"
              : dayCount === 0
                ? "เพิ่มวันที่แข่งขันด้านบนก่อน แล้วค่อยเพิ่มตารางของแต่ละวัน"
                : `ยังไม่มีตารางของวันที่ ${currentTab} — กด “เพิ่มตาราง”${
                    copyDaySources.length > 0 ? " หรือคัดลอกจากวันอื่น" : ""
                  } แล้วเลือกรุ่นกับเวลาของวันนี้`}
          </p>
        ) : (
          <ul className="space-y-4">
            {visibleGroups.map(({ field, gi }, k) => {
              // A รุ่น is in one ตาราง per day, so hide the ones another ตาราง
              // of the same day has — every ตาราง shares one "day" when the
              // schedule is the same every day.
              const tab = tabKeyOf(allGroups[gi]);
              const usedElsewhere = new Set(
                allGroups.flatMap((g, idx) =>
                  idx === gi || tabKeyOf(g) !== tab ? [] : g?.categoryIds ?? [],
                ),
              );
              const stray = perDay && (tab === "none" || tab > dayCount);
              return (
                <ScheduleGroupField
                  key={field.id}
                  groupIndex={gi}
                  title={`ตารางที่ ${k + 1}`}
                  control={control}
                  register={register}
                  watch={watch}
                  setValue={setValue}
                  errors={errors}
                  categories={cats}
                  unavailableIds={usedElsewhere}
                  onRemove={() => {
                    removeGroup(gi);
                    recheckSchedule();
                  }}
                  onCategoriesChange={recheckSchedule}
                  moveTo={
                    stray && dayCount > 0
                      ? {
                          options: days.map((_, i) => ({
                            value: String(i + 1),
                            label: dayLabel(i + 1, days),
                          })),
                          onMove: (day) => {
                            setValue(`scheduleGroups.${gi}.day`, day, { shouldDirty: true });
                            recheckSchedule();
                          },
                        }
                      : undefined
                  }
                />
              );
            })}
          </ul>
        )}
      </Card>

      {initial && (
        <CopyFromTournamentSheet
          open={copyOpen}
          onClose={() => setCopyOpen(false)}
          kind="schedule"
          currentTournamentId={initial.id}
          hasExisting={groupFields.length > 0}
          onApply={copyScheduleFrom}
        />
      )}

      {/* Sticky save bar — always in reach, so a long scroll never hides it.
          On mobile it floats as a pill just above the bottom dock; on desktop
          (no dock) it reverts to the original full-bleed bottom bar. */}
      <div className="glass-strong sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 lg:-mx-8 lg:bottom-0 lg:rounded-b-none lg:rounded-t-2xl lg:border-x-0 lg:border-b-0 lg:px-8">
        <p className="min-w-0 truncate text-xs">
          {isDirty ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-amber-300">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
              มีการแก้ไขที่ยังไม่บันทึก
            </span>
          ) : (
            <span className="text-ink-tertiary">บันทึกข้อมูลล่าสุดแล้ว</span>
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

      <ConfirmSheet
        open={pendingStatus !== null}
        onClose={() => !statusBusy && setPendingStatus(null)}
        onConfirm={() => pendingStatus && changeStatus(pendingStatus)}
        tone={pendingStatus === "published" ? "primary" : "danger"}
        loading={statusBusy}
        title={
          pendingStatus === "published" ? "เผยแพร่รายการนี้" : "ปิดรับสมัครรายการนี้"
        }
        description={watch("nameTh") || initial?.nameTh}
        confirmLabel={pendingStatus === "published" ? "เผยแพร่" : "ปิดรับสมัคร"}
      >
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-ink-secondary">
          {pendingStatus === "published"
            ? "รายการจะขึ้นหน้าแรกทันที และผู้สมัครจะเห็นฟอร์มสมัครตามเวลารับสมัครที่ตั้งไว้ — ตรวจว่ามีรุ่นการแข่งขัน ค่าสมัคร และกำหนดการครบแล้ว"
            : "ผู้สมัครจะไม่เห็นฟอร์มสมัครทันที แม้ยังไม่ถึงเวลาปิดรับสมัคร ใบสมัครที่ยืนยันแล้วไม่ได้รับผลกระทบ และเปิดใหม่ได้จากหน้านี้"}
        </div>
      </ConfirmSheet>

      <ConfirmSheet
        open={showSampleConfirm}
        onClose={() => setShowSampleConfirm(false)}
        onConfirm={confirmFillSample}
        tone="primary"
        title="ใส่ข้อมูลตัวอย่าง"
        description="ข้อมูลทั้งหมดในฟอร์มนี้จะถูกแทนที่"
        confirmLabel="ใส่ข้อมูลตัวอย่าง"
      />

      {/* Per-day → every day. Only one day's ตาราง can become everyone's (two
          days' would put each รุ่น in two ตาราง and interleave their times),
          so the organiser picks which, and is told exactly what goes. */}
      <ConfirmSheet
        open={mergeKeep !== null}
        onClose={() => setMergeKeep(null)}
        onConfirm={() => mergeToEveryDay(mergeKeep)}
        tone={mergeDropped > 0 ? "danger" : "primary"}
        title="ใช้กำหนดการเดียวกันทุกวัน"
        description={
          mergeOptions.length > 1
            ? "ใช้ได้ตารางของวันเดียว — เลือกว่าจะให้ตารางของวันไหนใช้กับทุกวันแข่ง"
            : `ตารางของ${mergeKeep !== null ? dayLabel(mergeKeep, days) : ""} จะใช้กับทุกวันแข่ง`
        }
        confirmLabel={
          mergeDropped > 0 ? `ลบ ${mergeDropped} ตารางของวันอื่น แล้วใช้ทุกวัน` : "ใช้กับทุกวัน"
        }
      >
        {mergeOptions.length > 1 && (
          <DayChoice
            label="ใช้ตารางของวันไหน"
            options={mergeOptions}
            days={days}
            value={mergeKeep}
            onChange={setMergeKeep}
          />
        )}
        {mergeDropped > 0 ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">
            จะลบออกจากฟอร์ม:{" "}
            {mergeOptions
              .filter((d) => d.day !== mergeKeep)
              .map((d) => `${dayLabel(d.day, days)} (${d.count} ตาราง)`)
              .join(", ")}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-ink-secondary">
            ไม่มีตารางถูกลบ — วันอื่นยังไม่มีตาราง
          </div>
        )}
        <p className="text-xs text-ink-tertiary">
          ยังไม่บันทึกจนกว่าจะกด “บันทึกข้อมูลรายการ” — ถ้าเปลี่ยนใจ ออกจากหน้านี้โดยไม่บันทึกได้
        </p>
      </ConfirmSheet>

      {/* "คัดลอกจากวันอื่น": replaces the day being looked at. */}
      <ConfirmSheet
        open={copyDayFrom !== null}
        onClose={() => setCopyDayFrom(null)}
        onConfirm={() => copyDayFrom !== null && copyDay(copyDayFrom)}
        tone={(currentTabInfo?.count ?? 0) > 0 ? "danger" : "primary"}
        title={`คัดลอกตารางมาไว้ใน${targetDay != null ? dayLabel(targetDay, days) : "วันนี้"}`}
        description="รุ่นและเวลาจะเหมือนวันที่เลือกทุกอย่าง แล้วค่อยแก้เฉพาะเวลาที่ต่างกัน"
        confirmLabel={
          (currentTabInfo?.count ?? 0) > 0
            ? `แทนที่ ${currentTabInfo?.count} ตารางของวันนี้`
            : "คัดลอกมาใส่"
        }
      >
        <DayChoice
          label="คัดลอกจากวันไหน"
          options={copyDaySources}
          days={days}
          value={copyDayFrom}
          onChange={setCopyDayFrom}
        />
        {(currentTabInfo?.count ?? 0) > 0 && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200">
            {currentTabInfo?.count} ตารางที่มีอยู่ในวันนี้จะถูกแทนที่ด้วยตารางที่คัดลอกมา
          </div>
        )}
        <p className="text-xs text-ink-tertiary">
          ยังไม่บันทึกจนกว่าจะกด “บันทึกข้อมูลรายการ”
        </p>
      </ConfirmSheet>
    </form>
  );
}

// ── per-day กำหนดการ: the day tabs ─────────────────────────────────────────

/** A tab of the per-day editor: a day number, or "none" for ตาราง with no day
 *  in a per-day schedule (a mix the schema refuses, shown so it can be fixed). */
type ScheduleTabKey = number | "none";

interface ScheduleTab {
  key: ScheduleTabKey;
  label: string;
  /** Not a day the tournament has: a removed day, or ตาราง with no day. */
  stray: boolean;
  count: number;
  /** A ตาราง on it failed validation. The tab has to say so: an error on a
   *  tab nobody is looking at would block the save with nothing on screen. */
  hasError: boolean;
}

const tabKeyOf = (g: Pick<ScheduleGroupFormValues, "day"> | undefined): ScheduleTabKey =>
  g?.day ?? "none";

/** "วันที่ 2 · 25 ต.ค." — or, for a day the tournament no longer has,
 *  "วันที่ 3 · ไม่มีแล้ว". */
function dayLabel(day: number, days: readonly string[]): string {
  return day <= days.length
    ? `วันที่ ${day} · ${formatCompetitionDay(days[day - 1], "th", "short")}`
    : `วันที่ ${day} · ไม่มีแล้ว`;
}

/** Every competition day in order — empty ones too, they are where the next
 *  ตาราง goes — then each removed day a ตาราง is still on, then ตาราง with no
 *  day. Every ตาราง is on exactly one tab; none is ever hidden. */
function scheduleTabs(
  groups: readonly (Pick<ScheduleGroupFormValues, "day"> | undefined)[],
  days: readonly string[],
  groupErrors: FieldErrors<TournamentConfigValues>["scheduleGroups"],
): ScheduleTab[] {
  const tabs: ScheduleTab[] = days.map((_, i) => ({
    key: i + 1,
    label: dayLabel(i + 1, days),
    stray: false,
    count: 0,
    hasError: false,
  }));
  const removed = [
    ...new Set(
      groups.map((g) => g?.day).filter((d): d is number => d != null && d > days.length),
    ),
  ].sort((a, b) => a - b);
  for (const day of removed) {
    tabs.push({ key: day, label: dayLabel(day, days), stray: true, count: 0, hasError: false });
  }
  if (groups.some((g) => g?.day == null)) {
    tabs.push({ key: "none", label: "ไม่ระบุวัน", stray: true, count: 0, hasError: false });
  }
  groups.forEach((g, i) => {
    const tab = tabs.find((t) => t.key === tabKeyOf(g));
    if (!tab) return;
    tab.count++;
    if (groupErrors?.[i]) tab.hasError = true;
  });
  return tabs;
}

/** Each day that has ตาราง, with how many, ascending — what the merge sheet
 *  and "คัดลอกจากวันอื่น" choose between. */
function mergeCandidates(
  groups: readonly (Pick<ScheduleGroupFormValues, "day"> | undefined)[],
): Array<{ day: number; count: number }> {
  const counts = new Map<number, number>();
  for (const g of groups) {
    if (g?.day != null) counts.set(g.day, (counts.get(g.day) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => a[0] - b[0])
    .map(([day, count]) => ({ day, count }));
}

/** The day switcher. aria-pressed buttons in a group, like Segmented: a
 *  tablist would need roving focus and arrow keys, which nothing here has. */
function ScheduleDayTabs({
  tabs,
  current,
  onSelect,
}: {
  tabs: ScheduleTab[];
  current: ScheduleTabKey;
  onSelect: (key: ScheduleTabKey) => void;
}) {
  return (
    <div role="group" aria-label="กำหนดการแต่ละวัน" className="flex gap-1.5 overflow-x-auto pb-0.5">
      {tabs.map((tab) => {
        const on = tab.key === current;
        // One complete set per state: cn() is plain clsx, so two border/bg
        // utilities on one element would be settled by stylesheet order.
        const tone = tab.hasError
          ? on
            ? "border-rose-400/70 bg-rose-500/15 text-rose-100"
            : "border-rose-400/50 bg-white/[0.04] text-rose-200 hover:bg-white/10"
          : tab.stray
            ? on
              ? "border-amber-400/70 bg-amber-500/15 text-amber-100"
              : "border-amber-400/40 bg-white/[0.04] text-amber-200 hover:bg-white/10"
            : on
              ? "border-brand-400/60 bg-brand-500/15 text-brand-100"
              : "border-white/10 bg-white/[0.04] text-ink-secondary hover:bg-white/10 hover:text-ink";
        return (
          <button
            key={String(tab.key)}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(tab.key)}
            className={cn(
              "focus-ring inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-medium transition",
              tone,
            )}
          >
            {tab.stray && <span aria-hidden="true">⚠️</span>}
            <span>{tab.label}</span>
            <span className="rounded-full bg-white/10 px-1.5 tabular-nums text-ink-secondary">
              {tab.count}
              <span className="sr-only"> ตาราง</span>
            </span>
            {tab.hasError && (
              <>
                <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                <span className="sr-only">มีช่องที่ต้องแก้</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Pick one day from a list (with its ตาราง count), inside a ConfirmSheet. */
function DayChoice({
  label,
  options,
  days,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ day: number; count: number }>;
  days: readonly string[];
  value: number | null;
  onChange: (day: number) => void;
}) {
  return (
    <ul className="space-y-2" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.day === value;
        return (
          <li key={o.day}>
            <button
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.day)}
              className={cn(
                "focus-ring press flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                on
                  ? "border-brand-400/60 bg-brand-500/15"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                {dayLabel(o.day, days)}
              </span>
              <Pill size="sm" tone={o.day > days.length ? "warn" : "neutral"}>
                {o.count} ตาราง
              </Pill>
            </button>
          </li>
        );
      })}
    </ul>
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
  title,
  control,
  register,
  watch,
  setValue,
  errors,
  categories,
  unavailableIds,
  onRemove,
  onCategoriesChange,
  moveTo,
}: {
  /** Index into the whole scheduleGroups array (the form path). */
  groupIndex: number;
  /** "ตารางที่ 2" — numbered within its day when the schedule is per-day. */
  title: string;
  control: Control<TournamentConfigValues>;
  register: UseFormRegister<TournamentConfigValues>;
  watch: UseFormWatch<TournamentConfigValues>;
  setValue: UseFormSetValue<TournamentConfigValues>;
  errors: FieldErrors<TournamentConfigValues>;
  categories: Category[];
  unavailableIds: Set<string>;
  onRemove: () => void;
  /** After a รุ่น is ticked or unticked: a clash with another ตาราง is an
   *  error on BOTH, and re-validating this one alone would leave the other's
   *  standing after the clash is gone. */
  onCategoriesChange: () => void;
  /** Offered for a ตาราง on no day the tournament has (a removed day), so it
   *  can be put back on one instead of deleted. */
  moveTo?: { options: { value: string; label: string }[]; onMove: (day: number) => void };
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
    onCategoriesChange();
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <div className="flex shrink-0 items-center gap-2">
          {moveTo && (
            <Combobox
              compact
              className="w-44"
              panelClassName="w-52"
              value={null}
              placeholder="ย้ายไปวัน…"
              onChange={(v) => moveTo.onMove(Number(v))}
              options={moveTo.options}
              searchable={false}
            />
          )}
          <button
            type="button"
            onClick={onRemove}
            className={cn(dangerGhost, "shrink-0")}
          >
            ลบตาราง
          </button>
        </div>
      </div>
      {gErr?.day && (
        <p className="text-xs font-medium text-rose-300">{gErr.day.message}</p>
      )}

      {/* รุ่น — checkbox list (ติ๊กได้หลายรุ่น) */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-ink-tertiary">
          รุ่นในตารางนี้ <span className="text-ink-faint">— ติ๊กได้หลายรุ่น</span>
        </p>
        {categories.length === 0 ? (
          <p className="text-xs text-ink-tertiary">
            ยังไม่มีรุ่น (เพิ่มที่เมนูรุ่นการแข่งขัน)
          </p>
        ) : visibleCategories.length === 0 ? (
          <p className="text-xs text-ink-tertiary">
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
                      on ? "font-medium text-brand-200" : "text-ink-secondary",
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
        <span className="text-xs text-ink-faint">เพิ่มเวลา:</span>
        {SCHEDULE_EVENT_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => addEntry(t)}
            className="focus-ring press rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-ink-secondary transition hover:border-brand-400/40 hover:bg-white/10 hover:text-ink"
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
      {/* Line 1: event-type icon + the type selector (primary label) + remove.
          The type combobox takes the full width so its label is never cramped. */}
      <div className="flex items-center gap-2">
        <span className="w-6 shrink-0 text-center text-lg leading-none">
          {SCHEDULE_EVENT_ICON[eType]}
        </span>
        <div className="min-w-0 flex-1">
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
        <button
          type="button"
          onClick={onRemove}
          aria-label="ลบเวลา"
          className={cn(dangerGhost, "shrink-0 px-2 py-2")}
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

      {/* Line 2: start / end time + optional board number. Each time is one
          unbreakable [label HH:MM] group, so on a narrow phone the two groups
          stack tidily and sit on a single line from sm up. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-8">
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-faint">เริ่ม</span>
          <Combobox
            compact
            className="w-16"
            panelClassName="w-24"
            value={sH}
            onChange={(v) => commit(v, sM, eH, eM)}
            options={[{ value: "", label: "ชม." }, ...HOUR_COMBO]}
            invalid={!!eErr?.time}
          />
          <span className="text-ink-faint">:</span>
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
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-faint">ถึง</span>
          <Combobox
            compact
            className="w-16"
            panelClassName="w-24"
            value={eH}
            onChange={(v) => commit(sH, sM, v, eM)}
            options={[{ value: "", label: "—" }, ...HOUR_COMBO]}
          />
          <span className="text-ink-faint">:</span>
          <Combobox
            compact
            className="w-16"
            panelClassName="w-24"
            value={eM}
            onChange={(v) => commit(sH, sM, eH, v)}
            options={[{ value: "", label: "นาที" }, ...MINUTE_COMBO]}
          />
        </div>
        {eType === "match" && (
          // Board number: a compact input sized to match the time comboboxes
          // it now sits beside (TextInput's default height is taller).
          <input
            {...register(
              `scheduleGroups.${groupIndex}.entries.${entryIndex}.boardNumber`,
            )}
            placeholder="กระดาน"
            inputMode="numeric"
            aria-label="หมายเลขกระดาน"
            className={cn(
              "w-24 shrink-0 rounded-lg glass-input px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint outline-none",
              eErr?.boardNumber && invalidControl,
            )}
          />
        )}
      </div>

      {showNote ? (
        <div className="pl-8">
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
          className="pl-8 text-xs font-medium text-ink-faint transition hover:text-brand-300"
        >
          + เพิ่มหมายเหตุ
        </button>
      )}

      {(eErr?.time || eErr?.boardNumber) && (
        <p className="pl-8 text-xs font-medium text-rose-300">
          {eErr?.time?.message ?? eErr?.boardNumber?.message}
        </p>
      )}
    </li>
  );
}

