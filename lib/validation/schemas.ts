import { z } from "zod";
import { DEFAULT_MERCHANT_QR, isValidThaiQr } from "@/lib/promptpay";
import {
  Person,
  RankStatus,
  SCHEDULE_EVENT_TYPES,
  ScheduleEventType,
  ScheduleGroup,
  SeatEditInput,
  SeatInput,
  TITLE_PREFIXES,
  TitlePrefix,
} from "@/lib/data/types";

// ── primitives ────────────────────────────────────────────────────────────
const thaiName = z
  .string()
  .trim()
  .min(1, "กรุณากรอก")
  .regex(/^[฀-๿\s.'’-]+$/, "กรุณากรอกเป็นภาษาไทย");

const engName = z
  .string()
  .trim()
  .min(1, "Required")
  .regex(/^[A-Za-z\s.'’-]+$/, "กรุณากรอกเป็นภาษาอังกฤษ");

/** Thai mobile: 10 digits starting 06 / 08 / 09 (spaces & dashes stripped). */
export const thaiPhone = z
  .string()
  .trim()
  .min(1, "กรุณากรอกเบอร์โทรศัพท์")
  .transform((s) => s.replace(/[\s-]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^0[689]\d{8}$/, "เบอร์มือถือไม่ถูกต้อง (เช่น 0812345678)"),
  );

/** English name, optional — blank allowed, but validates the format if filled.
 *  (Many coaches don't have the English name of a child yet; fill it later.) */
const engNameOptional = z
  .string()
  .trim()
  .regex(/^[A-Za-z\s.'’-]*$/, "กรุณากรอกเป็นภาษาอังกฤษ");

export const titlePrefixSchema = z.enum(
  TITLE_PREFIXES as [TitlePrefix, ...TitlePrefix[]],
);

// ── date of birth (DD / MM / YYYY, ค.ศ. or พ.ศ. auto-detected) ──────────────
/** Thai users may type either ค.ศ. (Gregorian) or พ.ศ. (Buddhist Era) — the two
 *  ranges never overlap for a living person (BE = CE + 543), so the year alone
 *  tells us which one was typed without asking the user to pick. */
export function yearToCE(y: string): number {
  const n = Number(y);
  return n >= 2400 ? n - 543 : n;
}

export const dobSchema = z
  .object({
    d: z.string().regex(/^\d{1,2}$/, "วันไม่ถูกต้อง"),
    m: z.string().regex(/^\d{1,2}$/, "เดือนไม่ถูกต้อง"),
    y: z.string().regex(/^\d{4}$/, "ปีต้องมี 4 หลัก"),
  })
  .superRefine((v, ctx) => {
    const yCE = yearToCE(v.y);
    const d = Number(v.d);
    const m = Number(v.m);
    const thisYear = new Date().getFullYear();
    if (yCE < 1900 || yCE > thisYear) {
      ctx.addIssue({
        path: ["y"],
        code: z.ZodIssueCode.custom,
        message: "ปีเกิดไม่ถูกต้อง",
      });
      return;
    }
    const dt = new Date(yCE, m - 1, d);
    if (
      dt.getFullYear() !== yCE ||
      dt.getMonth() !== m - 1 ||
      dt.getDate() !== d
    ) {
      ctx.addIssue({
        path: ["d"],
        code: z.ZodIssueCode.custom,
        message: "วันเกิดไม่ถูกต้อง",
      });
    }
  });

export type DobValues = z.infer<typeof dobSchema>;

/** Convert validated DOB fields to ISO yyyy-mm-dd. */
export function dobToIso(v: DobValues): string {
  const yCE = yearToCE(v.y);
  const m = Number(v.m);
  const d = Number(v.d);
  return `${yCE}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ── person ───────────────────────────────────────────────────────────────────
const personalShape = {
  titlePrefix: titlePrefixSchema,
  titleCustom: z.string().trim().optional(),
  firstNameTh: thaiName,
  lastNameTh: thaiName,
  firstNameEn: engNameOptional,
  lastNameEn: engNameOptional,
  hasMiddleName: z.boolean(),
  middleNameTh: z.string().trim().optional(),
  middleNameEn: z.string().trim().optional(),
  phone: thaiPhone,
  dob: dobSchema,
  powerLevel: z
    .string()
    .min(1, "กรุณาเลือกระดับฝีมือ")
    .refine((v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 22;
    }, "ระดับฝีมือไม่ถูกต้อง"),
  province: z.string().trim().min(1, "กรุณาเลือกจังหวัด"),
  instituteId: z.string().nullable(),
  instituteName: z.string().trim().min(1, "กรุณาเลือกหรือระบุสถาบัน"),
  pdpaConsent: z
    .boolean()
    .refine((v) => v === true, "กรุณายอมรับนโยบายความเป็นส่วนตัว (PDPA)"),
};

function personalRefine(
  v: {
    titlePrefix: string;
    titleCustom?: string;
    hasMiddleName: boolean;
    middleNameTh?: string;
    middleNameEn?: string;
  },
  ctx: z.RefinementCtx,
) {
  if (v.titlePrefix === "อื่นๆ" && !v.titleCustom?.trim()) {
    ctx.addIssue({
      path: ["titleCustom"],
      code: z.ZodIssueCode.custom,
      message: "กรุณาระบุคำนำหน้า",
    });
  }
  if (v.hasMiddleName) {
    if (!v.middleNameTh?.trim()) {
      ctx.addIssue({
        path: ["middleNameTh"],
        code: z.ZodIssueCode.custom,
        message: "กรุณากรอกชื่อกลาง",
      });
    }
    // middleNameEn is optional — fill in the English middle name later.
  }
}

/** Step A — applicant personal info (no category). */
export const personalSchema = z
  .object(personalShape)
  .superRefine(personalRefine);

/** Full registrant — personal info + chosen category. */
export const personSchema = z
  .object({
    ...personalShape,
    categoryId: z.string().min(1, "กรุณาเลือกรุ่น"),
  })
  .superRefine(personalRefine);

/** Step B (group) — array of registrants. */
export const groupSchema = z.object({
  people: z
    .array(personSchema)
    .min(1, "ต้องมีอย่างน้อย 1 คน")
    .max(10, "สูงสุด 10 คน"),
});

// ── admin: edit a registered seat ────────────────────────────────────────────
/** Admin seat edit — DOB is a native yyyy-mm-dd input; ระดับฝีมือ may be blank
 *  ("" = ไม่ระบุ; the server enforces "required" only for bounded รุ่น). */
export const seatEditSchema = z
  .object({
    titlePrefix: titlePrefixSchema,
    titleCustom: z.string().trim().optional(),
    firstNameTh: thaiName,
    lastNameTh: thaiName,
    firstNameEn: engName,
    lastNameEn: engName,
    hasMiddleName: z.boolean(),
    middleNameTh: z.string().trim().optional(),
    middleNameEn: z.string().trim().optional(),
    phone: thaiPhone,
    dob: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "กรุณาเลือกวันเกิด")
      .refine((v) => {
        const t = Date.parse(v);
        return !Number.isNaN(t) && t <= Date.now();
      }, "วันเกิดไม่ถูกต้อง"),
    powerLevel: z.string().refine((v) => {
      if (v === "") return true;
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 22;
    }, "ระดับฝีมือไม่ถูกต้อง"),
    categoryId: z.string().min(1, "กรุณาเลือกรุ่น"),
  })
  .superRefine(personalRefine);

export type SeatEditFormValues = z.infer<typeof seatEditSchema>;

/** Convert validated seat-edit form values to a SeatEditInput. */
export function seatEditFormToInput(v: SeatEditFormValues): SeatEditInput {
  return {
    titlePrefix: v.titlePrefix,
    titleCustom:
      v.titlePrefix === "อื่นๆ" ? v.titleCustom?.trim() || null : null,
    firstNameTh: v.firstNameTh.trim(),
    lastNameTh: v.lastNameTh.trim(),
    firstNameEn: v.firstNameEn.trim(),
    lastNameEn: v.lastNameEn.trim(),
    hasMiddleName: v.hasMiddleName,
    middleNameTh: v.hasMiddleName ? v.middleNameTh?.trim() || null : null,
    middleNameEn: v.hasMiddleName ? v.middleNameEn?.trim() || null : null,
    phone: v.phone.replace(/[\s-]/g, ""),
    dob: v.dob,
    powerLevel: v.powerLevel === "" ? null : Number(v.powerLevel),
    categoryId: v.categoryId,
  };
}

/** Raw form value shape (what react-hook-form holds). */
export interface PersonFormValues {
  titlePrefix: TitlePrefix;
  titleCustom?: string;
  firstNameTh: string;
  lastNameTh: string;
  firstNameEn: string;
  lastNameEn: string;
  hasMiddleName: boolean;
  middleNameTh?: string;
  middleNameEn?: string;
  phone: string;
  dob: { d: string; m: string; y: string };
  powerLevel: string; // select value, "" until chosen
  rankStatus: RankStatus; // set by the rank picker
  matchedGoPlayerId: string | null;
  province: string;
  instituteId: string | null; // set when picked / created
  instituteName: string; // display name (free text or institute)
  pdpaConsent: boolean;
  categoryId: string;
}

export function emptyPerson(): PersonFormValues {
  return {
    titlePrefix: "นาย",
    titleCustom: "",
    firstNameTh: "",
    lastNameTh: "",
    firstNameEn: "",
    lastNameEn: "",
    hasMiddleName: false,
    middleNameTh: "",
    middleNameEn: "",
    phone: "",
    dob: { d: "", m: "", y: "" },
    powerLevel: "",
    rankStatus: "pending",
    matchedGoPlayerId: null,
    province: "",
    instituteId: null,
    instituteName: "",
    pdpaConsent: false,
    categoryId: "",
  };
}

/** Convert validated form values to a plain Person (profile / managed player). */
export function personFormToPerson(v: PersonFormValues): Person {
  return {
    titlePrefix: v.titlePrefix,
    titleCustom: v.titlePrefix === "อื่นๆ" ? v.titleCustom?.trim() || null : null,
    firstNameTh: v.firstNameTh.trim(),
    lastNameTh: v.lastNameTh.trim(),
    firstNameEn: v.firstNameEn.trim(),
    lastNameEn: v.lastNameEn.trim(),
    hasMiddleName: v.hasMiddleName,
    middleNameTh: v.hasMiddleName ? v.middleNameTh?.trim() || null : null,
    middleNameEn: v.hasMiddleName ? v.middleNameEn?.trim() || null : null,
    phone: v.phone.replace(/[\s-]/g, ""),
    dob: dobToIso(v.dob),
    powerLevel: v.powerLevel === "" ? null : Number(v.powerLevel),
    rankStatus: v.rankStatus,
    matchedGoPlayerId: v.matchedGoPlayerId,
    province: v.province.trim(),
    instituteId: v.instituteId,
    instituteName: v.instituteName.trim(),
    pdpaConsent: v.pdpaConsent,
    // pdpaConsentAt is stamped by the data layer at save time.
  };
}

/** Convert validated form values to a SeatInput for the DataLayer. */
export function personFormToSeatInput(v: PersonFormValues): SeatInput {
  return { ...personFormToPerson(v), categoryId: v.categoryId };
}

/** Convert a stored Person back to editable form values (prefill). */
export function personToFormValues(p: Person): PersonFormValues {
  const parts = (p.dob || "").split("-");
  const [y, m, d] = parts;
  return {
    titlePrefix: p.titlePrefix,
    titleCustom: p.titleCustom ?? "",
    firstNameTh: p.firstNameTh,
    lastNameTh: p.lastNameTh,
    firstNameEn: p.firstNameEn,
    lastNameEn: p.lastNameEn,
    hasMiddleName: p.hasMiddleName,
    middleNameTh: p.middleNameTh ?? "",
    middleNameEn: p.middleNameEn ?? "",
    phone: p.phone,
    dob: {
      d: d ? String(Number(d)) : "",
      m: m ? String(Number(m)) : "",
      y: y ?? "",
    },
    powerLevel: p.powerLevel != null ? String(p.powerLevel) : "",
    rankStatus: p.rankStatus ?? "pending",
    matchedGoPlayerId: p.matchedGoPlayerId ?? null,
    province: p.province ?? "",
    instituteId: p.instituteId ?? null,
    instituteName: p.instituteName ?? "",
    pdpaConsent: p.pdpaConsent ?? false,
    categoryId: "",
  };
}

// ── admin: schedule builder (กำหนดการ จัดกลุ่มตามรุ่น) ─────────────────────
const scheduleEventTypeSchema = z.enum(
  SCHEDULE_EVENT_TYPES as [ScheduleEventType, ...ScheduleEventType[]],
);

/** One timed entry within a รุ่น (boardNumber/note held as strings; "" = none).
 *  Matches require a board number. */
export const scheduleEntryFormSchema = z
  .object({
    id: z.string(),
    time: z.string().trim().min(1, "กรอกเวลา"),
    type: scheduleEventTypeSchema,
    boardNumber: z.string().trim(),
    note: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "match" && !v.boardNumber.trim()) {
      ctx.addIssue({
        path: ["boardNumber"],
        code: z.ZodIssueCode.custom,
        message: "กรอกกระดาน",
      });
    }
  });

export type ScheduleEntryFormValues = z.infer<typeof scheduleEntryFormSchema>;

/** A ตาราง covering one or more รุ่น (เลือกได้หลายรุ่น) with its own entries. */
export const scheduleGroupFormSchema = z.object({
  categoryIds: z.array(z.string()).min(1, "เลือกอย่างน้อย 1 รุ่น"),
  entries: z.array(scheduleEntryFormSchema).min(1, "เพิ่มอย่างน้อย 1 เวลา"),
});

export type ScheduleGroupFormValues = z.infer<typeof scheduleGroupFormSchema>;

export function emptyScheduleEntry(id: string): ScheduleEntryFormValues {
  return { id, time: "", type: "match", boardNumber: "", note: "" };
}

export function emptyScheduleGroup(id: string): ScheduleGroupFormValues {
  return { categoryIds: [], entries: [emptyScheduleEntry(id)] };
}

/** Form groups → stored ScheduleGroup[] (board kept for matches only). */
export function scheduleFormToGroups(
  groups: ScheduleGroupFormValues[],
): ScheduleGroup[] {
  return groups.map((g) => ({
    categoryIds: g.categoryIds,
    entries: g.entries.map((e) => ({
      id: e.id,
      time: e.time.trim(),
      type: e.type,
      boardNumber: e.type === "match" ? e.boardNumber.trim() || null : null,
      note: e.note.trim() || null,
    })),
  }));
}

/** Stored ScheduleGroup[] → form groups (null → ""). */
export function scheduleGroupsToForm(
  groups: ScheduleGroup[],
): ScheduleGroupFormValues[] {
  return (groups ?? []).map((g) => ({
    categoryIds: g.categoryIds ?? [],
    entries: g.entries.map((e) => ({
      id: e.id,
      time: e.time ?? "",
      type: e.type,
      boardNumber: e.boardNumber ?? "",
      note: e.note ?? "",
    })),
  }));
}

// ── admin: tournament config ──────────────────────────────────────────────
export const tournamentConfigSchema = z
  .object({
    nameTh: z.string().trim().min(1, "กรุณากรอกชื่อรายการ"),
    bannerUrl: z.string().trim().optional().or(z.literal("")),
    competitionDate: z.string().trim().min(1, "กรุณากรอกวันที่แข่งขัน"),
    locationText: z.string().trim().min(1, "กรุณากรอกสถานที่"),
    locationMapsUrl: z
      .string()
      .trim()
      .url("ลิงก์ Google Maps ไม่ถูกต้อง")
      .optional()
      .or(z.literal("")),
    registrationOpensAt: z.string().min(1, "กรุณาเลือกวันเวลาเปิดรับสมัคร"),
    registrationClosesAt: z.string().min(1, "กรุณาเลือกวันเวลาปิดรับสมัคร"),
    scheduleGroups: z.array(scheduleGroupFormSchema),
    rulesPdfUrl: z.string().trim().optional().or(z.literal("")),
    promptpayTargetType: z.literal("merchant_qr").default("merchant_qr"),
    promptpayTargetValue: z.string().trim().min(1, "กรุณาวาง QR ร้านค้า"),
  })
  .superRefine((v, ctx) => {
    if (
      v.registrationOpensAt &&
      v.registrationClosesAt &&
      v.registrationOpensAt >= v.registrationClosesAt
    ) {
      ctx.addIssue({
        path: ["registrationClosesAt"],
        code: z.ZodIssueCode.custom,
        message: "เวลาปิดรับต้องหลังเวลาเปิดรับ",
      });
    }
    // Merchant QR only. Skip the check when a baked-in default QR is configured
    // (the admin doesn't paste anything in that case).
    if (!DEFAULT_MERCHANT_QR && !isValidThaiQr(v.promptpayTargetValue)) {
      ctx.addIssue({
        path: ["promptpayTargetValue"],
        code: z.ZodIssueCode.custom,
        message: "ข้อความ QR ไม่ถูกต้อง (ต้องขึ้นต้น 00020101… และ CRC ถูกต้อง)",
      });
    }
  });

export type TournamentConfigValues = z.infer<typeof tournamentConfigSchema>;

// ── admin: category ───────────────────────────────────────────────────────
export const categorySchema = z
  .object({
    code: z.string().trim().min(1, "กรุณากรอกรหัสรุ่น"),
    name: z.string().trim().min(1, "กรุณากรอกชื่อรุ่น"),
    capacity: z.coerce
      .number({ invalid_type_error: "กรุณากรอกตัวเลข" })
      .int("ต้องเป็นจำนวนเต็ม")
      .min(0, "ต้องไม่ติดลบ"),
    feeThb: z.coerce
      .number({ invalid_type_error: "กรุณากรอกตัวเลข" })
      .min(0, "ต้องไม่ติดลบ"),
    // rank band — select values held as strings ("" = ไม่จำกัด)
    minPowerLevel: z.string(),
    maxPowerLevel: z.string(),
    // age band — text input values held as strings ("" = ไม่จำกัด), whole years
    minAge: z.string(),
    maxAge: z.string(),
    // other รุ่น a player may also enter alongside this one (empty = single-only)
    combinableCategoryIds: z.array(z.string()).default([]),
  })
  .superRefine((v, ctx) => {
    if (
      v.minPowerLevel !== "" &&
      v.maxPowerLevel !== "" &&
      Number(v.minPowerLevel) > Number(v.maxPowerLevel)
    ) {
      ctx.addIssue({
        path: ["maxPowerLevel"],
        code: z.ZodIssueCode.custom,
        message: "ระดับสูงสุดต้องไม่ต่ำกว่าระดับต่ำสุด",
      });
    }
    const ageRe = /^\d{1,3}$/; // whole years, no decimals / negatives
    if (v.minAge !== "" && !ageRe.test(v.minAge)) {
      ctx.addIssue({
        path: ["minAge"],
        code: z.ZodIssueCode.custom,
        message: "อายุต้องเป็นจำนวนเต็ม (ปี)",
      });
    }
    if (v.maxAge !== "" && !ageRe.test(v.maxAge)) {
      ctx.addIssue({
        path: ["maxAge"],
        code: z.ZodIssueCode.custom,
        message: "อายุต้องเป็นจำนวนเต็ม (ปี)",
      });
    }
    if (
      ageRe.test(v.minAge) &&
      ageRe.test(v.maxAge) &&
      Number(v.minAge) > Number(v.maxAge)
    ) {
      ctx.addIssue({
        path: ["maxAge"],
        code: z.ZodIssueCode.custom,
        message: "อายุสูงสุดต้องไม่ต่ำกว่าอายุต่ำสุด",
      });
    }
  });

export type CategoryFormValues = z.infer<typeof categorySchema>;

/** Parse a rank-band select value ("" → null) to a power level. */
export function bandValueToPower(v: string): number | null {
  return v === "" ? null : Number(v);
}

/** Parse an age-band input ("" → null) to whole years. */
export function ageValueToInt(v: string): number | null {
  return v.trim() === "" ? null : Number(v);
}
