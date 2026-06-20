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
export type PromptPayTargetType = "phone" | "national_id" | "merchant_qr";
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
  competitionDate: string; // free text, e.g. "14–15 กันยายน 2568"
  locationText: string;
  locationMapsUrl: string;
  registrationOpensAt: string; // ISO datetime
  registrationClosesAt: string; // ISO datetime
  scheduleGroups: ScheduleGroup[]; // กำหนดการ จัดกลุ่มตามรุ่น (JSON in schedule_text column)
  rulesPdfUrl: string | null; // กฎ กติกา as an uploaded PDF (URL in rules_text column)
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
  matchedGoPlayerId?: string | null; // go_player_database row when matched
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
  createdAt: string;
  updatedAt: string;
}

export interface GoInstituteInput {
  id?: string;
  nameTh: string;
  active?: boolean;
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
}

export type RankSearchResult =
  | { status: "matched"; candidate: RankCandidate; candidates: RankCandidate[] }
  | { status: "multiple"; candidates: RankCandidate[] }
  | { status: "not_found"; candidates: [] };

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
  | "duplicate"
  | "failed"
  | "demo";

export interface SlipVerifyData {
  mode: "live" | "demo";
  amount: number | null;
  expectedAmount: number;
  amountMatches: boolean;
  receiver?: string | null;
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
  kind: RegistrationKind;
  submitterPhone: string;
  submitterName?: string | null;
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
  createdAt: string;
  updatedAt: string;
}

export interface BatchWithSeats {
  batch: RegistrationBatch;
  seats: RegistrationSeat[];
  hold: SeatHold | null;
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
  rulesPdfUrl?: string | null; // data: URL (จะอัปโหลด) หรือ URL ที่มีอยู่ หรือ null
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

  // Categories
  listCategories(tournamentId: string): Promise<Category[]>;
  listCategoryStats(tournamentId: string): Promise<CategoryStat[]>;
  upsertCategory(input: CategoryInput): Promise<Category>;
  deleteCategory(categoryId: string): Promise<void>;

  // Reservation + registration (the heart)
  reserveSeats(input: ReserveSeatsInput): Promise<ReserveSeatsResult>;
  getBatch(batchId: string): Promise<BatchWithSeats | null>;
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

  // Rank verification against the DAN/KYU/AWARD databases
  searchRank(firstNameTh: string, lastNameTh: string): Promise<RankSearchResult>;
  importRankDatabase(
    source: GoPlayerSource,
    rows: GoPlayerImportRow[],
  ): Promise<number>; // admin; returns imported count
  /** admin; the saved published Google Sheet URL for a source (or "" if unset). */
  getGoSheetUrl(source: GoPlayerSource): Promise<string>;
  /** admin; fetch the source's published Google Sheet as CSV text. When `url`
   *  is given it is saved as the new source URL first. Returns the CSV + the
   *  effective URL used. The caller parses it via parseGoDatabaseCsv(). */
  fetchGoSheetCsv(
    source: GoPlayerSource,
    url?: string,
  ): Promise<{ csv: string; url: string }>;

  // Reactivity (cross-tab + in-tab)
  subscribe(listener: () => void): () => void;
}

export const MAX_GROUP_SIZE = 10;
export const HOLD_MINUTES = 15;
