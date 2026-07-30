import { z } from "zod";
import { DEFAULT_MERCHANT_QR, isValidThaiQr } from "@/lib/promptpay";
import { th } from "@/lib/i18n/dictionaries/th";
import {
  Person,
  RulesBlock,
  RulesSection,
  SCHEDULE_EVENT_TYPES,
  ScheduleEventType,
  ScheduleGroup,
  SeatEditInput,
  SeatInput,
  TITLE_PREFIXES,
  TitlePrefix,
} from "@/lib/data/types";

// ── primitives ────────────────────────────────────────────────────────────
/** Strip the zero-width & formatting code points that silently ride along with
 *  a copy-paste (ZWSP/ZWNJ/ZWJ, LTR/RTL marks, word joiner, BOM, soft hyphen)
 *  and NFC-normalize. Without this, a pasted Thai/English name that *looks*
 *  clean is rejected as "not Thai/English" over a single invisible stray char.
 *  Only removes chars that never legitimately appear in a person's name, so it
 *  can never corrupt a real name — it only makes the check more forgiving. */
export function cleanName(s: string): string {
  // Code points to drop: ZWSP/ZWNJ/ZWJ (U+200B–200D), LTR/RTL marks
  // (U+200E–200F), word joiner (U+2060), BOM/ZWNBSP (U+FEFF), soft hyphen
  // (U+00AD). Listed as hex so no invisible char lives in this source file.
  const strip = new Set([
    0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0xfeff, 0x00ad,
  ]);
  let out = "";
  for (const ch of s.normalize("NFC")) {
    if (!strip.has(ch.codePointAt(0) ?? -1)) out += ch;
  }
  return out;
}

// The public personal form builds its schema per locale via the make* factories
// (messages from t.validation). Everything else — the admin schemas and the
// module-level primitives they share — stays on the Thai defaults, so no admin
// file changes and locale-agnostic callers keep today's behavior.
export type ValidationMessages = typeof th.validation;
const thMsg = th.validation;

function makeThaiName(msg: ValidationMessages) {
  return z
    .string()
    .transform(cleanName)
    .pipe(
      z
        .string()
        .trim()
        .min(1, msg.required)
        .regex(/^[฀-๿\s.'’-]+$/, msg.thaiOnly),
    );
}

const thaiName = makeThaiName(thMsg);

const engName = z
  .string()
  .transform(cleanName)
  .pipe(
    z
      .string()
      .trim()
      .min(1, "Required")
      .regex(/^[A-Za-z\s.'’-]+$/, "กรุณากรอกเป็นภาษาอังกฤษ"),
  );

/** Normalize a Thai mobile to the canonical 0XXXXXXXXX form: keep digits only,
 *  then fold a leading country code (+66 / 66…) back to a leading 0 — so an
 *  iOS-autofilled "+66 81 234 5678" validates the same as "0812345678". */
export function normalizeThaiPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("66") && digits.length === 11) {
    return "0" + digits.slice(2);
  }
  return digits;
}

function makeThaiPhone(msg: ValidationMessages) {
  return z
    .string()
    .trim()
    .min(1, msg.phoneRequired)
    .transform(normalizeThaiPhone)
    .pipe(z.string().regex(/^0[689]\d{8}$/, msg.phoneInvalid));
}

/** Thai mobile: 10 digits starting 06 / 08 / 09 (a leading +66 folds to 0). */
export const thaiPhone = makeThaiPhone(thMsg);

/** English name, optional — blank allowed, but validates the format if filled.
 *  (Many coaches don't have the English name of a child yet; fill it later.) */
function makeEngNameOptional(msg: ValidationMessages) {
  return z
    .string()
    .transform(cleanName)
    .pipe(z.string().trim().regex(/^[A-Za-z\s.'’-]*$/, msg.englishOnly));
}

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

function makeDobSchema(msg: ValidationMessages) {
  return z
    .object({
      d: z.string().regex(/^\d{1,2}$/, msg.dayInvalid),
      m: z.string().regex(/^\d{1,2}$/, msg.monthInvalid),
      y: z.string().regex(/^\d{4}$/, msg.yearFourDigits),
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
          message: msg.birthYearInvalid,
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
          message: msg.dobInvalid,
        });
      }
    });
}

export const dobSchema = makeDobSchema(thMsg);

export type DobValues = z.infer<typeof dobSchema>;

/** Convert validated DOB fields to ISO yyyy-mm-dd. */
export function dobToIso(v: DobValues): string {
  const yCE = yearToCE(v.y);
  const m = Number(v.m);
  const d = Number(v.d);
  return `${yCE}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ── person ───────────────────────────────────────────────────────────────────
function makePersonalShape(msg: ValidationMessages) {
  return {
    titlePrefix: titlePrefixSchema,
    titleCustom: z.string().trim().optional(),
    firstNameTh: makeThaiName(msg),
    lastNameTh: makeThaiName(msg),
    firstNameEn: makeEngNameOptional(msg),
    lastNameEn: makeEngNameOptional(msg),
    hasMiddleName: z.boolean(),
    middleNameTh: z.string().trim().optional(),
    middleNameEn: z.string().trim().optional(),
    phone: makeThaiPhone(msg),
    dob: makeDobSchema(msg),
    powerLevel: z
      .string()
      .min(1, msg.rankRequired)
      .refine((v) => {
        const n = Number(v);
        return Number.isInteger(n) && n >= 0 && n <= 22;
      }, msg.rankInvalid),
    province: z.string().trim().min(1, msg.provinceRequired),
    instituteId: z.string().nullable(),
    instituteName: z.string().trim().min(1, msg.instituteRequired),
    pdpaConsent: z.boolean().refine((v) => v === true, msg.pdpaRequired),
  };
}

function makePersonalRefine(msg: ValidationMessages) {
  return (
    v: {
      titlePrefix: string;
      titleCustom?: string;
      hasMiddleName: boolean;
      middleNameTh?: string;
      middleNameEn?: string;
    },
    ctx: z.RefinementCtx,
  ) => {
    if (v.titlePrefix === "อื่นๆ" && !v.titleCustom?.trim()) {
      ctx.addIssue({
        path: ["titleCustom"],
        code: z.ZodIssueCode.custom,
        message: msg.titleCustomRequired,
      });
    }
    if (v.hasMiddleName) {
      if (!v.middleNameTh?.trim()) {
        ctx.addIssue({
          path: ["middleNameTh"],
          code: z.ZodIssueCode.custom,
          message: msg.middleNameRequired,
        });
      }
      // middleNameEn is optional — fill in the English middle name later.
    }
  };
}

const personalRefine = makePersonalRefine(thMsg);

/** Step A — applicant personal info (no category), in the given locale's
 *  messages. Public forms pass `t.validation` (memoized on locale); the
 *  default keeps every existing Thai call site working unchanged. */
export function makePersonalSchema(msg: ValidationMessages = thMsg) {
  return z.object(makePersonalShape(msg)).superRefine(makePersonalRefine(msg));
}

/** Step A — applicant personal info (no category). */
export const personalSchema = makePersonalSchema();

/** Full registrant — personal info + chosen category. */
export const personSchema = z
  .object({
    ...makePersonalShape(thMsg),
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
    phone: normalizeThaiPhone(v.phone),
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
  matchedGoPlayerId: string | null;
  personId: string | null; // go_person canonical link (set by the rank picker)
  rankSelfDeclared: boolean; // user typed their own rank (manual / not-in-list)
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
    matchedGoPlayerId: null,
    personId: null,
    rankSelfDeclared: false,
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
    phone: normalizeThaiPhone(v.phone),
    dob: dobToIso(v.dob),
    powerLevel: v.powerLevel === "" ? null : Number(v.powerLevel),
    matchedGoPlayerId: v.matchedGoPlayerId,
    personId: v.personId,
    rankSelfDeclared: v.rankSelfDeclared,
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
    matchedGoPlayerId: p.matchedGoPlayerId ?? null,
    personId: p.personId ?? null,
    rankSelfDeclared: p.rankSelfDeclared ?? false,
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

// ── admin: rules builder (กฎ กติกา แบ่งหัวข้อ, block editor) ────────────────

const rulesListItemSchema = z.object({
  text: z.string().max(2000),
  depth: z.number().int().min(0).max(6),
});

export const rulesBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().max(500) }),
  z.object({ type: z.literal("paragraph"), text: z.string().max(5000) }),
  z.object({
    type: z.literal("list"),
    ordered: z.boolean(),
    items: z.array(rulesListItemSchema).max(300),
  }),
  z.object({
    type: z.literal("table"),
    hasHeader: z.boolean(),
    rows: z.array(z.array(z.string().max(2000)).max(20)).max(200),
  }),
  z.object({ type: z.literal("divider") }),
  z.object({
    type: z.literal("callout"),
    tone: z.enum(["info", "warn"]),
    text: z.string().max(2000),
  }),
]);

/** One กฎ กติกา section in the form: a title plus its ordered content blocks. */
export const rulesSectionSchema = z.object({
  title: z.string().trim().min(1, "กรอกชื่อหัวข้อ").max(200, "ชื่อหัวข้อยาวเกินไป"),
  blocks: z.array(rulesBlockSchema).max(60, "สูงสุด 60 บล็อกต่อหัวข้อ"),
});

export type RulesSectionFormValues = z.infer<typeof rulesSectionSchema>;

export function emptyRulesSection(): RulesSectionFormValues {
  return { title: "", blocks: [] };
}

/** A freshly-added block of the given type, pre-filled with one empty row/item
 *  so the admin has something to type into right away. */
export function emptyBlock(type: RulesBlock["type"]): RulesBlock {
  switch (type) {
    case "heading":
      return { type: "heading", text: "" };
    case "paragraph":
      return { type: "paragraph", text: "" };
    case "list":
      return { type: "list", ordered: false, items: [{ text: "", depth: 0 }] };
    case "table":
      return {
        type: "table",
        hasHeader: true,
        rows: [
          ["", ""],
          ["", ""],
        ],
      };
    case "divider":
      return { type: "divider" };
    case "callout":
      return { type: "callout", tone: "info", text: "" };
  }
}

// ── admin: tournament config ──────────────────────────────────────────────
export const tournamentConfigSchema = z
  .object({
    nameTh: z.string().trim().min(1, "กรุณากรอกชื่อรายการ"),
    bannerUrl: z.string().trim().optional().or(z.literal("")),
    venueMapUrl: z.string().trim().optional().or(z.literal("")),
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
    // rulesSections are edited on their own /admin/rules page, not here.
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
