import { buildPromptPayPayload, originalMerchantQr } from "@/lib/promptpay";
import { isRankEligible } from "@/lib/rank";
import { ageFromDob, isAgeEligible } from "@/lib/age";
import { normalizeThaiName } from "@/lib/go-database";
import { fullNameTh } from "@/lib/utils";
import {
  ACTIVE_REGISTRATION_STATUSES,
  AuthUser,
  AwardLimitStatus,
  AwardLimitExemption,
  BatchWithSeats,
  Category,
  CategoryInput,
  CategoryStat,
  DataLayer,
  GoInstitute,
  GoInstituteInput,
  InstituteMerge,
  GoPlayerImportRow,
  GoPlayerSource,
  HOLD_MINUTES,
  ManagedPlayer,
  ManagedPlayerInput,
  MAX_GROUP_SIZE,
  ParticipantRow,
  ApplyPromoResult,
  Person,
  PersonHistoryEntry,
  AdminPersonSearchResult,
  personLabel,
  pickActiveTournament,
  PromoCode,
  PromoCodeInput,
  PromoKind,
  PromptPayBuild,
  Profile,
  personMatchKey,
  ProfileInput,
  RankConflict,
  SelfDeclaredRank,
  RankSearchResult,
  RankSyncSummary,
  RefundStatus,
  RegistrationBatch,
  RegistrationSeat,
  RegistrationStatus,
  ReserveSeatsError,
  ReserveSeatsInput,
  ReserveSeatsResult,
  SeatEditInput,
  SeatInput,
  SeatHold,
  SlipVerifyData,
  SlipVerifyResult,
  StoreTopic,
  SubmitInput,
  SwapSeatInput,
  SwapSeatResult,
  Tournament,
  TournamentInput,
  TournamentStatus,
  Withdrawal,
  WithdrawSeatInput,
  WithdrawSeatResult,
} from "./types";

const STORAGE_KEY = "tesuji.reg.v1";

/** Turn a Google Sheets edit/share URL into a CSV export endpoint. Leaves
 *  already-CSV ("publish to web") links untouched. Mirrors the edge function. */
function toCsvExportUrl(raw: string): string {
  const u = raw.trim();
  if (/output=csv|format=csv/.test(u)) return u;
  const m = u.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) {
    const gid = u.match(/[#&?]gid=(\d+)/)?.[1];
    return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${
      gid ? `&gid=${gid}` : ""
    }`;
  }
  return u;
}

interface MockAccount {
  id: string;
  email: string;
  password: string;
}
interface MockPlayer extends ManagedPlayer {
  ownerId: string;
  archived: boolean;
}
/** Persistent, reversible record of an institute merge (mirrors the
 *  institute_merge table on the real backend). */
interface MockMerge {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceActive: boolean;
  sourceKeywords: string[];
  sourceCreatedAt: string;
  targetId: string;
  targetName: string;
  addedKeywords: string[];
  movedProfiles: string[];
  movedPlayers: string[];
  movedSeats: string[];
  mergedAt: string;
  reversedAt: string | null;
}

interface MockDB {
  tournaments: Record<string, Tournament>;
  categories: Record<string, Category>;
  batches: Record<string, RegistrationBatch>;
  seats: Record<string, RegistrationSeat>;
  holds: Record<string, SeatHold>;
  accounts: Record<string, MockAccount>; // keyed by lowercased email
  currentUserId: string | null;
  profiles: Record<string, Profile>; // keyed by user id
  players: Record<string, MockPlayer>;
  institutes: Record<string, GoInstitute>;
  merges: MockMerge[];
  promos: Record<string, PromoCode>;
  withdrawals: Record<string, Withdrawal>;
}

function emptyDB(): MockDB {
  return {
    tournaments: {},
    categories: {},
    batches: {},
    seats: {},
    holds: {},
    accounts: {},
    currentUserId: null,
    profiles: {},
    players: {},
    institutes: {},
    merges: [],
    promos: {},
    withdrawals: {},
  };
}

/** Mirror of the SQL `_promo_discount` helper (kept in sync). */
function promoDiscount(kind: PromoKind, value: number, gross: number): number {
  if (kind === "free") return gross;
  if (kind === "percent")
    return Math.round(((gross * Math.min(Math.max(value, 0), 100)) / 100) * 100) / 100;
  if (kind === "fixed") return Math.min(gross, Math.max(value, 0));
  return 0;
}

function uid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

function nowISO(): string {
  return new Date().toISOString();
}

function refCode(): string {
  const n = Math.floor(Math.random() * 36 ** 5);
  return "TSJ-" + n.toString(36).toUpperCase().padStart(5, "0");
}

// In-memory award-ceiling exemptions (dev only; the mock has no award database).
const mockAwardExemptions: AwardLimitExemption[] = [];

// The mock has no rank DB, so every sync/import is a no-op with zeroed counts.
const ZERO_RANK_SYNC: RankSyncSummary = {
  persons: 0,
  ambiguous: 0,
  missing: 0,
  linkedProfiles: 0,
  linkedPlayers: 0,
  updatedProfiles: 0,
  updatedPlayers: 0,
};

const isBrowser = () => typeof window !== "undefined";

export class MockDataLayer implements DataLayer {
  private listeners = new Set<() => void>();
  private authListeners = new Set<(u: AuthUser | null) => void>();
  private storageBound = false;

  // ── persistence ──────────────────────────────────────────────────────────
  private load(): MockDB {
    if (!isBrowser()) return emptyDB();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyDB();
      const parsed = JSON.parse(raw) as Partial<MockDB>;
      return { ...emptyDB(), ...parsed };
    } catch {
      return emptyDB();
    }
  }

  private save(db: MockDB) {
    if (!isBrowser()) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      // Only a quota failure means "storage full" (slip image too large);
      // anything else should surface as itself, not a misleading quota error.
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        throw new Error("STORAGE_FULL");
      }
      throw e;
    }
  }

  private commit(db: MockDB) {
    this.save(db);
    this.notify();
  }

  // ── reactivity ─────────────────────────────────────────────────────────────
  // The mock broadcasts every change (localStorage refetches are free), so a
  // topic-scoped listener still hears everything — topics only matter on the
  // Supabase layer where a refetch is a network round-trip.
  subscribe(listener: () => void, _topics?: readonly StoreTopic[]): () => void {
    this.bindStorage();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => {
      try {
        l();
      } catch {
        /* ignore */
      }
    });
  }

  private bindStorage() {
    if (this.storageBound || !isBrowser()) return;
    this.storageBound = true;
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) {
        this.notify();
        this.emitAuth();
      }
    });
  }

  private currentUserOf(db: MockDB): AuthUser | null {
    if (!db.currentUserId) return null;
    const acc = Object.values(db.accounts).find(
      (a) => a.id === db.currentUserId,
    );
    return acc ? { id: acc.id, email: acc.email } : null;
  }

  /** Stamp a batch with its account owner's display name + email (admin-facing),
   *  mirroring the server-side _batch_json enrichment. */
  private withOwner(db: MockDB, batch: RegistrationBatch): RegistrationBatch {
    const profile = batch.accountId ? db.profiles[batch.accountId] : null;
    const account = batch.accountId
      ? Object.values(db.accounts).find((a) => a.id === batch.accountId)
      : null;
    return {
      ...batch,
      ownerName: profile ? fullNameTh(profile) : null,
      ownerEmail: account?.email ?? null,
    };
  }

  private emitAuth() {
    const u = this.currentUserOf(this.load());
    this.authListeners.forEach((l) => {
      try {
        l(u);
      } catch {
        /* ignore */
      }
    });
  }

  // ── expiry sweep ─────────────────────────────────────────────────────────
  /** Release ACTIVE holds whose timer elapsed. Returns number released. */
  private sweep(db: MockDB, tournamentId?: string): number {
    const now = Date.now();
    let released = 0;
    for (const hold of Object.values(db.holds)) {
      if (hold.status !== "active") continue;
      if (tournamentId && hold.tournamentId !== tournamentId) continue;
      if (Date.parse(hold.expiresAt) > now) continue;
      for (const line of hold.lines) {
        const cat = db.categories[line.categoryId];
        if (cat) cat.seatsTaken = Math.max(0, cat.seatsTaken - line.seats);
      }
      hold.status = "expired";
      hold.releasedAt = nowISO();
      const batch = db.batches[hold.batchId];
      if (batch && batch.status === "pending_payment") {
        batch.status = "expired";
        batch.updatedAt = nowISO();
      }
      released++;
    }
    return released;
  }

  async refreshExpired(tournamentId?: string): Promise<number> {
    const db = this.load();
    const n = this.sweep(db, tournamentId);
    if (n > 0) this.commit(db);
    return n;
  }

  // ── tournaments ────────────────────────────────────────────────────────────
  async getActiveTournament(): Promise<Tournament | null> {
    const db = this.load();
    const newestFirst = Object.values(db.tournaments).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    return pickActiveTournament(newestFirst);
  }

  async getTournament(id: string): Promise<Tournament | null> {
    return this.load().tournaments[id] ?? null;
  }

  async listTournaments(): Promise<Tournament[]> {
    return Object.values(this.load().tournaments).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  async upsertTournament(input: TournamentInput): Promise<Tournament> {
    const db = this.load();
    const id = input.id ?? uid();
    const existing = db.tournaments[id];
    const t: Tournament = {
      id,
      nameTh: input.nameTh,
      bannerUrl: input.bannerUrl ?? null,
      venueMapUrl: input.venueMapUrl ?? null,
      competitionDate: input.competitionDate,
      locationText: input.locationText,
      locationMapsUrl: input.locationMapsUrl,
      registrationOpensAt: input.registrationOpensAt,
      registrationClosesAt: input.registrationClosesAt,
      scheduleGroups: input.scheduleGroups ?? [],
      rulesSections: input.rulesSections ?? [],
      promptpayTargetType: input.promptpayTargetType,
      promptpayTargetValue: input.promptpayTargetValue,
      status: input.status ?? existing?.status ?? "draft",
      createdAt: existing?.createdAt ?? nowISO(),
      updatedAt: nowISO(),
    };
    db.tournaments[id] = t;
    this.commit(db);
    return t;
  }

  async setTournamentStatus(
    id: string,
    status: TournamentStatus,
  ): Promise<Tournament> {
    const db = this.load();
    const t = db.tournaments[id];
    if (!t) throw new Error("TOURNAMENT_NOT_FOUND");
    t.status = status;
    t.updatedAt = nowISO();
    this.commit(db);
    return t;
  }

  // ── danger zone (post-event reset; irreversible) ─────────────────────────────
  /** Remove all batches/seats/holds for a tournament (in-memory). */
  private wipeRegistrations(db: MockDB, tournamentId: string): number {
    const batchIds = Object.values(db.batches)
      .filter((b) => b.tournamentId === tournamentId)
      .map((b) => b.id);
    const batchSet = new Set(batchIds);
    for (const s of Object.values(db.seats))
      if (batchSet.has(s.batchId)) delete db.seats[s.id];
    for (const h of Object.values(db.holds))
      if (h.tournamentId === tournamentId) delete db.holds[h.id];
    for (const id of batchIds) delete db.batches[id];
    return batchIds.length;
  }

  async clearRegistrations(
    tournamentId: string,
    confirmName: string,
  ): Promise<number> {
    const db = this.load();
    const t = db.tournaments[tournamentId];
    if (!t) throw new Error("TOURNAMENT_NOT_FOUND");
    if (confirmName.trim() !== t.nameTh.trim())
      throw new Error("CONFIRM_MISMATCH");
    const n = this.wipeRegistrations(db, tournamentId);
    for (const c of Object.values(db.categories))
      if (c.tournamentId === tournamentId) c.seatsTaken = 0;
    this.commit(db);
    return n;
  }

  async clearCategories(
    tournamentId: string,
    confirmName: string,
  ): Promise<number> {
    const db = this.load();
    const t = db.tournaments[tournamentId];
    if (!t) throw new Error("TOURNAMENT_NOT_FOUND");
    if (confirmName.trim() !== t.nameTh.trim())
      throw new Error("CONFIRM_MISMATCH");
    this.wipeRegistrations(db, tournamentId);
    const catIds = Object.values(db.categories)
      .filter((c) => c.tournamentId === tournamentId)
      .map((c) => c.id);
    for (const id of catIds) delete db.categories[id];
    this.commit(db);
    return catIds.length;
  }

  async deleteTournament(
    tournamentId: string,
    confirmName: string,
  ): Promise<void> {
    const db = this.load();
    const t = db.tournaments[tournamentId];
    if (!t) throw new Error("TOURNAMENT_NOT_FOUND");
    if (confirmName.trim() !== t.nameTh.trim())
      throw new Error("CONFIRM_MISMATCH");
    this.wipeRegistrations(db, tournamentId);
    for (const c of Object.values(db.categories))
      if (c.tournamentId === tournamentId) delete db.categories[c.id];
    delete db.tournaments[tournamentId];
    this.commit(db);
  }

  // ── categories ─────────────────────────────────────────────────────────────
  async listCategories(tournamentId: string): Promise<Category[]> {
    const db = this.load();
    if (this.sweep(db, tournamentId) > 0) this.commit(db);
    return Object.values(db.categories)
      .filter((c) => c.tournamentId === tournamentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  }

  async listCategoryStats(tournamentId: string): Promise<CategoryStat[]> {
    const db = this.load();
    if (this.sweep(db, tournamentId) > 0) this.commit(db);
    const cats = Object.values(db.categories).filter(
      (c) => c.tournamentId === tournamentId,
    );
    // confirmed seats per category
    const confirmed: Record<string, number> = {};
    for (const seat of Object.values(db.seats)) {
      const batch = db.batches[seat.batchId];
      if (batch && batch.status === "confirmed") {
        confirmed[seat.categoryId] = (confirmed[seat.categoryId] ?? 0) + 1;
      }
    }
    return cats.map((c) => {
      const conf = confirmed[c.id] ?? 0;
      return {
        categoryId: c.id,
        capacity: c.capacity,
        remaining: Math.max(0, c.capacity - c.seatsTaken),
        held: Math.max(0, c.seatsTaken - conf),
        confirmed: conf,
      };
    });
  }

  async upsertCategory(input: CategoryInput): Promise<Category> {
    const db = this.load();
    const id = input.id ?? uid();
    const existing = db.categories[id];

    // Guard: never let capacity drop below already-taken seats.
    const seatsTaken = existing?.seatsTaken ?? 0;
    if (input.capacity < seatsTaken) {
      const err = new Error("CAPACITY_BELOW_TAKEN");
      (err as Error & { taken?: number }).taken = seatsTaken;
      throw err;
    }

    // Guard: unique code within tournament.
    const dup = Object.values(db.categories).find(
      (c) =>
        c.tournamentId === input.tournamentId &&
        c.code.trim().toLowerCase() === input.code.trim().toLowerCase() &&
        c.id !== id,
    );
    if (dup) throw new Error("DUPLICATE_CODE");

    const c: Category = {
      id,
      tournamentId: input.tournamentId,
      code: input.code,
      name: input.name,
      capacity: input.capacity,
      seatsTaken,
      feeThb: input.feeThb,
      minPowerLevel: input.minPowerLevel ?? null,
      maxPowerLevel: input.maxPowerLevel ?? null,
      minAge: input.minAge ?? null,
      maxAge: input.maxAge ?? null,
      combinableCategoryIds: input.combinableCategoryIds ?? [],
      sortOrder:
        input.sortOrder ??
        existing?.sortOrder ??
        Object.values(db.categories).filter(
          (x) => x.tournamentId === input.tournamentId,
        ).length,
      createdAt: existing?.createdAt ?? nowISO(),
      updatedAt: nowISO(),
    };
    db.categories[id] = c;
    this.commit(db);
    return c;
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const db = this.load();
    const cat = db.categories[categoryId];
    if (!cat) return;
    if (cat.seatsTaken > 0) throw new Error("CATEGORY_IN_USE");
    delete db.categories[categoryId];
    this.commit(db);
  }

  // ── reservation ────────────────────────────────────────────────────────────
  /** Rank + age eligibility for one person against one รุ่น — shared by
   *  reserveSeats and swapSeat so the two flows can't drift (mirrors the SQL,
   *  which checks rank then age per seat in a single pass). */
  private rankAgeViolation(
    p: { powerLevel?: number | null; dob: string },
    cat: Category,
    label: string,
  ): ReserveSeatsError | null {
    const catName = `${cat.code} ${cat.name}`;
    if (cat.minPowerLevel != null || cat.maxPowerLevel != null) {
      if (p.powerLevel == null) {
        return {
          ok: false,
          error: "RANK_REQUIRED",
          categoryId: cat.id,
          categoryName: catName,
          personLabel: label,
        };
      }
      if (!isRankEligible(p.powerLevel, cat.minPowerLevel, cat.maxPowerLevel)) {
        return {
          ok: false,
          error: "RANK_NOT_ELIGIBLE",
          categoryId: cat.id,
          categoryName: catName,
          personLabel: label,
          powerLevel: p.powerLevel,
          minPowerLevel: cat.minPowerLevel ?? null,
          maxPowerLevel: cat.maxPowerLevel ?? null,
        };
      }
    }
    if (cat.minAge != null || cat.maxAge != null) {
      const age = ageFromDob(p.dob);
      if (!isAgeEligible(age, cat.minAge, cat.maxAge)) {
        return {
          ok: false,
          error: "AGE_NOT_ELIGIBLE",
          categoryId: cat.id,
          categoryName: catName,
          personLabel: label,
          age: age ?? 0,
          minAge: cat.minAge ?? null,
          maxAge: cat.maxAge ?? null,
        };
      }
    }
    return null;
  }

  /** COMBINATION_NOT_ALLOWED when the combined distinct รุ่น set is more than
   *  an admin-combinable pair (mirror of the SQL rule) — shared by
   *  reserveSeats and swapSeat. */
  private combinationViolation(
    db: MockDB,
    combined: string[],
    label: string,
  ): ReserveSeatsError | null {
    if (combined.length < 2) return null;
    const a = db.categories[combined[0]];
    const b = db.categories[combined[1]];
    const isPair =
      !!a &&
      !!b &&
      a.id !== b.id &&
      (a.combinableCategoryIds.includes(b.id) ||
        b.combinableCategoryIds.includes(a.id));
    if (combined.length > 2 || !isPair) {
      return {
        ok: false,
        error: "COMBINATION_NOT_ALLOWED",
        personLabel: label,
        categoryName: a ? `${a.code} ${a.name}` : "",
        otherCategoryName: b ? `${b.code} ${b.name}` : "",
      };
    }
    return null;
  }

  async reserveSeats(input: ReserveSeatsInput): Promise<ReserveSeatsResult> {
    const db = this.load();
    this.sweep(db, input.tournamentId);

    const t = db.tournaments[input.tournamentId];
    const now = Date.now();
    if (
      !t ||
      t.status !== "published" ||
      now < Date.parse(t.registrationOpensAt) ||
      now >= Date.parse(t.registrationClosesAt)
    ) {
      return { ok: false, error: "REGISTRATION_CLOSED" };
    }

    if (input.seats.length === 0) return { ok: false, error: "EMPTY_BATCH" };
    if (input.seats.length > MAX_GROUP_SIZE)
      return { ok: false, error: "TOO_MANY", max: MAX_GROUP_SIZE };

    // group requested seats by category
    const counts = new Map<string, number>();
    for (const s of input.seats)
      counts.set(s.categoryId, (counts.get(s.categoryId) ?? 0) + 1);

    // PHASE 1 — validate every category; mutate nothing.
    for (const [categoryId, requested] of counts) {
      const cat = db.categories[categoryId];
      if (!cat) return { ok: false, error: "CATEGORY_NOT_FOUND", categoryId };
      const remaining = cat.capacity - cat.seatsTaken;
      if (requested > remaining) {
        return {
          ok: false,
          error: "INSUFFICIENT_SEATS",
          categoryId,
          categoryName: `${cat.code} ${cat.name}`,
          remaining: Math.max(0, remaining),
          requested,
        };
      }
    }

    // PHASE 1b+1c — rank + age eligibility per seat (mirror server rule; the
    // SQL checks rank then age within a single pass over the seats).
    for (const s of input.seats) {
      const cat = db.categories[s.categoryId];
      if (!cat) continue;
      const violation = this.rankAgeViolation(s, cat, personLabel(s));
      if (violation) return violation;
    }

    // PHASE 1d — duplicate / multi-division rule, ACROSS batches (mirror server):
    // a person may hold at most 2 รุ่น total (existing active + this submission),
    // any 2-รุ่น pair must be admin-combinable, and re-registering a รุ่น already
    // held = duplicate. Identity uses the same personMatchKey as swap/delete so
    // the duplicate rule behaves identically across all flows.
    // "active" occupying statuses = pending_payment | pending_review | confirmed.
    const occupying = ["pending_payment", "pending_review", "confirmed"];

    // existing active รุ่น per person → categoryId → reference of the holding batch
    const existing = new Map<string, Map<string, string>>();
    for (const seat of Object.values(db.seats)) {
      if (seat.withdrawnAt) continue; // withdrawn people no longer hold a seat
      const b = db.batches[seat.batchId];
      if (!b || b.tournamentId !== input.tournamentId) continue;
      if (!occupying.includes(b.status)) continue;
      const pk = personMatchKey(seat);
      let m = existing.get(pk);
      if (!m) {
        m = new Map();
        existing.set(pk, m);
      }
      if (!m.has(seat.categoryId)) m.set(seat.categoryId, b.referenceCode);
    }

    // group this submission's seats by person
    const newByPerson = new Map<string, SeatInput[]>();
    for (const s of input.seats) {
      const list = newByPerson.get(personMatchKey(s)) ?? [];
      list.push(s);
      newByPerson.set(personMatchKey(s), list);
    }

    for (const [pk, personSeats] of newByPerson) {
      const head = personSeats[0];
      const label = personLabel(head);
      const existingCats = existing.get(pk) ?? new Map<string, string>();
      const requestedRaw = personSeats.map((s) => s.categoryId);
      const requestedDistinct = Array.from(new Set(requestedRaw));

      // re-registering a รุ่น already held (another batch / earlier submission)
      for (const cid of requestedDistinct) {
        if (existingCats.has(cid)) {
          const cat = db.categories[cid];
          return {
            ok: false,
            error: "DUPLICATE_REGISTRATION",
            personLabel: label,
            categoryName: cat ? `${cat.code} ${cat.name}` : "",
            referenceCode: existingCats.get(cid) ?? null,
          };
        }
      }

      // same รุ่น twice within this submission
      if (requestedRaw.length !== requestedDistinct.length) {
        const seen = new Set<string>();
        let dupId = "";
        for (const c of requestedRaw) {
          if (seen.has(c)) {
            dupId = c;
            break;
          }
          seen.add(c);
        }
        const cat = db.categories[dupId];
        return {
          ok: false,
          error: "DUPLICATE_REGISTRATION",
          personLabel: label,
          categoryName: cat ? `${cat.code} ${cat.name}` : "",
          referenceCode: null,
        };
      }

      // combined distinct set: max 2, and if 2 must be a combinable pair
      const combined = Array.from(
        new Set([...existingCats.keys(), ...requestedDistinct]),
      );
      const combo = this.combinationViolation(db, combined, label);
      if (combo) return combo;
    }

    // PHASE 2 — commit (all categories passed).
    const batchId = uid();
    const holdId = uid();
    const created = nowISO();
    const expiresAt = new Date(now + HOLD_MINUTES * 60_000).toISOString();

    let total = 0;
    for (const s of input.seats) {
      const cat = db.categories[s.categoryId];
      const fee = cat ? cat.feeThb : 0;
      total += fee;
      const seatId = uid();
      const seat: RegistrationSeat = {
        id: seatId,
        batchId,
        categoryId: s.categoryId,
        feeThbSnapshot: fee,
        titlePrefix: s.titlePrefix,
        titleCustom: s.titleCustom ?? null,
        firstNameTh: s.firstNameTh,
        lastNameTh: s.lastNameTh,
        firstNameEn: s.firstNameEn,
        lastNameEn: s.lastNameEn,
        hasMiddleName: s.hasMiddleName,
        middleNameTh: s.middleNameTh ?? null,
        middleNameEn: s.middleNameEn ?? null,
        phone: s.phone,
        dob: s.dob,
        powerLevel: s.powerLevel ?? null,
        province: s.province ?? null,
        instituteId: s.instituteId ?? null,
        instituteName: s.instituteName ?? null,
        pdpaConsent: s.pdpaConsent ?? false,
        pdpaConsentAt: s.pdpaConsentAt ?? null,
        createdAt: created,
      };
      db.seats[seatId] = seat;
    }

    for (const [categoryId, n] of counts) {
      db.categories[categoryId].seatsTaken += n;
      db.categories[categoryId].updatedAt = created;
    }

    const hold: SeatHold = {
      id: holdId,
      tournamentId: input.tournamentId,
      batchId,
      status: "active",
      expiresAt,
      lines: Array.from(counts, ([categoryId, seats]) => ({
        categoryId,
        seats,
      })),
      createdAt: created,
    };
    db.holds[holdId] = hold;

    const reference = refCode();
    const batch: RegistrationBatch = {
      id: batchId,
      tournamentId: input.tournamentId,
      accountId: db.currentUserId,
      kind: input.kind,
      submitterPhone: input.submitterPhone,
      submitterName: null,
      status: "pending_payment",
      holdId,
      totalAmountThb: total,
      paymentSlipUrl: null,
      adminNote: null,
      referenceCode: reference,
      createdAt: created,
      updatedAt: created,
    };
    db.batches[batchId] = batch;

    this.commit(db);
    return {
      ok: true,
      batchId,
      holdId,
      expiresAt,
      totalAmountThb: total,
      referenceCode: reference,
    };
  }

  async getBatch(batchId: string): Promise<BatchWithSeats | null> {
    const db = this.load();
    const batch = db.batches[batchId];
    if (!batch) return null;
    if (this.sweep(db, batch.tournamentId) > 0) this.commit(db);
    const fresh = db.batches[batchId];
    return {
      batch: this.withOwner(db, fresh),
      seats: Object.values(db.seats).filter((s) => s.batchId === batchId),
      hold: fresh.holdId ? db.holds[fresh.holdId] ?? null : null,
    };
  }

  /** Mock has no auth split — admin read is the same as getBatch. */
  async getBatchAdmin(batchId: string): Promise<BatchWithSeats | null> {
    return this.getBatch(batchId);
  }

  async getHold(holdId: string): Promise<SeatHold | null> {
    const db = this.load();
    const hold = db.holds[holdId];
    if (!hold) return null;
    if (this.sweep(db) > 0) this.commit(db);
    return db.holds[holdId] ?? null;
  }

  async releaseBatch(batchId: string): Promise<void> {
    const db = this.load();
    const batch = db.batches[batchId];
    if (!batch) return;
    if (batch.status !== "pending_payment") return;
    if (batch.holdId) {
      const hold = db.holds[batch.holdId];
      if (hold && hold.status === "active") {
        for (const line of hold.lines) {
          const cat = db.categories[line.categoryId];
          if (cat) cat.seatsTaken = Math.max(0, cat.seatsTaken - line.seats);
        }
        hold.status = "released";
        hold.releasedAt = nowISO();
      }
    }
    batch.status = "cancelled";
    batch.updatedAt = nowISO();
    this.commit(db);
  }

  async submitRegistration(input: SubmitInput): Promise<RegistrationBatch> {
    const db = this.load();
    const batch = db.batches[input.batchId];
    if (!batch) throw new Error("BATCH_NOT_FOUND");

    // Idempotent: re-submitting an already-submitted batch returns it.
    if (batch.status === "pending_review" || batch.status === "confirmed") {
      return batch;
    }

    this.sweep(db, batch.tournamentId);
    const fresh = db.batches[input.batchId];
    const hold = fresh.holdId ? db.holds[fresh.holdId] : null;
    if (!hold || hold.status !== "active" || Date.parse(hold.expiresAt) <= Date.now()) {
      throw new Error("HOLD_EXPIRED");
    }

    // Promo: count one use atomically at commit (mirrors the SQL path).
    if (fresh.promoCode) {
      const promo = Object.values(db.promos ?? {}).find(
        (p) =>
          p.tournamentId === fresh.tournamentId &&
          p.code.toUpperCase() === fresh.promoCode!.toUpperCase(),
      );
      if (!promo || !promo.active) throw new Error("PROMO_INVALID");
      if (promo.validUntil && Date.now() > Date.parse(promo.validUntil))
        throw new Error("PROMO_EXPIRED");
      if (promo.maxUses != null && promo.usedCount >= promo.maxUses)
        throw new Error("PROMO_EXHAUSTED");
      promo.usedCount += 1;
      promo.updatedAt = nowISO();
    }

    hold.status = "consumed";
    // Free ($0) → confirmed directly (no slip / no admin step); else pending_review.
    if ((fresh.totalAmountThb ?? 0) <= 0) {
      fresh.status = "confirmed";
      fresh.paymentSlipUrl = input.slipUrl || null;
      fresh.reviewedBy = `promo:${fresh.promoCode ?? ""}`;
      fresh.reviewedAt = nowISO();
    } else {
      fresh.status = "pending_review";
      fresh.paymentSlipUrl = input.slipUrl;
    }
    fresh.updatedAt = nowISO();
    this.commit(db);
    return fresh;
  }

  // ── admin ──────────────────────────────────────────────────────────────────
  async listRegistrations(
    tournamentId: string,
    status: RegistrationStatus | "all" = "all",
  ): Promise<BatchWithSeats[]> {
    const db = this.load();
    if (this.sweep(db, tournamentId) > 0) this.commit(db);
    return Object.values(db.batches)
      .filter((b) => b.tournamentId === tournamentId)
      .filter((b) => status === "all" || b.status === status)
      .filter((b) => b.status !== "cancelled") // never surface abandoned drafts
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((batch) => ({
        batch: this.withOwner(db, batch),
        seats: Object.values(db.seats).filter((s) => s.batchId === batch.id),
        hold: batch.holdId ? db.holds[batch.holdId] ?? null : null,
      }));
  }

  async listMyRegistrations(): Promise<BatchWithSeats[]> {
    const db = this.load();
    if (!db.currentUserId) return [];
    if (this.sweep(db) > 0) this.commit(db);
    return Object.values(db.batches)
      .filter((b) => b.accountId === db.currentUserId)
      .filter((b) => b.status !== "cancelled")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((batch) => ({
        batch,
        seats: Object.values(db.seats).filter((s) => s.batchId === batch.id),
        hold: batch.holdId ? db.holds[batch.holdId] ?? null : null,
      }));
  }

  // ── withdraw + swap (owner) ───────────────────────────────────────────────
  async withdrawSeat(input: WithdrawSeatInput): Promise<WithdrawSeatResult> {
    const db = this.load();
    if (!db.currentUserId) return { ok: false, error: "AUTH_REQUIRED" };
    const seat = db.seats[input.seatId];
    if (!seat) return { ok: false, error: "SEAT_NOT_FOUND" };
    const batch = db.batches[seat.batchId];
    if (!batch || batch.accountId !== db.currentUserId)
      return { ok: false, error: "FORBIDDEN" };
    if (batch.status !== "confirmed" && batch.status !== "pending_review")
      return { ok: false, error: "BATCH_NOT_ACTIVE" };
    if (seat.withdrawnAt) return { ok: false, error: "ALREADY_WITHDRAWN" };

    const bankName = input.bankName.trim();
    const bankAccountName = input.bankAccountName.trim();
    const bankAccountNo = input.bankAccountNo.trim();
    if (
      !bankName ||
      bankName.length > 100 ||
      !bankAccountName ||
      bankAccountName.length > 100 ||
      !/^[0-9][0-9 -]{4,29}$/.test(bankAccountNo) ||
      (input.reason ?? "").length > 1000
    ) {
      return { ok: false, error: "INVALID_FIELD" };
    }

    // return the held seat to capacity WITHOUT deleting the row
    const hold = batch.holdId ? db.holds[batch.holdId] : null;
    if (this.holdOccupies(hold) && hold) {
      const cat = db.categories[seat.categoryId];
      if (cat) {
        cat.seatsTaken = Math.max(0, cat.seatsTaken - 1);
        cat.updatedAt = nowISO();
      }
      const line = hold.lines.find((l) => l.categoryId === seat.categoryId);
      if (line) {
        line.seats -= 1;
        if (line.seats <= 0)
          hold.lines = hold.lines.filter((l) => l.categoryId !== seat.categoryId);
      }
    }

    seat.withdrawnAt = nowISO();

    const cat = db.categories[seat.categoryId];
    const personName = fullNameTh(seat);
    const wid = uid();
    db.withdrawals[wid] = {
      id: wid,
      seatId: seat.id,
      batchId: batch.id,
      tournamentId: batch.tournamentId,
      personName,
      categoryId: seat.categoryId,
      categoryLabel: cat ? `${cat.code} · ${cat.name}` : "",
      feeThb: seat.feeThbSnapshot,
      batchReference: batch.referenceCode,
      reason: (input.reason ?? "").trim() || null,
      bankName,
      bankAccountNo,
      bankAccountName,
      refundStatus: "pending",
      refundSlipUrl: null,
      createdAt: nowISO(),
      resolvedAt: null,
      resolvedBy: null,
    };
    // batch total intentionally unchanged — the dashboard nets refunded fees
    // out at display time once the admin marks the refund done
    this.commit(db);
    return { ok: true, withdrawalId: wid };
  }

  async swapSeat(input: SwapSeatInput): Promise<SwapSeatResult> {
    const db = this.load();
    if (!db.currentUserId) return { ok: false, error: "AUTH_REQUIRED" };
    const seat = db.seats[input.seatId];
    if (!seat) return { ok: false, error: "SEAT_NOT_FOUND" };
    const batch = db.batches[seat.batchId];
    if (!batch || batch.accountId !== db.currentUserId)
      return { ok: false, error: "FORBIDDEN" };
    if (batch.status !== "confirmed" && batch.status !== "pending_review")
      return { ok: false, error: "BATCH_NOT_ACTIVE" };
    if (seat.withdrawnAt) return { ok: false, error: "ALREADY_WITHDRAWN" };

    const t = db.tournaments[batch.tournamentId];
    if (!t || Date.now() >= Date.parse(t.registrationClosesAt))
      return { ok: false, error: "SWAP_CLOSED" };

    // resolve the NEW person from the DB (self / managed player)
    let person: Person | null = null;
    if (input.sourceKind === "self") {
      person = db.profiles[db.currentUserId] ?? null;
    } else if (input.sourceKind === "managed_player") {
      const p = input.sourcePlayerId ? db.players[input.sourcePlayerId] : null;
      if (p && p.ownerId === db.currentUserId && !p.archived) person = p;
    } else {
      return { ok: false, error: "INVALID_SOURCE" };
    }
    if (!person) return { ok: false, error: "PLAYER_NOT_FOUND" };

    const newCat = db.categories[input.categoryId];
    if (!newCat || newCat.tournamentId !== batch.tournamentId)
      return { ok: false, error: "CATEGORY_NOT_FOUND", categoryId: input.categoryId };
    const moving = input.categoryId !== seat.categoryId;
    const label = personLabel(person);
    const catName = `${newCat.code} ${newCat.name}`;

    if (!moving && personMatchKey(person) === personMatchKey(seat))
      return { ok: false, error: "SAME_PERSON" };

    if (moving && newCat.feeThb !== seat.feeThbSnapshot)
      return { ok: false, error: "FEE_MISMATCH", categoryName: catName };

    const hold = batch.holdId ? db.holds[batch.holdId] : null;
    const occupies = this.holdOccupies(hold);

    if (moving && occupies && newCat.capacity - newCat.seatsTaken < 1)
      return {
        ok: false,
        error: "INSUFFICIENT_SEATS",
        categoryId: newCat.id,
        categoryName: catName,
        remaining: 0,
        requested: 1,
      };

    // rank + age on the DB-read person (same helper as reserveSeats)
    const rankAge = this.rankAgeViolation(person, newCat, label);
    if (rankAge) return rankAge;

    // duplicate / combinable — the new person's other live รุ่น, excluding this
    // seat + withdrawn seats
    const occupying = ["pending_payment", "pending_review", "confirmed"];
    const existingCats = new Map<string, string>();
    for (const s of Object.values(db.seats)) {
      if (s.id === input.seatId || s.withdrawnAt) continue;
      const b = db.batches[s.batchId];
      if (!b || b.tournamentId !== batch.tournamentId) continue;
      if (!occupying.includes(b.status)) continue;
      if (personMatchKey(s) !== personMatchKey(person)) continue;
      if (!existingCats.has(s.categoryId))
        existingCats.set(s.categoryId, b.referenceCode);
    }
    if (existingCats.has(input.categoryId))
      return {
        ok: false,
        error: "DUPLICATE_REGISTRATION",
        personLabel: label,
        categoryName: catName,
        referenceCode: existingCats.get(input.categoryId) ?? null,
      };
    const combined = Array.from(
      new Set([...existingCats.keys(), input.categoryId]),
    );
    const combo = this.combinationViolation(db, combined, label);
    if (combo) return combo;
    // (mock has no award database → no AWARD_LIMIT_REACHED)

    // re-book seat counts + hold lines when moving รุ่น (only when occupying)
    if (moving && occupies && hold) {
      const oldCat = db.categories[seat.categoryId];
      if (oldCat) {
        oldCat.seatsTaken = Math.max(0, oldCat.seatsTaken - 1);
        oldCat.updatedAt = nowISO();
      }
      newCat.seatsTaken += 1;
      newCat.updatedAt = nowISO();
      const decLine = hold.lines.find((l) => l.categoryId === seat.categoryId);
      if (decLine) {
        decLine.seats -= 1;
        if (decLine.seats <= 0)
          hold.lines = hold.lines.filter((l) => l.categoryId !== seat.categoryId);
      }
      const incLine = hold.lines.find((l) => l.categoryId === input.categoryId);
      if (incLine) incLine.seats += 1;
      else hold.lines.push({ categoryId: input.categoryId, seats: 1 });
    }

    // copy the new person onto the seat; fee snapshot stays (no money moves)
    seat.titlePrefix = person.titlePrefix;
    seat.titleCustom = person.titleCustom ?? null;
    seat.firstNameTh = person.firstNameTh;
    seat.lastNameTh = person.lastNameTh;
    seat.firstNameEn = person.firstNameEn;
    seat.lastNameEn = person.lastNameEn;
    seat.hasMiddleName = person.hasMiddleName;
    seat.middleNameTh = person.middleNameTh ?? null;
    seat.middleNameEn = person.middleNameEn ?? null;
    seat.phone = person.phone;
    seat.dob = person.dob;
    seat.powerLevel = person.powerLevel ?? null;
    seat.province = person.province ?? null;
    seat.instituteId = person.instituteId ?? null;
    seat.instituteName = person.instituteName ?? null;
    seat.pdpaConsent = person.pdpaConsent ?? false;
    seat.pdpaConsentAt = person.pdpaConsentAt ?? null;
    seat.categoryId = input.categoryId;
    batch.updatedAt = nowISO();
    this.commit(db);
    return { ok: true };
  }

  async adminListWithdrawals(tournamentId: string): Promise<Withdrawal[]> {
    const db = this.load();
    return Object.values(db.withdrawals)
      .filter((w) => w.tournamentId === tournamentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async adminSetWithdrawalStatus(
    withdrawalId: string,
    status: RefundStatus,
    refundSlip?: string | null,
  ): Promise<Withdrawal> {
    const db = this.load();
    const w = db.withdrawals[withdrawalId];
    if (!w) throw new Error("NOT_FOUND");
    // refunded is terminal — mirrors the SQL guard (incl. refunded→refunded)
    if (w.refundStatus === "refunded") throw new Error("LOCKED");
    if (status === "refunded") {
      // refunded requires proof — mock's "valid slip" is an image data URL
      if (!refundSlip || !refundSlip.startsWith("data:image/"))
        throw new Error("SLIP_REQUIRED");
      w.refundSlipUrl = refundSlip;
    }
    w.refundStatus = status;
    w.resolvedAt = status === "pending" ? null : nowISO();
    w.resolvedBy = status === "pending" ? null : "admin";
    this.commit(db);
    return w;
  }

  async getRefundSlipUrl(ref: string): Promise<string | null> {
    // Mock stores the refund slip as a data: URL directly — return as-is.
    return ref || null;
  }

  async confirmRegistration(
    batchId: string,
    adminId: string,
  ): Promise<RegistrationBatch> {
    const db = this.load();
    const batch = db.batches[batchId];
    if (!batch) throw new Error("BATCH_NOT_FOUND");
    if (batch.status !== "pending_review")
      throw new Error("NOT_PENDING_REVIEW");
    batch.status = "confirmed";
    batch.reviewedBy = adminId;
    batch.reviewedAt = nowISO();
    batch.updatedAt = nowISO();
    this.commit(db);
    return batch;
  }

  async rejectRegistration(
    batchId: string,
    adminId: string,
    note: string,
  ): Promise<RegistrationBatch> {
    const db = this.load();
    const batch = db.batches[batchId];
    if (!batch) throw new Error("BATCH_NOT_FOUND");
    // Release held seats back to the pool.
    if (batch.holdId) {
      const hold = db.holds[batch.holdId];
      if (hold && (hold.status === "consumed" || hold.status === "active")) {
        for (const line of hold.lines) {
          const cat = db.categories[line.categoryId];
          if (cat) cat.seatsTaken = Math.max(0, cat.seatsTaken - line.seats);
        }
        hold.status = "released";
        hold.releasedAt = nowISO();
      }
    }
    batch.status = "rejected";
    batch.adminNote = note;
    batch.reviewedBy = adminId;
    batch.reviewedAt = nowISO();
    batch.updatedAt = nowISO();
    this.commit(db);
    return batch;
  }

  // ── admin: edit / delete registered seats ───────────────────────────────────
  /** A batch "occupies" seat quota iff its hold is active or consumed — the same
   *  gate reserve/reject/release use before touching category.seatsTaken. */
  private holdOccupies(hold: SeatHold | null | undefined): boolean {
    return !!hold && (hold.status === "active" || hold.status === "consumed");
  }

  private batchWithSeats(db: MockDB, batchId: string): BatchWithSeats {
    const batch = db.batches[batchId];
    return {
      batch,
      seats: Object.values(db.seats).filter((s) => s.batchId === batchId),
      hold: batch.holdId ? db.holds[batch.holdId] ?? null : null,
    };
  }

  async updateSeat(
    batchId: string,
    seatId: string,
    input: SeatEditInput,
    adminId: string,
  ): Promise<BatchWithSeats> {
    void adminId;
    const db = this.load();
    const batch = db.batches[batchId];
    if (!batch) throw new Error("BATCH_NOT_FOUND");
    const seat = db.seats[seatId];
    if (!seat || seat.batchId !== batchId) throw new Error("SEAT_NOT_FOUND");
    if (seat.withdrawnAt) throw new Error("ALREADY_WITHDRAWN");
    const newCat = db.categories[input.categoryId];
    // mirror the SQL: the รุ่น must belong to the same tournament as the batch
    if (!newCat || newCat.tournamentId !== batch.tournamentId)
      throw new Error("CATEGORY_NOT_FOUND");

    const oldCatId = seat.categoryId;
    const moving = oldCatId !== input.categoryId;
    const hold = batch.holdId ? db.holds[batch.holdId] : null;
    const occupies = this.holdOccupies(hold);

    // capacity check on destination (only when this move actually consumes a slot)
    if (moving && occupies) {
      if (newCat.capacity - newCat.seatsTaken < 1) throw new Error("CATEGORY_FULL");
    }
    // rank + age eligibility vs the destination รุ่น (mirror reserveSeats)
    const power = input.powerLevel ?? null;
    const bounded = newCat.minPowerLevel != null || newCat.maxPowerLevel != null;
    if (bounded && power == null) throw new Error("RANK_REQUIRED");
    if (!isRankEligible(power, newCat.minPowerLevel, newCat.maxPowerLevel)) {
      throw new Error("RANK_NOT_ELIGIBLE");
    }
    if (!isAgeEligible(ageFromDob(input.dob), newCat.minAge, newCat.maxAge)) {
      throw new Error("AGE_NOT_ELIGIBLE");
    }

    // re-book seat counts + hold lines when moving รุ่น (only when occupying)
    if (moving && occupies && hold) {
      const oldCat = db.categories[oldCatId];
      if (oldCat) {
        oldCat.seatsTaken = Math.max(0, oldCat.seatsTaken - 1);
        oldCat.updatedAt = nowISO();
      }
      newCat.seatsTaken += 1;
      newCat.updatedAt = nowISO();
      const decLine = hold.lines.find((l) => l.categoryId === oldCatId);
      if (decLine) {
        decLine.seats -= 1;
        if (decLine.seats <= 0) {
          hold.lines = hold.lines.filter((l) => l.categoryId !== oldCatId);
        }
      }
      const incLine = hold.lines.find((l) => l.categoryId === input.categoryId);
      if (incLine) incLine.seats += 1;
      else hold.lines.push({ categoryId: input.categoryId, seats: 1 });
    }

    seat.titlePrefix = input.titlePrefix;
    seat.titleCustom = input.titleCustom ?? null;
    seat.firstNameTh = input.firstNameTh;
    seat.lastNameTh = input.lastNameTh;
    seat.firstNameEn = input.firstNameEn;
    seat.lastNameEn = input.lastNameEn;
    seat.hasMiddleName = input.hasMiddleName;
    seat.middleNameTh = input.middleNameTh ?? null;
    seat.middleNameEn = input.middleNameEn ?? null;
    seat.phone = input.phone;
    seat.dob = input.dob;
    seat.powerLevel = power;
    seat.categoryId = input.categoryId;
    // moving รุ่น re-snapshots the fee to the destination รุ่น's current fee
    if (moving) seat.feeThbSnapshot = newCat.feeThb;

    this.recomputeBatchTotal(db, batch);
    batch.updatedAt = nowISO();
    this.commit(db);
    return this.batchWithSeats(db, batchId);
  }

  /** Promo-aware total recompute — mirrors the SQL _recompute_batch_total so mock
   *  and Supabase stay behaviorally identical for batches carrying a promo. */
  private recomputeBatchTotal(
    db: ReturnType<MockDataLayer["load"]>,
    batch: ReturnType<MockDataLayer["load"]>["batches"][string],
  ): void {
    const gross = Object.values(db.seats)
      .filter((s) => s.batchId === batch.id)
      .reduce((sum, s) => sum + s.feeThbSnapshot, 0);
    const discount = batch.promoKind
      ? promoDiscount(batch.promoKind, batch.promoValue ?? 0, gross)
      : 0;
    batch.discountThb = discount;
    batch.totalAmountThb = Math.max(0, gross - discount);
  }

  async deleteSeat(
    batchId: string,
    seatId: string,
    adminId: string,
  ): Promise<BatchWithSeats> {
    void adminId;
    const db = this.load();
    const batch = db.batches[batchId];
    if (!batch) throw new Error("BATCH_NOT_FOUND");
    const seat = db.seats[seatId];
    if (!seat || seat.batchId !== batchId) throw new Error("SEAT_NOT_FOUND");
    if (seat.withdrawnAt) throw new Error("ALREADY_WITHDRAWN");
    const hold = batch.holdId ? db.holds[batch.holdId] : null;
    const occupies = this.holdOccupies(hold);

    if (occupies && hold) {
      const cat = db.categories[seat.categoryId];
      if (cat) {
        cat.seatsTaken = Math.max(0, cat.seatsTaken - 1);
        cat.updatedAt = nowISO();
      }
      const line = hold.lines.find((l) => l.categoryId === seat.categoryId);
      if (line) {
        line.seats -= 1;
        if (line.seats <= 0) {
          hold.lines = hold.lines.filter((l) => l.categoryId !== seat.categoryId);
        }
      }
    }

    delete db.seats[seatId];
    const remaining = Object.values(db.seats).filter((s) => s.batchId === batchId);
    if (remaining.length === 0) {
      // last person removed → cancel the (now empty) batch + release its hold
      if (hold && occupies) {
        hold.status = "released";
        hold.releasedAt = nowISO();
      }
      batch.status = "cancelled";
    }
    if (remaining.length === 0) {
      batch.totalAmountThb = 0;
      batch.discountThb = 0;
    } else {
      this.recomputeBatchTotal(db, batch); // promo-aware (parity with SQL)
    }
    batch.updatedAt = nowISO();
    this.commit(db);
    return this.batchWithSeats(db, batchId);
  }

  async deleteBatch(batchId: string, adminId: string): Promise<void> {
    void adminId;
    const db = this.load();
    const batch = db.batches[batchId];
    if (!batch) throw new Error("BATCH_NOT_FOUND");
    const hold = batch.holdId ? db.holds[batch.holdId] : null;
    // refund all held seats (mirror rejectRegistration), then soft-cancel.
    if (hold && this.holdOccupies(hold)) {
      for (const line of hold.lines) {
        const cat = db.categories[line.categoryId];
        if (cat) {
          cat.seatsTaken = Math.max(0, cat.seatsTaken - line.seats);
          cat.updatedAt = nowISO();
        }
      }
      hold.status = "released";
      hold.releasedAt = nowISO();
    }
    batch.status = "cancelled";
    batch.updatedAt = nowISO();
    this.commit(db);
  }

  async verifySlip(batchId: string): Promise<SlipVerifyResult> {
    const db = this.load();
    const batch = db.batches[batchId];
    if (!batch) throw new Error("BATCH_NOT_FOUND");
    if (!batch.paymentSlipUrl) throw new Error("NO_SLIP");
    // Mock has no SlipOK — return a demo result mirroring the edge function.
    const data: SlipVerifyData = {
      mode: "demo",
      amount: batch.totalAmountThb,
      expectedAmount: batch.totalAmountThb,
      amountMatches: true,
      note: "โหมดทดสอบ (mock) — ยังไม่ได้ตรวจจริง",
    };
    batch.slipVerifyStatus = "demo";
    batch.slipVerifyData = data;
    batch.slipVerifiedAt = nowISO();
    batch.updatedAt = nowISO();
    this.commit(db);
    return { status: "demo", data };
  }

  async getSlipUrl(batchId: string): Promise<string | null> {
    const db = this.load();
    // Mock stores the slip as a data: URL directly — return it as-is.
    return db.batches[batchId]?.paymentSlipUrl ?? null;
  }

  // ── public participants ─────────────────────────────────────────────────────
  async listParticipants(tournamentId: string): Promise<ParticipantRow[]> {
    const db = this.load();
    const rows: ParticipantRow[] = [];
    for (const seat of Object.values(db.seats)) {
      if (seat.withdrawnAt) continue; // withdrawn → off the public roster
      const batch = db.batches[seat.batchId];
      if (!batch || batch.tournamentId !== tournamentId) continue;
      if (batch.status !== "confirmed" && batch.status !== "pending_review")
        continue;
      const status = batch.status; // narrowed: 'confirmed' | 'pending_review'
      const cat = db.categories[seat.categoryId];
      rows.push({
        fullNameTh: fullNameTh(seat),
        categoryCode: cat?.code ?? "-",
        categoryName: cat?.name ?? "-",
        status,
      });
    }
    return rows.sort(
      (a, b) =>
        a.categoryCode.localeCompare(b.categoryCode) ||
        Number(b.status === "confirmed") - Number(a.status === "confirmed") ||
        a.fullNameTh.localeCompare(b.fullNameTh, "th"),
    );
  }

  // ── PromptPay ────────────────────────────────────────────────────────────
  async buildPromptPayPayload(
    tournamentId: string,
    amountThb: number,
  ): Promise<PromptPayBuild> {
    const t = this.load().tournaments[tournamentId];
    if (!t || !t.promptpayTargetValue) throw new Error("NO_PROMPTPAY_TARGET");
    return {
      payload: buildPromptPayPayload(t.promptpayTargetValue, amountThb),
      original: originalMerchantQr(t.promptpayTargetValue),
    };
  }

  // ── fake auth (DEMO ONLY — plaintext, no verification) ────────────────────
  async getCurrentUser(): Promise<AuthUser | null> {
    return this.currentUserOf(this.load());
  }

  async signUp(
    email: string,
    password: string,
  ): Promise<{ user: AuthUser | null; needsEmailConfirm: boolean }> {
    const db = this.load();
    const key = email.trim().toLowerCase();
    if (db.accounts[key]) throw new Error("EMAIL_EXISTS");
    const account: MockAccount = { id: uid(), email: key, password };
    db.accounts[key] = account;
    db.currentUserId = account.id;
    this.commit(db);
    this.emitAuth();
    return { user: { id: account.id, email: key }, needsEmailConfirm: false };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const db = this.load();
    const acc = db.accounts[email.trim().toLowerCase()];
    if (!acc || acc.password !== password) {
      throw new Error("INVALID_CREDENTIALS");
    }
    db.currentUserId = acc.id;
    this.commit(db);
    this.emitAuth();
    return { id: acc.id, email: acc.email };
  }

  async signOut(): Promise<void> {
    const db = this.load();
    db.currentUserId = null;
    this.commit(db);
    this.emitAuth();
  }

  onAuthChange(cb: (user: AuthUser | null) => void): () => void {
    this.bindStorage();
    this.authListeners.add(cb);
    return () => this.authListeners.delete(cb);
  }

  async isAdmin(): Promise<boolean> {
    // Mock/demo backend has no real roles — any signed-in user is treated as admin.
    return (await this.getCurrentUser()) != null;
  }

  async requestPasswordReset(email: string): Promise<void> {
    // No email backend in mock mode — resolve regardless of whether the address
    // exists, mirroring Supabase's privacy-preserving behavior.
    void email;
  }

  async updatePassword(newPassword: string): Promise<void> {
    const db = this.load();
    const acc = db.currentUserId
      ? Object.values(db.accounts).find((a) => a.id === db.currentUserId)
      : undefined;
    if (!acc) throw new Error("RECOVERY_SESSION_MISSING");
    acc.password = newPassword;
    this.commit(db);
    this.emitAuth();
  }

  // ── own profile ───────────────────────────────────────────────────────────
  async getMyProfile(): Promise<Profile | null> {
    const db = this.load();
    if (!db.currentUserId) return null;
    return db.profiles[db.currentUserId] ?? null;
  }

  async upsertMyProfile(input: ProfileInput): Promise<Profile> {
    const db = this.load();
    if (!db.currentUserId) throw new Error("AUTH_REQUIRED");
    const profile: Profile = {
      id: db.currentUserId,
      ...input,
      pdpaConsentAt: input.pdpaConsent ? input.pdpaConsentAt ?? nowISO() : null,
    };
    db.profiles[db.currentUserId] = profile;
    this.commit(db);
    return profile;
  }

  // ── managed players ─────────────────────────────────────────────────────
  private toManagedPlayer(p: MockPlayer): ManagedPlayer {
    return {
      id: p.id,
      titlePrefix: p.titlePrefix,
      titleCustom: p.titleCustom,
      firstNameTh: p.firstNameTh,
      lastNameTh: p.lastNameTh,
      firstNameEn: p.firstNameEn,
      lastNameEn: p.lastNameEn,
      hasMiddleName: p.hasMiddleName,
      middleNameTh: p.middleNameTh,
      middleNameEn: p.middleNameEn,
      phone: p.phone,
      dob: p.dob,
      powerLevel: p.powerLevel ?? null,
      matchedGoPlayerId: p.matchedGoPlayerId ?? null,
      province: p.province ?? null,
      instituteId: p.instituteId ?? null,
      instituteName: p.instituteName ?? null,
      pdpaConsent: p.pdpaConsent ?? false,
      pdpaConsentAt: p.pdpaConsentAt ?? null,
    };
  }

  async listMyPlayers(): Promise<ManagedPlayer[]> {
    const db = this.load();
    if (!db.currentUserId) return [];
    return Object.values(db.players)
      .filter((p) => p.ownerId === db.currentUserId && !p.archived)
      .sort((a, b) => a.firstNameTh.localeCompare(b.firstNameTh, "th"))
      .map((p) => this.toManagedPlayer(p));
  }

  async upsertMyPlayer(input: ManagedPlayerInput): Promise<ManagedPlayer> {
    const db = this.load();
    if (!db.currentUserId) throw new Error("AUTH_REQUIRED");
    const id = input.id ?? uid();
    const player: MockPlayer = {
      ...input,
      id,
      ownerId: db.currentUserId,
      archived: false,
      pdpaConsentAt: input.pdpaConsent ? input.pdpaConsentAt ?? nowISO() : null,
    };
    db.players[id] = player;
    this.commit(db);
    return this.toManagedPlayer(player);
  }

  async deleteMyPlayer(playerId: string): Promise<void> {
    const db = this.load();
    const p = db.players[playerId];
    if (!p) return;
    // Block deletion while this player has a live registration in a competition.
    const key = personMatchKey(p);
    const hasActive = Object.values(db.seats).some((s) => {
      const batch = db.batches[s.batchId];
      return (
        batch != null &&
        batch.accountId === db.currentUserId &&
        ACTIVE_REGISTRATION_STATUSES.includes(batch.status) &&
        personMatchKey(s) === key
      );
    });
    if (hasActive) throw new Error("PLAYER_HAS_REGISTRATIONS");
    p.archived = true;
    this.commit(db);
  }

  // ── institutes (สถาบันหมากล้อม) ───────────────────────────────────────────
  async listInstitutes(): Promise<GoInstitute[]> {
    const db = this.load();
    return Object.values(db.institutes)
      .filter((i) => i.active)
      .sort((a, b) => a.nameTh.localeCompare(b.nameTh, "th"));
  }

  async findOrCreateInstitute(name: string): Promise<GoInstitute> {
    const db = this.load();
    const norm = normalizeThaiName(name).toLowerCase();
    if (!norm) throw new Error("EMPTY_NAME");
    const existing = Object.values(db.institutes).find(
      (i) => normalizeThaiName(i.nameTh).toLowerCase() === norm,
    );
    if (existing) {
      if (!existing.active) {
        existing.active = true;
        existing.updatedAt = nowISO();
        this.commit(db);
      }
      return { ...existing };
    }
    const inst: GoInstitute = {
      id: uid(),
      nameTh: name.trim(),
      active: true,
      keywords: [],
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    db.institutes[inst.id] = inst;
    this.commit(db);
    return { ...inst };
  }

  async adminListInstitutes(): Promise<GoInstitute[]> {
    const db = this.load();
    return Object.values(db.institutes).sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        a.nameTh.localeCompare(b.nameTh, "th"),
    );
  }

  async upsertInstitute(input: GoInstituteInput): Promise<GoInstitute> {
    const db = this.load();
    const name = input.nameTh.trim();
    if (!name) throw new Error("EMPTY_NAME");
    const norm = normalizeThaiName(name).toLowerCase();
    const dup = Object.values(db.institutes).find(
      (i) => normalizeThaiName(i.nameTh).toLowerCase() === norm && i.id !== input.id,
    );
    if (dup) throw new Error("DUPLICATE_NAME");
    const id = input.id ?? uid();
    const existing = db.institutes[id];
    const keywords =
      input.keywords !== undefined
        ? Array.from(
            new Set(input.keywords.map((k) => k.trim()).filter(Boolean)),
          )
        : existing?.keywords ?? [];
    const inst: GoInstitute = {
      id,
      nameTh: name,
      active: input.active ?? existing?.active ?? true,
      keywords,
      createdAt: existing?.createdAt ?? nowISO(),
      updatedAt: nowISO(),
    };
    db.institutes[id] = inst;
    this.commit(db);
    return { ...inst };
  }

  async deleteInstitute(id: string): Promise<void> {
    const db = this.load();
    const inst = db.institutes[id];
    if (inst) {
      inst.active = false;
      inst.updatedAt = nowISO();
      this.commit(db);
    }
  }

  async purgeInstitute(id: string): Promise<void> {
    const db = this.load();
    if (!db.institutes[id]) return;
    const inUse =
      Object.values(db.profiles).some((p) => p.instituteId === id) ||
      Object.values(db.players).some((p) => p.instituteId === id) ||
      Object.values(db.seats).some((s) => s.instituteId === id);
    if (inUse) throw new Error("INSTITUTE_IN_USE");
    delete db.institutes[id];
    this.commit(db);
  }

  async mergeInstitute(sourceId: string, targetId: string): Promise<string> {
    const db = this.load();
    if (sourceId === targetId) throw new Error("SAME_INSTITUTE");
    const src = db.institutes[sourceId];
    const tgt = db.institutes[targetId];
    if (!src || !tgt) throw new Error("INSTITUTE_NOT_FOUND");
    const movedProfiles = Object.values(db.profiles)
      .filter((p) => p.instituteId === sourceId)
      .map((p) => p.id);
    const movedPlayers = Object.values(db.players)
      .filter((p) => p.instituteId === sourceId)
      .map((p) => p.id);
    const movedSeats = Object.values(db.seats)
      .filter((s) => s.instituteId === sourceId)
      .map((s) => s.id);
    // aliases this merge adds to the target (source name + keywords, minus
    // anything the target already had)
    const addedKeywords = Array.from(
      new Set(
        [src.nameTh, ...src.keywords]
          .map((k) => k.trim())
          .filter((k) => k && !tgt.keywords.includes(k)),
      ),
    );
    // re-point references (id + denormalized name snapshot) to the target
    for (const p of Object.values(db.profiles))
      if (p.instituteId === sourceId) {
        p.instituteId = targetId;
        p.instituteName = tgt.nameTh;
      }
    for (const pl of Object.values(db.players))
      if (pl.instituteId === sourceId) {
        pl.instituteId = targetId;
        pl.instituteName = tgt.nameTh;
      }
    for (const s of Object.values(db.seats))
      if (s.instituteId === sourceId) {
        s.instituteId = targetId;
        s.instituteName = tgt.nameTh;
      }
    // fold the source's name + keywords into the target's aliases
    tgt.keywords = Array.from(
      new Set(
        [...tgt.keywords, src.nameTh, ...src.keywords]
          .map((k) => k.trim())
          .filter(Boolean),
      ),
    );
    tgt.updatedAt = nowISO();
    delete db.institutes[sourceId];
    const id = uid();
    db.merges.push({
      id,
      sourceId: src.id,
      sourceName: src.nameTh,
      sourceActive: src.active,
      sourceKeywords: [...src.keywords],
      sourceCreatedAt: src.createdAt,
      targetId,
      targetName: tgt.nameTh,
      addedKeywords,
      movedProfiles,
      movedPlayers,
      movedSeats,
      mergedAt: nowISO(),
      reversedAt: null,
    });
    this.commit(db);
    return id;
  }

  async unmergeInstitute(mergeId: string): Promise<void> {
    const db = this.load();
    const m = db.merges.find((x) => x.id === mergeId);
    if (!m) throw new Error("MERGE_NOT_FOUND");
    if (m.reversedAt) throw new Error("ALREADY_REVERSED");
    // recreate the source institute (reuse its original id)
    if (!db.institutes[m.sourceId]) {
      db.institutes[m.sourceId] = {
        id: m.sourceId,
        nameTh: m.sourceName,
        active: m.sourceActive,
        keywords: [...m.sourceKeywords],
        createdAt: m.sourceCreatedAt,
        updatedAt: nowISO(),
      };
    }
    // re-point only rows still sitting at the target (safe vs chained merges)
    for (const id of m.movedProfiles) {
      const p = db.profiles[id];
      if (p && p.instituteId === m.targetId) {
        p.instituteId = m.sourceId;
        p.instituteName = m.sourceName;
      }
    }
    for (const id of m.movedPlayers) {
      const pl = db.players[id];
      if (pl && pl.instituteId === m.targetId) {
        pl.instituteId = m.sourceId;
        pl.instituteName = m.sourceName;
      }
    }
    for (const id of m.movedSeats) {
      const s = db.seats[id];
      if (s && s.instituteId === m.targetId) {
        s.instituteId = m.sourceId;
        s.instituteName = m.sourceName;
      }
    }
    // strip the aliases this merge added (keep later edits)
    const tgt = db.institutes[m.targetId];
    if (tgt) {
      tgt.keywords = tgt.keywords.filter((k) => !m.addedKeywords.includes(k));
      tgt.updatedAt = nowISO();
    }
    m.reversedAt = nowISO();
    this.commit(db);
  }

  async listInstituteMerges(): Promise<InstituteMerge[]> {
    const db = this.load();
    return db.merges
      .filter((m) => !m.reversedAt)
      .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt))
      .map((m) => ({
        id: m.id,
        sourceName: m.sourceName,
        targetName: m.targetName,
        targetId: m.targetId,
        mergedAt: m.mergedAt,
        movedCount:
          m.movedProfiles.length + m.movedPlayers.length + m.movedSeats.length,
      }));
  }

  async instituteRegistrationCounts(): Promise<Record<string, number>> {
    const db = this.load();
    const counts: Record<string, number> = {};
    for (const s of Object.values(db.seats)) {
      if (!s.instituteId) continue;
      const batch = db.batches[s.batchId];
      if (!batch || !ACTIVE_REGISTRATION_STATUSES.includes(batch.status)) continue;
      counts[s.instituteId] = (counts[s.instituteId] ?? 0) + 1;
    }
    return counts;
  }

  // ── promo / discount codes ────────────────────────────────────────────────
  async applyPromo(
    batchId: string,
    code: string | null,
  ): Promise<ApplyPromoResult> {
    const db = this.load();
    const batch = db.batches[batchId];
    if (!batch) return { ok: false, error: "BATCH_NOT_FOUND" };
    if (db.currentUserId && batch.accountId && batch.accountId !== db.currentUserId)
      return { ok: false, error: "FORBIDDEN" };
    if (batch.status !== "pending_payment")
      return { ok: false, error: "NOT_PENDING_PAYMENT" };

    const gross = Object.values(db.seats)
      .filter((s) => s.batchId === batchId)
      .reduce((sum, s) => sum + (s.feeThbSnapshot ?? 0), 0);

    if (!code || !code.trim()) {
      batch.promoCode = null;
      batch.promoKind = null;
      batch.promoValue = null;
      batch.discountThb = 0;
      batch.totalAmountThb = gross;
      batch.updatedAt = nowISO();
      this.commit(db);
      return { ok: true, totalAmountThb: gross, discountThb: 0, isFree: gross <= 0, kind: null, code: null };
    }

    const promo = Object.values(db.promos ?? {}).find(
      (p) =>
        p.tournamentId === batch.tournamentId &&
        p.code.toUpperCase() === code.trim().toUpperCase(),
    );
    if (!promo) return { ok: false, error: "PROMO_INVALID" };
    if (!promo.active) return { ok: false, error: "PROMO_INACTIVE" };
    if (promo.validFrom && Date.now() < Date.parse(promo.validFrom))
      return { ok: false, error: "PROMO_NOT_STARTED" };
    if (promo.validUntil && Date.now() > Date.parse(promo.validUntil))
      return { ok: false, error: "PROMO_EXPIRED" };
    if (promo.maxUses != null && promo.usedCount >= promo.maxUses)
      return { ok: false, error: "PROMO_EXHAUSTED" };

    const discount = promoDiscount(promo.kind, promo.value, gross);
    const total = Math.max(0, gross - discount);
    batch.promoCode = promo.code;
    batch.promoKind = promo.kind;
    batch.promoValue = promo.value;
    batch.discountThb = discount;
    batch.totalAmountThb = total;
    batch.updatedAt = nowISO();
    this.commit(db);
    return { ok: true, totalAmountThb: total, discountThb: discount, isFree: total <= 0, kind: promo.kind, code: promo.code };
  }

  async adminListPromos(tournamentId?: string): Promise<PromoCode[]> {
    const db = this.load();
    return Object.values(db.promos ?? {})
      .filter((p) => !tournamentId || p.tournamentId === tournamentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async adminUpsertPromo(input: PromoCodeInput): Promise<PromoCode> {
    const db = this.load();
    if (!db.promos) db.promos = {};
    const code = input.code.trim();
    if (!code) throw new Error("CODE_REQUIRED");
    if (!["free", "percent", "fixed"].includes(input.kind)) throw new Error("KIND_INVALID");
    if (!input.tournamentId) throw new Error("TOURNAMENT_REQUIRED");
    const dup = Object.values(db.promos).find(
      (p) =>
        p.tournamentId === input.tournamentId &&
        p.code.toUpperCase() === code.toUpperCase() &&
        p.id !== input.id,
    );
    if (dup) throw new Error("CODE_DUPLICATE");
    const id = input.id ?? uid();
    const existing = db.promos[id];
    const promo: PromoCode = {
      id,
      tournamentId: input.tournamentId,
      code,
      kind: input.kind,
      value: input.value ?? 0,
      maxUses: input.maxUses ?? null,
      usedCount: existing?.usedCount ?? 0,
      validFrom: input.validFrom ?? null,
      validUntil: input.validUntil ?? null,
      active: input.active ?? true,
      note: input.note ?? null,
      createdAt: existing?.createdAt ?? nowISO(),
      updatedAt: nowISO(),
    };
    db.promos[id] = promo;
    this.commit(db);
    return { ...promo };
  }

  async adminDeletePromo(id: string): Promise<void> {
    const db = this.load();
    if (db.promos && db.promos[id]) {
      delete db.promos[id];
      this.commit(db);
    }
  }

  // ── rank databases (mock has none — demo only) ────────────────────────────
  async searchRank(): Promise<RankSearchResult> {
    return { status: "not_found", candidates: [] };
  }

  async ensureGoPerson(
    firstNameTh: string,
    lastNameTh: string,
  ): Promise<string> {
    void firstNameTh;
    void lastNameTh;
    // Mock has no registry; return a placeholder id so callers can link.
    return `mock-person-${Math.random().toString(36).slice(2)}`;
  }

  async importRankDatabase(
    source: GoPlayerSource,
    rows: GoPlayerImportRow[],
  ): Promise<RankSyncSummary> {
    void source;
    // Mock has no rank DB → nothing to re-sync (demo parity: zeroed summary).
    return { ...ZERO_RANK_SYNC, imported: rows.length };
  }

  async adminSyncPlayerRanks(): Promise<RankSyncSummary> {
    return { ...ZERO_RANK_SYNC };
  }

  async adminListRankConflicts(): Promise<RankConflict[]> {
    return [];
  }

  async adminListSelfDeclaredRanks(): Promise<SelfDeclaredRank[]> {
    // Mock has no registry / rank picker — nothing self-declared to review.
    return [];
  }

  async personRankHistory(): Promise<PersonHistoryEntry[]> {
    // Mock has no rank DB — no history; the panel simply stays hidden.
    return [];
  }

  async adminSearchPersonHistory(): Promise<AdminPersonSearchResult[]> {
    // Mock has no person registry — the admin search finds nothing.
    return [];
  }

  async getGoSheetUrl(source: GoPlayerSource): Promise<string> {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(`tesuji.gsheet.${source}`) ?? "";
  }

  async fetchGoSheetCsv(
    source: GoPlayerSource,
    url?: string,
  ): Promise<{ csv: string; url: string }> {
    const key = `tesuji.gsheet.${source}`;
    const typed = url?.trim();
    if (typed && typeof window !== "undefined") {
      window.localStorage.setItem(key, typed);
    }
    const effective = typed || (await this.getGoSheetUrl(source));
    if (!effective) throw new Error("ยังไม่ได้ตั้งลิงก์ Google Sheet สำหรับฐานนี้");
    // Offline demo: fetch the published sheet directly (works for "publish to web"
    // CSV links; private/anyone-with-link links may be blocked by CORS).
    const res = await fetch(toCsvExportUrl(effective));
    if (!res.ok) throw new Error(`ดึงชีตไม่สำเร็จ (HTTP ${res.status})`);
    return { csv: await res.text(), url: effective };
  }

  async checkAwardLimit(
    firstNameTh: string,
    lastNameTh: string,
  ): Promise<AwardLimitStatus> {
    void firstNameTh;
    void lastNameTh;
    // Mock has no award database → the 1-kyu ceiling never triggers offline.
    return { count: 0, inDan: false, exempt: false, banned: false };
  }

  async adminListAwardExemptions(): Promise<AwardLimitExemption[]> {
    return [...mockAwardExemptions].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async adminAddAwardExemption(
    firstNameTh: string,
    lastNameTh: string,
    note: string | null,
  ): Promise<AwardLimitExemption> {
    const row: AwardLimitExemption = {
      id: uid(),
      firstNameTh: firstNameTh.trim(),
      lastNameTh: lastNameTh.trim(),
      note: note?.trim() || null,
      createdAt: nowISO(),
    };
    mockAwardExemptions.push(row);
    this.notify();
    return row;
  }

  async adminRemoveAwardExemption(id: string): Promise<void> {
    const i = mockAwardExemptions.findIndex((x) => x.id === id);
    if (i >= 0) mockAwardExemptions.splice(i, 1);
    this.notify();
  }

}
