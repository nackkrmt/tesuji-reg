// ───────────────────────────────────────────────────────────────────────────
// TesujiReg — canonical data model + DataLayer contract.
// Both the Milestone-1 MockDataLayer (localStorage) and the future
// SupabaseDataLayer implement this exact interface, so swapping backends never
// touches a single component.
// ───────────────────────────────────────────────────────────────────────────

export type TitlePrefix =
  | "นาย"
  | "นาง"
  | "นางสาว"
  | "เด็กชาย"
  | "เด็กหญิง"
  | "อื่นๆ";

export const TITLE_PREFIXES: TitlePrefix[] = [
  "นาย",
  "นาง",
  "นางสาว",
  "เด็กชาย",
  "เด็กหญิง",
  "อื่นๆ",
];

export type TournamentStatus = "draft" | "published" | "closed";
// Only merchant QR (K SHOP / Thai-QR Bill Payment) is supported. The personal
// phone / national-id PromptPay proxies were removed. Kept as a named type (and
// the DB column) for forward-compat, but it always holds "merchant_qr".
export type PromptPayTargetType = "merchant_qr";
export type RegistrationKind = "self" | "group";

// ── Schedule (กำหนดการ) ──────────────────────────────────────────────────────
/** Kinds of programme entry on the tournament schedule. */
export type ScheduleEventType =
  | "match" // แข่งขัน (เลือกรุ่น + กระดานที่ …)
  | "opening" // พิธีเปิด
  | "lunch" // พักเที่ยง
  | "closing" // พิธีปิด
  | "award" // มอบรางวัล
  | "lucky_draw"; // จับฉลากของขวัญ

export const SCHEDULE_EVENT_TYPES: ScheduleEventType[] = [
  "match",
  "opening",
  "lunch",
  "closing",
  "award",
  "lucky_draw",
];

export const SCHEDULE_EVENT_LABEL: Record<ScheduleEventType, string> = {
  match: "แข่งขัน",
  opening: "พิธีเปิด",
  lunch: "พักเที่ยง",
  closing: "พิธีปิด",
  award: "มอบรางวัล",
  lucky_draw: "จับฉลากของขวัญ",
};

export const SCHEDULE_EVENT_ICON: Record<ScheduleEventType, string> = {
  match: "♟️",
  opening: "🎌",
  lunch: "🍱",
  closing: "🏁",
  award: "🏆",
  lucky_draw: "🎁",
};

/** One timed entry within a รุ่น's schedule (เพิ่มทีละอัน). */
export interface ScheduleEntry {
  id: string;
  time: string; // free text, e.g. "09:00" หรือ "09:00–10:30"
  type: ScheduleEventType;
  boardNumber: string | null; // match เท่านั้น: กระดานที่ …
  note: string | null; // หมายเหตุเพิ่มเติม (optional)
}

/** A set of รุ่น that share one schedule (รุ่นที่แข่งเวลาเดียวกันอยู่ตารางเดียว)
 *  with its own ordered list of timed entries. Stored JSON-encoded in the
 *  tournament's schedule column. */
export interface ScheduleGroup {
  categoryIds: string[]; // รุ่น ในตารางนี้ (อ้างถึง category.id; เลือกได้หลายรุ่น)
  entries: ScheduleEntry[];
}

/** One content block inside a กฎ กติกา section, authored in the admin block
 *  editor and rendered verbatim on /rules — no text-convention parsing. */
export type RulesBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: { text: string; depth: number }[] }
  | { type: "table"; hasHeader: boolean; rows: string[][] } // rows[0] = header row when hasHeader
  | { type: "divider" }
  | { type: "callout"; tone: "info" | "warn"; text: string };

export const RULES_BLOCK_TYPES: RulesBlock["type"][] = [
  "heading",
  "paragraph",
  "list",
  "table",
  "divider",
  "callout",
];

export const RULES_BLOCK_LABEL: Record<RulesBlock["type"], string> = {
  heading: "หัวข้อ",
  paragraph: "ข้อความ",
  list: "รายการ",
  table: "ตาราง",
  divider: "เส้นคั่น",
  callout: "หมายเหตุ",
};

/** One กฎ กติกา section: a title plus its ordered blocks — rendered as-is on
 *  /rules. Stored JSON-encoded in the rules_text column. `items` is the
 *  legacy line-based body (pre-block-editor rows); kept read-only as a
 *  fallback for sections not yet re-authored with blocks. */
export interface RulesSection {
  title: string;
  blocks: RulesBlock[];
  items?: string[];
}

/** Lifecycle of a seat reservation (the 15-minute hold). */
export type HoldStatus = "active" | "consumed" | "released" | "expired";

/** Lifecycle of a registration batch. */
export type RegistrationStatus =
  | "draft"
  | "pending_payment" // seats held, 15-min timer running
  | "pending_review" // slip uploaded + submitted, awaiting admin
  | "confirmed"
  | "rejected"
  | "expired"
  | "cancelled";

export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string> = {
  draft: "ร่าง",
  pending_payment: "รอชำระเงิน",
  pending_review: "รอตรวจสอบ",
  confirmed: "ยืนยันแล้ว",
  rejected: "ปฏิเสธ",
  expired: "หมดเวลา",
  cancelled: "ยกเลิก",
};

// ── Entities ────────────────────────────────────────────────────────────────

export interface Tournament {
  id: string;
  nameTh: string;
  bannerUrl: string | null;
  competitionDate: string; // ISO date "yyyy-mm-dd" (date-only); legacy rows may hold free text
  locationText: string;
  locationMapsUrl: string;
  registrationOpensAt: string; // ISO datetime
  registrationClosesAt: string; // ISO datetime
  scheduleGroups: ScheduleGroup[]; // กำหนดการ จัดกลุ่มตามรุ่น (JSON in schedule_text column)
  rulesSections: RulesSection[]; // กฎ กติกา แบ่งหัวข้อ (JSON in rules_text column)
  promptpayTargetType: PromptPayTargetType;
  promptpayTargetValue: string;
  status: TournamentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  tournamentId: string;
  code: string; // รหัสรุ่น
  name: string; // ชื่อรุ่น
  capacity: number; // จำนวนที่เปิดรับ
  seatsTaken: number; // counter: active holds + consumed holds + confirmed
  feeThb: number; // ค่าสมัคร
  minPowerLevel?: number | null; // accepted rank band (null = unbounded that side)
  maxPowerLevel?: number | null;
  minAge?: number | null; // accepted age band, whole years (null = unbounded that side)
  maxAge?: number | null;
  // Other รุ่น in the same tournament a player may ALSO enter alongside this one
  // (e.g. 9x9 + 13x13, played at different times). Empty = single-division only.
  combinableCategoryIds: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** remaining = capacity − seatsTaken (never stored). */
export function remainingSeats(c: Category): number {
  return Math.max(0, c.capacity - c.seatsTaken);
}

/** Person data captured per registrant. */
export interface Person {
  titlePrefix: TitlePrefix;
  titleCustom?: string | null;
  firstNameTh: string;
  lastNameTh: string;
  firstNameEn: string;
  lastNameEn: string;
  hasMiddleName: boolean;
  middleNameTh?: string | null;
  middleNameEn?: string | null;
  phone: string;
  dob: string; // ISO yyyy-mm-dd
  powerLevel?: number | null; // Go rank as 0..25 (higher = stronger); see lib/rank.ts
  rankStatus?: RankStatus; // 'verified' (matched DB / admin-approved) or 'pending'
  matchedGoPlayerId?: string | null; // go_player_database row when matched (ephemeral — nulled each import)
  personId?: string | null; // go_person canonical identity link (durable across imports)
  // Optional on the type (existing rows may lack them); the form schema makes
  // them required for new saves.
  province?: string | null; // จังหวัดที่อาศัย (Thai province name)
  instituteId?: string | null; // go_institute row when chosen/created
  instituteName?: string | null; // display name snapshot (free text or institute)
  pdpaConsent?: boolean; // ticked the PDPA consent box
  pdpaConsentAt?: string | null; // ISO datetime consent was recorded
}

/** A Go academy / institute the player studies at (สถาบันหมากล้อม). */
export interface GoInstitute {
  id: string;
  nameTh: string;
  active: boolean;
  /** Search aliases — typing any of these in the picker surfaces this institute
   *  even when the query isn't part of nameTh (e.g. "ครูม่อน" → "Buddy GO"). */
  keywords: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GoInstituteInput {
  id?: string;
  nameTh: string;
  active?: boolean;
  /** Omit to leave existing keywords untouched; pass an array to replace them. */
  keywords?: string[];
}

/** A recorded, reversible institute merge (source folded into target). Persisted
 *  so it can be split back apart at any time. */
export interface InstituteMerge {
  id: string;
  sourceName: string;
  targetName: string;
  targetId: string;
  mergedAt: string;
  /** Number of profiles + players + seats re-pointed by this merge. */
  movedCount: number;
}

export type RankStatus = "verified" | "pending";
export type GoPlayerSource = "dan" | "kyu" | "award";

/** A candidate from the DAN/KYU/AWARD databases when matching a name. */
export interface RankCandidate {
  id: string;
  source: GoPlayerSource;
  firstNameTh: string;
  lastNameTh: string;
  rank: string;
  powerLevel: number;
  rating: number | null;
  matchType: "exact" | "normalized" | "fuzzy";
  similarityScore: number;
  evidence: string[]; // human-readable proof lines
  // Canonical go_person row this candidate's name resolves to (the durable link).
  personId: string | null;
  personPowerLevel: number | null; // registry-resolved power (null when ambiguous / reserved)
  personAmbiguous: boolean; // registry couldn't resolve one power for this name
}

export type RankSearchResult =
  | { status: "matched"; candidate: RankCandidate; candidates: RankCandidate[] }
  | { status: "multiple"; candidates: RankCandidate[] }
  | { status: "not_found"; candidates: [] };

/** Counts returned by an import / manual sync (admin_import_rank_database /
 *  admin_sync_player_ranks). `imported` is present only on the import path. */
export interface RankSyncSummary {
  imported?: number; // go_player_database rows written (import only)
  persons: number; // total go_person rows after refresh
  ambiguous: number; // person rows whose strong candidates disagree on power
  missing: number; // person rows no longer backed by any go_player_database row
  linkedProfiles: number; // profiles newly auto-linked this run
  linkedPlayers: number;
  updatedProfiles: number; // linked profiles whose power/status changed
  updatedPlayers: number;
}

/** A live seat whose occupant's CURRENT rank violates the division band.
 *  Seat snapshots are never retro-edited — this is the admin worklist. */
export interface RankConflict {
  seatId: string;
  batchReference: string;
  tournamentName: string;
  categoryCode: string;
  categoryName: string;
  firstNameTh: string;
  lastNameTh: string;
  seatPowerLevel: number | null; // rank snapshotted at registration time
  currentPowerLevel: number | null; // occupant's rank now
  minPowerLevel: number | null;
  maxPowerLevel: number | null;
  sourceKind: "self" | "managed_player";
}

/** 1-kyu award-ceiling status for a name (from the award_limit_status RPC).
 *  `banned` is the single source of truth, mirrored by reserve_seats. */
export interface AwardLimitStatus {
  count: number; // distinct 1-kyu award events matched to this name
  inDan: boolean; // already in the dan database → never banned
  exempt: boolean; // admin-exempted → never banned
  banned: boolean; // count >= 3 AND !inDan AND !exempt
}

/** An admin-created exemption from the 1-kyu award ceiling — the escape hatch for
 *  a Thai-name false-positive (two different people, same normalized name). */
export interface AwardLimitExemption {
  id: string;
  firstNameTh: string;
  lastNameTh: string;
  note: string | null;
  createdAt: string;
}

/** A normalized row ready to import into go_player_database. */
export interface GoPlayerImportRow {
  seq: string | null;
  prefix_th: string | null;
  first_name_th: string;
  last_name_th: string;
  first_name_th_normalized: string;
  last_name_th_normalized: string;
  rank: string;
  power_level: number;
  rating: number | null;
  year_promoted: number | null;
  diamond: string | null;
  category: string | null;
  rank_in_category: string | null;
  rank_award: number | null;
  event_name: string | null;
  event_date: string | null;
  raw_data: Record<string, unknown>;
}


export interface RegistrationSeat extends Person {
  id: string;
  batchId: string;
  categoryId: string;
  feeThbSnapshot: number;
  createdAt: string;
  /** When set, the occupant withdrew from the competition: the name is hidden
   *  from the public roster and the seat was returned to capacity, but the row
   *  is kept so the batch total never changes (the dashboard nets refunded
   *  fees out at display time instead). */
  withdrawnAt?: string | null;
}

export interface SeatHoldLine {
  categoryId: string;
  seats: number;
}

export interface SeatHold {
  id: string;
  tournamentId: string;
  batchId: string;
  status: HoldStatus;
  expiresAt: string; // ISO, created + 15 min
  lines: SeatHoldLine[];
  createdAt: string;
  releasedAt?: string | null;
}

/** Automated slip-check outcome (SlipOK). 'demo' = no API key set yet. */
export type SlipVerifyStatus =
  | "verified"
  | "amount_mismatch"
  | "receiver_mismatch" // amount is right but the money went to the wrong account
  | "duplicate"
  | "failed"
  | "demo";

export interface SlipVerifyData {
  mode: "live" | "demo";
  amount: number | null;
  expectedAmount: number;
  amountMatches: boolean;
  receiver?: string | null;
  /** Receiver PromptPay proxy (phone / national id), masked by SlipOK. */
  receiverProxy?: string | null;
  /** Bank the money landed in, per SlipOK. */
  receivingBank?: string | null;
  /** true = receiver confirmed to match the tournament account, false = clear
   *  mismatch, null/undefined = couldn't be determined (e.g. merchant QR). */
  receiverMatches?: boolean | null;
  expectedReceiver?: string | null;
  sender?: string | null;
  transRef?: string | null;
  transDate?: string | null;
  transTime?: string | null;
  code?: number | null;
  message?: string | null;
  note?: string | null;
}

export interface SlipVerifyResult {
  status: SlipVerifyStatus;
  data: SlipVerifyData;
}

export interface RegistrationBatch {
  id: string;
  tournamentId: string;
  accountId?: string | null; // owning auth user (set by reserve_seats)
  kind: RegistrationKind;
  submitterPhone: string;
  submitterName?: string | null;
  /** Display name of the account owner who submitted this batch (from their
   *  profile). Resolved server-side; admin-facing. */
  ownerName?: string | null;
  /** Email of the account owner (from auth.users). Admin-facing. */
  ownerEmail?: string | null;
  status: RegistrationStatus;
  holdId: string | null;
  totalAmountThb: number;
  paymentSlipUrl: string | null;
  adminNote?: string | null;
  referenceCode: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  slipVerifyStatus?: SlipVerifyStatus | null;
  slipVerifyData?: SlipVerifyData | null;
  slipVerifiedAt?: string | null;
  /** Applied promo/discount code (snapshot on the batch). null = none. */
  promoCode?: string | null;
  promoKind?: PromoKind | null;
  promoValue?: number | null;
  /** Baht knocked off the gross by the promo. `totalAmountThb` is already net. */
  discountThb?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BatchWithSeats {
  batch: RegistrationBatch;
  seats: RegistrationSeat[];
  hold: SeatHold | null;
}

/**
 * Registration statuses that mean a seat is "live" — the person is committed to
 * a competition (held & paying, awaiting review, or confirmed). Used to decide
 * when a managed player can no longer be deleted.
 */
export const ACTIVE_REGISTRATION_STATUSES: readonly RegistrationStatus[] = [
  "pending_payment",
  "pending_review",
  "confirmed",
];

/**
 * Stable identity key for matching a person across their profile and the
 * denormalized registration seats (seats don't store a player id). Names are
 * trimmed + whitespace-collapsed + lower-cased; dob disambiguates same-name
 * players.
 */
export function personMatchKey(
  p: Pick<Person, "firstNameTh" | "lastNameTh" | "dob">,
): string {
  const norm = (s: string | null | undefined) =>
    (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return [norm(p.firstNameTh), norm(p.lastNameTh), (p.dob ?? "").trim()].join("|");
}

/** Display label used in eligibility / duplicate error payloads:
 *  "<คำนำหน้า><ชื่อ> <นามสกุล>" (no middle name — mirrors the SQL messages;
 *  use fullNameTh for the middle-name-aware roster form). */
export function personLabel(p: {
  titlePrefix: string;
  titleCustom?: string | null;
  firstNameTh: string;
  lastNameTh: string;
}): string {
  const title = p.titlePrefix === "อื่นๆ" ? p.titleCustom ?? "" : p.titlePrefix;
  return `${title}${p.firstNameTh} ${p.lastNameTh}`.trim();
}

/** "Active" tournament rule shared by both data layers and the live snapshot:
 *  the most recently updated `published` tournament, else the most recently
 *  updated one at all (so admins can preview drafts). `rowsNewestFirst` must
 *  already be sorted by updated-at descending. */
export function pickActiveTournament<T extends { status: string }>(
  rowsNewestFirst: readonly T[],
): T | null {
  return (
    rowsNewestFirst.find((t) => t.status === "published") ??
    rowsNewestFirst[0] ??
    null
  );
}

/** Identity keys that currently hold a live registration (see statuses above).
 *  Withdrawn seats are skipped — that person no longer occupies a seat, so their
 *  managed-player row becomes deletable again. */
export function activeRegistrationKeys(regs: BatchWithSeats[]): Set<string> {
  const keys = new Set<string>();
  for (const r of regs) {
    if (!ACTIVE_REGISTRATION_STATUSES.includes(r.batch.status)) continue;
    for (const s of r.seats) {
      if (s.withdrawnAt) continue;
      keys.add(personMatchKey(s));
    }
  }
  return keys;
}

export interface CategoryStat {
  categoryId: string;
  capacity: number;
  remaining: number;
  held: number; // active + consumed holds
  confirmed: number;
}

export interface ParticipantRow {
  fullNameTh: string;
  categoryCode: string;
  categoryName: string;
  // 'confirmed' = ผู้จัดยืนยันแล้ว, 'pending_review' = ส่งสลิปแล้วรอตรวจสอบ
  status: "confirmed" | "pending_review";
}

// ── Accounts (Milestone 3) ───────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
}

/** A person's own saved profile (reused across registrations). */
export type ProfileInput = Person;
export interface Profile extends Person {
  id: string; // = auth user id
}

/** A reusable player a logged-in user manages (e.g. coach's students). */
export interface ManagedPlayer extends Person {
  id: string;
}
export interface ManagedPlayerInput extends Person {
  id?: string;
}

// ── Inputs / DTOs ─────────────────────────────────────────────────────────────

export interface TournamentInput {
  id?: string;
  nameTh: string;
  bannerUrl?: string | null;
  competitionDate: string;
  locationText: string;
  locationMapsUrl: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  scheduleGroups: ScheduleGroup[];
  rulesSections: RulesSection[];
  promptpayTargetType: PromptPayTargetType;
  promptpayTargetValue: string;
  status?: TournamentStatus;
}

export interface CategoryInput {
  id?: string;
  tournamentId: string;
  code: string;
  name: string;
  capacity: number;
  feeThb: number;
  minPowerLevel?: number | null;
  maxPowerLevel?: number | null;
  minAge?: number | null;
  maxAge?: number | null;
  combinableCategoryIds?: string[];
  sortOrder?: number;
}

export interface SeatInput extends Person {
  categoryId: string;
  sourceKind?: "self" | "managed_player";
  sourcePlayerId?: string | null;
}

export interface ReserveSeatsInput {
  tournamentId: string;
  kind: RegistrationKind;
  submitterPhone: string;
  seats: SeatInput[];
}

export type ReserveSeatsError =
  | {
      ok: false;
      error: "INSUFFICIENT_SEATS";
      categoryId: string;
      categoryName: string;
      remaining: number;
      requested: number;
    }
  | { ok: false; error: "CATEGORY_NOT_FOUND"; categoryId: string }
  | { ok: false; error: "REGISTRATION_CLOSED" }
  | { ok: false; error: "EMPTY_BATCH" }
  | { ok: false; error: "TOO_MANY"; max: number }
  | {
      ok: false;
      error: "RANK_NOT_ELIGIBLE";
      categoryId: string;
      categoryName: string;
      personLabel: string;
      powerLevel: number;
      minPowerLevel: number | null;
      maxPowerLevel: number | null;
    }
  | {
      ok: false;
      error: "RANK_REQUIRED";
      categoryId: string;
      categoryName: string;
      personLabel: string;
    }
  | {
      ok: false;
      error: "AGE_NOT_ELIGIBLE";
      categoryId: string;
      categoryName: string;
      personLabel: string;
      age: number;
      minAge: number | null;
      maxAge: number | null;
    }
  | { ok: false; error: "PLAYER_NOT_FOUND" }
  | { ok: false; error: "INVALID_SOURCE" }
  | {
      ok: false;
      error: "COMBINATION_NOT_ALLOWED";
      personLabel: string;
      categoryName: string;
      otherCategoryName: string;
    }
  // Same person already holds this รุ่น (in another batch / earlier submission).
  | {
      ok: false;
      error: "DUPLICATE_REGISTRATION";
      personLabel: string;
      categoryName: string;
      referenceCode: string | null;
    }
  // 1-kyu award ceiling — 3+ distinct 1-kyu medals, not yet in the dan database
  // (and not admin-exempted). Blocks every division until dan is passed.
  | {
      ok: false;
      error: "AWARD_LIMIT_REACHED";
      personLabel: string;
      awardCount: number;
      requiresAdminOverride: boolean;
    };

export type ReserveSeatsResult =
  | {
      ok: true;
      batchId: string;
      holdId: string;
      expiresAt: string;
      totalAmountThb: number;
      referenceCode: string;
    }
  | ReserveSeatsError;

export interface SubmitInput {
  batchId: string;
  slipUrl: string;
}

// ── Withdraw (ถอนตัว) + Swap participant (เปลี่ยนคนเข้าแข่งขัน) ──────────────────

/** Refund handling state for a withdrawal (decided off-system by the organizer). */
export type RefundStatus = "pending" | "refunded" | "denied";

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  pending: "รอดำเนินการ",
  refunded: "คืนเงินแล้ว",
  denied: "ไม่คืนเงิน",
};

/** A recorded seat withdrawal — snapshots the person/รุ่น/fee plus the refund
 *  destination the applicant gave, for the admin refund list. */
export interface Withdrawal {
  id: string;
  seatId: string;
  batchId: string;
  tournamentId: string;
  personName: string;
  categoryId: string | null;
  categoryLabel: string;
  feeThb: number;
  batchReference: string;
  reason: string | null;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  refundStatus: RefundStatus;
  /** Refund-proof slip: bare object path in the private slip bucket (Supabase)
   *  or a data URL (mock). Set when the admin marks the row refunded. */
  refundSlipUrl: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface WithdrawSeatInput {
  seatId: string;
  reason?: string | null;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
}

export type WithdrawSeatResult =
  | { ok: true; withdrawalId: string }
  | {
      ok: false;
      error:
        | "AUTH_REQUIRED"
        | "SEAT_NOT_FOUND"
        | "FORBIDDEN"
        | "BATCH_NOT_ACTIVE"
        | "ALREADY_WITHDRAWN"
        | "INVALID_FIELD";
    };

export interface SwapSeatInput {
  seatId: string;
  sourceKind: "self" | "managed_player";
  sourcePlayerId?: string | null;
  categoryId: string;
}

/** Swap outcome. Reuses the ReserveSeatsError shapes for the shared eligibility
 *  failures (rank / age / duplicate / combinable / award / capacity) so the
 *  register-flow toast copy applies verbatim, plus the swap-specific codes. */
export type SwapSeatResult =
  | { ok: true }
  | ReserveSeatsError
  | { ok: false; error: "FEE_MISMATCH"; categoryName: string }
  | {
      ok: false;
      error:
        | "AUTH_REQUIRED"
        | "SEAT_NOT_FOUND"
        | "FORBIDDEN"
        | "BATCH_NOT_ACTIVE"
        | "ALREADY_WITHDRAWN"
        | "SWAP_CLOSED"
        | "SAME_PERSON";
    };

// ── Promo / discount / free-registration codes ──────────────────────────────
export type PromoKind = "free" | "percent" | "fixed";

/** A discount code scoped to one tournament. `free` waives the whole fee,
 *  `percent` takes value% off, `fixed` takes value baht off (capped at total). */
export interface PromoCode {
  id: string;
  tournamentId: string;
  code: string;
  kind: PromoKind;
  value: number; // percent: 0–100 · fixed: baht · free: ignored
  maxUses: number | null; // null = unlimited
  usedCount: number;
  validFrom: string | null; // ISO datetime
  validUntil: string | null; // ISO datetime
  active: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromoCodeInput {
  id?: string;
  tournamentId: string;
  code: string;
  kind: PromoKind;
  value: number;
  maxUses?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  active?: boolean;
  note?: string | null;
}

/** Result of previewing a code against a batch. The discounted total is written
 *  onto the batch server-side; usage is only counted later, at submit. */
export type ApplyPromoResult =
  | {
      ok: true;
      totalAmountThb: number;
      discountThb: number;
      isFree: boolean;
      kind: PromoKind | null;
      code: string | null;
    }
  | { ok: false; error: string };

/** Admin edit of a single registered seat (person info + chosen รุ่น).
 *  Rank + age are always re-validated against the chosen รุ่น; the seat count
 *  and fee snapshot are re-booked only when the รุ่น actually changes. */
export interface SeatEditInput {
  titlePrefix: TitlePrefix;
  titleCustom?: string | null;
  firstNameTh: string;
  lastNameTh: string;
  firstNameEn: string;
  lastNameEn: string;
  hasMiddleName: boolean;
  middleNameTh?: string | null;
  middleNameEn?: string | null;
  phone: string;
  dob: string; // ISO yyyy-mm-dd
  powerLevel?: number | null;
  categoryId: string;
}

// ── The contract ──────────────────────────────────────────────────────────────

export interface DataLayer {
  // Tournament
  getActiveTournament(): Promise<Tournament | null>;
  getTournament(id: string): Promise<Tournament | null>;
  listTournaments(): Promise<Tournament[]>;
  upsertTournament(input: TournamentInput): Promise<Tournament>;
  setTournamentStatus(
    id: string,
    status: TournamentStatus,
  ): Promise<Tournament>;
  /** Danger zone (admin, irreversible). `confirmName` must equal the tournament
   *  name exactly or the server refuses. */
  // Clear all registrations; keep tournament + categories. Returns batches removed.
  clearRegistrations(tournamentId: string, confirmName: string): Promise<number>;
  // Clear registrations AND delete all categories; keep the tournament. Returns categories removed.
  clearCategories(tournamentId: string, confirmName: string): Promise<number>;
  // Delete the whole tournament (categories + registrations + the tournament).
  deleteTournament(tournamentId: string, confirmName: string): Promise<void>;

  // Categories
  listCategories(tournamentId: string): Promise<Category[]>;
  listCategoryStats(tournamentId: string): Promise<CategoryStat[]>;
  upsertCategory(input: CategoryInput): Promise<Category>;
  deleteCategory(categoryId: string): Promise<void>;

  // Reservation + registration (the heart)
  reserveSeats(input: ReserveSeatsInput): Promise<ReserveSeatsResult>;
  getBatch(batchId: string): Promise<BatchWithSeats | null>;
  /** Admin-gated single-batch read (no owner check; used by admin review). */
  getBatchAdmin(batchId: string): Promise<BatchWithSeats | null>;
  getHold(holdId: string): Promise<SeatHold | null>;
  releaseBatch(batchId: string): Promise<void>; // user goes Back / cancel
  submitRegistration(input: SubmitInput): Promise<RegistrationBatch>;

  // Admin review
  listRegistrations(
    tournamentId: string,
    status?: RegistrationStatus | "all",
  ): Promise<BatchWithSeats[]>;
  confirmRegistration(
    batchId: string,
    adminId: string,
  ): Promise<RegistrationBatch>;
  rejectRegistration(
    batchId: string,
    adminId: string,
    note: string,
  ): Promise<RegistrationBatch>;
  /** Admin edits one seat's person info / รุ่น. Re-validates eligibility and
   *  re-books seat counts when the รุ่น changes. Returns the refreshed batch. */
  updateSeat(
    batchId: string,
    seatId: string,
    input: SeatEditInput,
    adminId: string,
  ): Promise<BatchWithSeats>;
  /** Admin removes one person from a batch (refunds that seat). If it was the
   *  last seat the batch is cancelled. Returns the refreshed batch. */
  deleteSeat(
    batchId: string,
    seatId: string,
    adminId: string,
  ): Promise<BatchWithSeats>;
  /** Admin removes a whole registration (refunds all its held seats). */
  deleteBatch(batchId: string, adminId: string): Promise<void>;
  /** Verify a batch's payment slip automatically (SlipOK). Stores + returns the
   *  result; the batch's slipVerify* fields refresh on next read. */
  verifySlip(batchId: string): Promise<SlipVerifyResult>;
  /** Resolve a batch's payment slip to a short-lived, viewable signed URL (admin
   *  only). Returns null when there is no slip. */
  getSlipUrl(batchId: string): Promise<string | null>;

  /** The current logged-in user's own registrations (newest first). Scoped
   *  server-side to account_id = auth.uid(); empty when signed out. */
  listMyRegistrations(): Promise<BatchWithSeats[]>;

  // Withdraw + Swap (owner-facing, on /my-registrations)
  /** Owner withdraws one seat. The seat's name leaves the public roster and its
   *  seat returns to capacity, but the batch total is untouched — the dashboard
   *  nets refunded fees out at display time once the admin marks the refund
   *  done. Records the refund bank info + reason for the admin withdrawals
   *  list. Allowed on confirmed / pending_review batches, no deadline. */
  withdrawSeat(input: WithdrawSeatInput): Promise<WithdrawSeatResult>;
  /** Owner replaces one seat's occupant with self / a managed player, optionally
   *  moving to another รุ่น of the SAME fee. Re-validates rank / age / duplicate
   *  / combinable / award server-side against the DB-read person. No money moves.
   *  Allowed on confirmed / pending_review batches until registration closes. */
  swapSeat(input: SwapSeatInput): Promise<SwapSeatResult>;
  /** admin; all withdrawals for a tournament (newest first) with refund info. */
  adminListWithdrawals(tournamentId: string): Promise<Withdrawal[]>;
  /** admin; set a withdrawal's refund status (pending / refunded / denied).
   *  Setting "refunded" requires a refund-proof slip (data URL) and permanently
   *  locks the row — any later change throws LOCKED; missing slip throws
   *  SLIP_REQUIRED. pending ⇄ denied stay free. */
  adminSetWithdrawalStatus(
    withdrawalId: string,
    status: RefundStatus,
    refundSlip?: string | null,
  ): Promise<Withdrawal>;
  /** admin; resolve a withdrawal's refund-proof slip reference (from
   *  Withdrawal.refundSlipUrl) to a viewable URL — short-lived signed URL on
   *  Supabase, the stored data URL on mock. Null when unresolvable. */
  getRefundSlipUrl(ref: string): Promise<string | null>;

  // Public participants (confirmed only)
  listParticipants(tournamentId: string): Promise<ParticipantRow[]>;

  // Housekeeping + payment
  refreshExpired(tournamentId?: string): Promise<number>;
  buildPromptPayPayload(
    tournamentId: string,
    amountThb: number,
  ): Promise<string>;

  // Auth (Milestone 3)
  getCurrentUser(): Promise<AuthUser | null>;
  signUp(
    email: string,
    password: string,
  ): Promise<{ user: AuthUser | null; needsEmailConfirm: boolean }>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  onAuthChange(cb: (user: AuthUser | null) => void): () => void;
  /** True when the signed-in account holds the admin role (gates the /admin UI). */
  isAdmin(): Promise<boolean>;
  /** Email a password-reset link that lands the user on /reset-password. */
  requestPasswordReset(email: string): Promise<void>;
  /** Set a new password for the current (recovery) session. */
  updatePassword(newPassword: string): Promise<void>;

  // Own profile
  getMyProfile(): Promise<Profile | null>;
  upsertMyProfile(input: ProfileInput): Promise<Profile>;

  // Managed players (own roster)
  listMyPlayers(): Promise<ManagedPlayer[]>;
  upsertMyPlayer(input: ManagedPlayerInput): Promise<ManagedPlayer>;
  deleteMyPlayer(playerId: string): Promise<void>;

  // Go institutes (สถาบันหมากล้อม) — the institute picker + admin curation
  listInstitutes(): Promise<GoInstitute[]>; // active only, for the picker
  findOrCreateInstitute(name: string): Promise<GoInstitute>; // "type a new one"
  adminListInstitutes(): Promise<GoInstitute[]>; // admin; includes archived
  upsertInstitute(input: GoInstituteInput): Promise<GoInstitute>; // admin
  deleteInstitute(id: string): Promise<void>; // admin; archives (active=false)
  purgeInstitute(id: string): Promise<void>; // admin; hard delete (fails if in use)
  /** admin; merge `sourceId` into `targetId`: re-point all references to the
   *  target, fold the source's name + keywords into the target's keywords,
   *  then delete the source. Records a reversible history row and returns its
   *  id (pass to unmergeInstitute). */
  mergeInstitute(sourceId: string, targetId: string): Promise<string>;
  /** admin; split a recorded merge back apart by its history id. Works at any
   *  time, safely skipping rows that have since moved elsewhere. */
  unmergeInstitute(mergeId: string): Promise<void>;
  /** admin; merges that can still be split apart (newest first). */
  listInstituteMerges(): Promise<InstituteMerge[]>;
  /** admin; live applicant count (active registration seats) per institute id. */
  instituteRegistrationCounts(): Promise<Record<string, number>>;

  // Promo / discount / free codes
  /** Preview+apply a code to a pending batch (owner-only). Writes the discounted
   *  total onto the batch; usage is counted later at submit. Pass null to clear. */
  applyPromo(batchId: string, code: string | null): Promise<ApplyPromoResult>;
  adminListPromos(tournamentId?: string): Promise<PromoCode[]>; // admin
  adminUpsertPromo(input: PromoCodeInput): Promise<PromoCode>; // admin
  adminDeletePromo(id: string): Promise<void>; // admin; hard delete

  // Rank verification against the DAN/KYU/AWARD databases
  searchRank(firstNameTh: string, lastNameTh: string): Promise<RankSearchResult>;
  /** Reserve (or fetch) the canonical go_person row for a name — used when a
   *  registrant is not_found, so the link survives until the name is imported. */
  ensureGoPerson(firstNameTh: string, lastNameTh: string): Promise<string>;
  importRankDatabase(
    source: GoPlayerSource,
    rows: GoPlayerImportRow[],
  ): Promise<RankSyncSummary>; // admin; replaces the source + re-syncs everyone's rank
  /** admin; re-resolve the registry + push resolved ranks to every linked person.
   *  Runs automatically after each import; also the on-demand /admin/database button. */
  adminSyncPlayerRanks(): Promise<RankSyncSummary>;
  /** admin; live seats whose occupant's current rank now breaks the division band. */
  adminListRankConflicts(): Promise<RankConflict[]>;
  /** admin; the saved published Google Sheet URL for a source (or "" if unset). */
  getGoSheetUrl(source: GoPlayerSource): Promise<string>;
  /** admin; fetch the source's published Google Sheet as CSV text. When `url`
   *  is given it is saved as the new source URL first. Returns the CSV + the
   *  effective URL used. The caller parses it via parseGoDatabaseCsv(). */
  fetchGoSheetCsv(
    source: GoPlayerSource,
    url?: string,
  ): Promise<{ csv: string; url: string }>;

  // 1-kyu award ceiling
  /** Award-ceiling status for a name — drives the register pre-warning and
   *  mirrors the server-side reserve_seats gate. Signed-in users only. */
  checkAwardLimit(
    firstNameTh: string,
    lastNameTh: string,
  ): Promise<AwardLimitStatus>;
  adminListAwardExemptions(): Promise<AwardLimitExemption[]>; // admin
  adminAddAwardExemption(
    firstNameTh: string,
    lastNameTh: string,
    note: string | null,
  ): Promise<AwardLimitExemption>; // admin
  adminRemoveAwardExemption(id: string): Promise<void>; // admin

  // Reactivity (cross-tab + in-tab)
  /** Without `topics` the listener fires on every store change. With `topics`
   *  it fires only for changes tagged with an overlapping topic — untagged
   *  (broadcast) notifications still reach everyone, so a topic filter can
   *  only skip refetches, never miss one. */
  subscribe(listener: () => void, topics?: readonly StoreTopic[]): () => void;
}

/** Domain buckets for store-change notifications. A mutation is tagged with
 *  every topic whose query results it can affect (e.g. reserving seats changes
 *  both the registration list and category seats_taken). */
export type StoreTopic =
  | "tournament"
  | "categories"
  | "registrations"
  | "withdrawals"
  | "profile"
  | "players"
  | "institutes"
  | "promos"
  | "rankdb";

export const MAX_GROUP_SIZE = 10;
export const HOLD_MINUTES = 15;
