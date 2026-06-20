import { buildPromptPayPayload } from "@/lib/promptpay";
import { isRankEligible } from "@/lib/rank";
import { ageFromDob, isAgeEligible } from "@/lib/age";
import { normalizeThaiName } from "@/lib/go-database";
import {
  AuthUser,
  BatchWithSeats,
  Category,
  CategoryInput,
  CategoryStat,
  DataLayer,
  GoInstitute,
  GoInstituteInput,
  GoPlayerImportRow,
  GoPlayerSource,
  HOLD_MINUTES,
  ManagedPlayer,
  ManagedPlayerInput,
  MAX_GROUP_SIZE,
  ParticipantRow,
  Profile,
  ProfileInput,
  RankSearchResult,
  RankStatus,
  RegistrationBatch,
  RegistrationSeat,
  RegistrationStatus,
  ReserveSeatsInput,
  ReserveSeatsResult,
  SeatEditInput,
  SeatInput,
  SeatHold,
  SlipVerifyData,
  SlipVerifyResult,
  SubmitInput,
  Tournament,
  TournamentInput,
  TournamentStatus,
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
  };
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
    } catch {
      // Most likely QuotaExceededError (slip image too large).
      throw new Error("STORAGE_FULL");
    }
  }

  private commit(db: MockDB) {
    this.save(db);
    this.notify();
  }

  // ── reactivity ─────────────────────────────────────────────────────────────
  subscribe(listener: () => void): () => void {
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
    const published = Object.values(db.tournaments)
      .filter((t) => t.status === "published")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (published.length > 0) return published[0];
    // Fall back to most recently edited tournament so admins can preview drafts.
    const all = Object.values(db.tournaments).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
    return all[0] ?? null;
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
      competitionDate: input.competitionDate,
      locationText: input.locationText,
      locationMapsUrl: input.locationMapsUrl,
      registrationOpensAt: input.registrationOpensAt,
      registrationClosesAt: input.registrationClosesAt,
      scheduleGroups: input.scheduleGroups ?? [],
      rulesPdfUrl: input.rulesPdfUrl ?? null,
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

    // PHASE 1b — rank eligibility (mirror server rule; still no mutation).
    for (const s of input.seats) {
      const cat = db.categories[s.categoryId];
      if (!cat || (cat.minPowerLevel == null && cat.maxPowerLevel == null)) {
        continue;
      }
      const label = `${
        s.titlePrefix === "อื่นๆ" ? s.titleCustom ?? "" : s.titlePrefix
      }${s.firstNameTh} ${s.lastNameTh}`.trim();
      if (s.powerLevel == null) {
        return {
          ok: false,
          error: "RANK_REQUIRED",
          categoryId: s.categoryId,
          categoryName: `${cat.code} ${cat.name}`,
          personLabel: label,
        };
      }
      if (!isRankEligible(s.powerLevel, cat.minPowerLevel, cat.maxPowerLevel)) {
        return {
          ok: false,
          error: "RANK_NOT_ELIGIBLE",
          categoryId: s.categoryId,
          categoryName: `${cat.code} ${cat.name}`,
          personLabel: label,
          powerLevel: s.powerLevel,
          minPowerLevel: cat.minPowerLevel ?? null,
          maxPowerLevel: cat.maxPowerLevel ?? null,
        };
      }
    }

    // PHASE 1c — age eligibility (mirror server rule; age in completed years).
    for (const s of input.seats) {
      const cat = db.categories[s.categoryId];
      if (!cat || (cat.minAge == null && cat.maxAge == null)) continue;
      const age = ageFromDob(s.dob);
      if (!isAgeEligible(age, cat.minAge, cat.maxAge)) {
        const label = `${
          s.titlePrefix === "อื่นๆ" ? s.titleCustom ?? "" : s.titlePrefix
        }${s.firstNameTh} ${s.lastNameTh}`.trim();
        return {
          ok: false,
          error: "AGE_NOT_ELIGIBLE",
          categoryId: s.categoryId,
          categoryName: `${cat.code} ${cat.name}`,
          personLabel: label,
          age: age ?? 0,
          minAge: cat.minAge ?? null,
          maxAge: cat.maxAge ?? null,
        };
      }
    }

    // PHASE 1d — duplicate / multi-division rule, ACROSS batches (mirror server):
    // a person may hold at most 2 รุ่น total (existing active + this submission),
    // any 2-รุ่น pair must be admin-combinable, and re-registering a รุ่น already
    // held = duplicate. Mock identifies a person by ชื่อ+วันเกิด (no source stored).
    // "active" occupying statuses = pending_payment | pending_review | confirmed.
    const personKey = (p: {
      firstNameTh: string;
      lastNameTh: string;
      dob: string;
    }) => `${p.firstNameTh.trim()}|${p.lastNameTh.trim()}|${p.dob}`;
    const occupying = ["pending_payment", "pending_review", "confirmed"];

    // existing active รุ่น per person → categoryId → reference of the holding batch
    const existing = new Map<string, Map<string, string>>();
    for (const seat of Object.values(db.seats)) {
      const b = db.batches[seat.batchId];
      if (!b || b.tournamentId !== input.tournamentId) continue;
      if (!occupying.includes(b.status)) continue;
      const pk = personKey(seat);
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
      const list = newByPerson.get(personKey(s)) ?? [];
      list.push(s);
      newByPerson.set(personKey(s), list);
    }

    for (const [pk, personSeats] of newByPerson) {
      const head = personSeats[0];
      const label = `${
        head.titlePrefix === "อื่นๆ" ? head.titleCustom ?? "" : head.titlePrefix
      }${head.firstNameTh} ${head.lastNameTh}`.trim();
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
      if (combined.length >= 2) {
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
      }
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
      batch: fresh,
      seats: Object.values(db.seats).filter((s) => s.batchId === batchId),
      hold: fresh.holdId ? db.holds[fresh.holdId] ?? null : null,
    };
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

    hold.status = "consumed";
    fresh.status = "pending_review";
    fresh.paymentSlipUrl = input.slipUrl;
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
        batch,
        seats: Object.values(db.seats).filter((s) => s.batchId === batch.id),
        hold: batch.holdId ? db.holds[batch.holdId] ?? null : null,
      }));
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

    batch.totalAmountThb = Object.values(db.seats)
      .filter((s) => s.batchId === batchId)
      .reduce((sum, s) => sum + s.feeThbSnapshot, 0);
    batch.updatedAt = nowISO();
    this.commit(db);
    return this.batchWithSeats(db, batchId);
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
    batch.totalAmountThb = remaining.reduce((sum, s) => sum + s.feeThbSnapshot, 0);
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

  // ── public participants ─────────────────────────────────────────────────────
  async listParticipants(tournamentId: string): Promise<ParticipantRow[]> {
    const db = this.load();
    const rows: ParticipantRow[] = [];
    for (const seat of Object.values(db.seats)) {
      const batch = db.batches[seat.batchId];
      if (!batch || batch.tournamentId !== tournamentId) continue;
      if (batch.status !== "confirmed" && batch.status !== "pending_review")
        continue;
      const status = batch.status; // narrowed: 'confirmed' | 'pending_review'
      const cat = db.categories[seat.categoryId];
      const middle = seat.hasMiddleName && seat.middleNameTh
        ? ` ${seat.middleNameTh}`
        : "";
      rows.push({
        fullNameTh: `${
          seat.titlePrefix === "อื่นๆ" ? seat.titleCustom ?? "" : seat.titlePrefix
        }${seat.firstNameTh}${middle} ${seat.lastNameTh}`.trim(),
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
  ): Promise<string> {
    const t = this.load().tournaments[tournamentId];
    if (!t || !t.promptpayTargetValue) throw new Error("NO_PROMPTPAY_TARGET");
    return buildPromptPayPayload(
      t.promptpayTargetType,
      t.promptpayTargetValue,
      amountThb,
    );
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
      rankStatus: p.rankStatus ?? "pending",
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
    if (p) {
      p.archived = true;
      this.commit(db);
    }
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
    const inst: GoInstitute = {
      id,
      nameTh: name,
      active: input.active ?? existing?.active ?? true,
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

  // ── rank databases (mock has none — demo only) ────────────────────────────
  async searchRank(): Promise<RankSearchResult> {
    return { status: "not_found", candidates: [] };
  }

  async importRankDatabase(
    source: GoPlayerSource,
    rows: GoPlayerImportRow[],
  ): Promise<number> {
    void source;
    return rows.length;
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

}
