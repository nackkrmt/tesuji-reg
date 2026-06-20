import { buildPromptPayPayload } from "@/lib/promptpay";
import { getAdminSecret } from "@/lib/admin-auth";
import {
  isHttpOrDataUrl,
  parseScheduleGroups,
  serializeScheduleGroups,
} from "@/lib/schedule";
import { getSupabase, STORAGE_BUCKET } from "./supabaseClient";
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
  ManagedPlayer,
  ManagedPlayerInput,
  ParticipantRow,
  Person,
  Profile,
  ProfileInput,
  RankCandidate,
  RankSearchResult,
  RankStatus,
  RegistrationBatch,
  RegistrationSeat,
  RegistrationStatus,
  ReserveSeatsInput,
  ReserveSeatsResult,
  SeatEditInput,
  SeatHold,
  SlipVerifyData,
  SlipVerifyResult,
  SlipVerifyStatus,
  SubmitInput,
  Tournament,
  TournamentInput,
  TournamentStatus,
} from "./types";

// ── row → entity mappers (snake_case → camelCase) ────────────────────────────
function mapTournament(r: any): Tournament {
  return {
    id: r.id,
    nameTh: r.name_th,
    bannerUrl: r.banner_url ?? null,
    competitionDate: r.competition_date ?? "",
    locationText: r.location_text ?? "",
    locationMapsUrl: r.location_maps_url ?? "",
    registrationOpensAt: r.registration_opens_at,
    registrationClosesAt: r.registration_closes_at,
    scheduleGroups: parseScheduleGroups(r.schedule_text),
    rulesPdfUrl: isHttpOrDataUrl(r.rules_text) ? r.rules_text : null,
    promptpayTargetType: r.promptpay_target_type,
    promptpayTargetValue: r.promptpay_target_value ?? "",
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapCategory(r: any): Category {
  return {
    id: r.id,
    tournamentId: r.tournament_id,
    code: r.code,
    name: r.name,
    capacity: r.capacity,
    seatsTaken: r.seats_taken,
    feeThb: Number(r.fee_thb),
    minPowerLevel: r.min_power_level ?? null,
    maxPowerLevel: r.max_power_level ?? null,
    minAge: r.min_age ?? null,
    maxAge: r.max_age ?? null,
    combinableCategoryIds: r.combinable_category_ids ?? [],
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapSeat(r: any): RegistrationSeat {
  return {
    id: r.id,
    batchId: r.batch_id,
    categoryId: r.category_id,
    feeThbSnapshot: Number(r.fee_thb_snapshot),
    titlePrefix: r.title_prefix,
    titleCustom: r.title_custom ?? null,
    firstNameTh: r.first_name_th,
    lastNameTh: r.last_name_th,
    firstNameEn: r.first_name_en,
    lastNameEn: r.last_name_en,
    hasMiddleName: r.has_middle_name,
    middleNameTh: r.middle_name_th ?? null,
    middleNameEn: r.middle_name_en ?? null,
    phone: r.mobile_phone,
    dob: r.date_of_birth,
    powerLevel: r.power_level ?? null,
    province: r.province ?? null,
    instituteId: r.institute_id ?? null,
    instituteName: r.institute_name ?? null,
    pdpaConsent: r.pdpa_consent ?? false,
    pdpaConsentAt: r.pdpa_consent_at ?? null,
    createdAt: r.created_at,
  };
}

function mapInstitute(r: any): GoInstitute {
  return {
    id: r.id,
    nameTh: r.name_th,
    active: r.active ?? true,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapHold(r: any): SeatHold | null {
  if (!r) return null;
  return {
    id: r.id,
    tournamentId: r.tournament_id,
    batchId: r.batch_id,
    status: r.status,
    expiresAt: r.expires_at,
    lines: [],
    createdAt: r.created_at,
    releasedAt: r.released_at ?? null,
  };
}

function mapBatch(r: any): RegistrationBatch {
  return {
    id: r.id,
    tournamentId: r.tournament_id,
    kind: r.kind,
    submitterPhone: r.submitter_phone,
    submitterName: r.submitter_name ?? null,
    status: r.status,
    holdId: r.hold_id ?? null,
    totalAmountThb: Number(r.total_amount_thb),
    paymentSlipUrl: r.payment_slip_url ?? null,
    adminNote: r.admin_note ?? null,
    referenceCode: r.reference_code,
    reviewedBy: r.reviewed_by ?? null,
    reviewedAt: r.reviewed_at ?? null,
    slipVerifyStatus: r.slip_verify_status ?? null,
    slipVerifyData: r.slip_verify_data ?? null,
    slipVerifiedAt: r.slip_verified_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapBatchWithSeats(o: any): BatchWithSeats {
  return {
    batch: mapBatch(o.batch),
    seats: (o.seats ?? []).map(mapSeat),
    hold: mapHold(o.hold),
  };
}

function mapPersonRow(r: any): Person {
  return {
    titlePrefix: r.title_prefix,
    titleCustom: r.title_custom ?? null,
    firstNameTh: r.first_name_th,
    lastNameTh: r.last_name_th,
    firstNameEn: r.first_name_en,
    lastNameEn: r.last_name_en,
    hasMiddleName: r.has_middle_name,
    middleNameTh: r.middle_name_th ?? null,
    middleNameEn: r.middle_name_en ?? null,
    phone: r.mobile_phone,
    dob: r.date_of_birth,
    powerLevel: r.power_level ?? null,
    rankStatus: r.rank_status ?? "pending",
    matchedGoPlayerId: r.matched_go_player_id ?? null,
    province: r.province ?? null,
    instituteId: r.institute_id ?? null,
    instituteName: r.institute_name ?? null,
    pdpaConsent: r.pdpa_consent ?? false,
    pdpaConsentAt: r.pdpa_consent_at ?? null,
  };
}

function personToRow(p: Person): Record<string, unknown> {
  return {
    title_prefix: p.titlePrefix,
    title_custom: p.titlePrefix === "อื่นๆ" ? p.titleCustom ?? null : null,
    first_name_th: p.firstNameTh,
    last_name_th: p.lastNameTh,
    first_name_en: p.firstNameEn,
    last_name_en: p.lastNameEn,
    has_middle_name: p.hasMiddleName,
    middle_name_th: p.hasMiddleName ? p.middleNameTh ?? null : null,
    middle_name_en: p.hasMiddleName ? p.middleNameEn ?? null : null,
    mobile_phone: p.phone,
    date_of_birth: p.dob,
    power_level: p.powerLevel ?? null,
    rank_status: p.rankStatus ?? "pending",
    matched_go_player_id: p.matchedGoPlayerId ?? null,
    province: p.province ?? null,
    institute_id: p.instituteId ?? null,
    institute_name: p.instituteName ?? null,
    pdpa_consent: p.pdpaConsent ?? false,
    // stamp the consent time when consent is given and not already recorded
    pdpa_consent_at: p.pdpaConsent
      ? p.pdpaConsentAt ?? new Date().toISOString()
      : null,
  };
}

function buildEvidence(r: {
  source: string;
  year_promoted: number | null;
  rating: number | null;
  diamond: string | null;
  event_date: string | null;
  rank_award: number | null;
  category: string | null;
  rank_in_category: string | null;
  event_name: string | null;
}): string[] {
  if (r.source === "dan") {
    return [
      r.year_promoted ? `สอบผ่านปี ${r.year_promoted}` : null,
      r.rating ? `เรตติ้ง ${r.rating}` : null,
      r.diamond ? `diamond ${r.diamond}` : null,
    ].filter(Boolean) as string[];
  }
  if (r.source === "kyu") {
    return [r.event_date ? `สอบผ่าน ${r.event_date}` : null].filter(
      Boolean,
    ) as string[];
  }
  return [
    r.rank_award ? `ได้อันดับ ${r.rank_award}` : null,
    r.category ? `รุ่น ${r.category}` : null,
    r.rank_in_category ? `กลุ่ม ${r.rank_in_category}` : null,
    r.event_name ? `งาน ${r.event_name}` : null,
    r.event_date ? `วันที่ ${r.event_date}` : null,
  ].filter(Boolean) as string[];
}

export class SupabaseDataLayer implements DataLayer {
  private sb = getSupabase();
  private listeners = new Set<() => void>();

  // ── reactivity (in-client; mutations trigger refetch) ──────────────────────
  subscribe(listener: () => void): () => void {
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

  // ── helpers ────────────────────────────────────────────────────────────────
  private rpcError(error: { message?: string } | null): never {
    const msg = error?.message || "RPC_ERROR";
    for (const key of [
      "DUPLICATE_CODE",
      "CATEGORY_IN_USE",
      "HOLD_EXPIRED",
      "NOT_PENDING_REVIEW",
      "BATCH_NOT_FOUND",
      "SEAT_NOT_FOUND",
      "CATEGORY_NOT_FOUND",
      "CATEGORY_FULL",
      "RANK_REQUIRED",
      "RANK_NOT_ELIGIBLE",
      "AGE_NOT_ELIGIBLE",
      "UNAUTHORIZED",
      "DUPLICATE_NAME",
      "EMPTY_NAME",
      "INSTITUTE_NOT_FOUND",
      "AUTH_REQUIRED",
    ]) {
      if (msg.includes(key)) throw new Error(key);
    }
    if (msg.includes("CAPACITY_BELOW_TAKEN")) {
      const err = new Error("CAPACITY_BELOW_TAKEN") as Error & {
        taken?: number;
      };
      const m = msg.match(/CAPACITY_BELOW_TAKEN:(\d+)/);
      if (m) err.taken = Number(m[1]);
      throw err;
    }
    throw new Error(msg);
  }

  /** Upload a data: URL to Storage and return a public URL. Pass-through for
   *  values that are already URLs or empty. */
  private async maybeUpload(
    value: string | null | undefined,
    prefix: string,
  ): Promise<string | null> {
    if (!value) return null;
    if (!value.startsWith("data:")) return value;
    const mime = value.substring(5, value.indexOf(";")) || "image/jpeg";
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const blob = await (await fetch(value)).blob();
    const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await this.sb.storage
      .from(STORAGE_BUCKET)
      .upload(path, blob, { contentType: mime, upsert: false });
    if (error) throw new Error("STORAGE_FULL");
    return this.sb.storage.from(STORAGE_BUCKET).getPublicUrl(path).data
      .publicUrl;
  }

  // ── tournaments ─────────────────────────────────────────────────────────────
  async getActiveTournament(): Promise<Tournament | null> {
    const { data, error } = await this.sb
      .from("tournament")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map(mapTournament);
    return rows.find((t) => t.status === "published") ?? rows[0] ?? null;
  }

  async getTournament(id: string): Promise<Tournament | null> {
    const { data, error } = await this.sb
      .from("tournament")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapTournament(data) : null;
  }

  async listTournaments(): Promise<Tournament[]> {
    const { data, error } = await this.sb
      .from("tournament")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapTournament);
  }

  async upsertTournament(input: TournamentInput): Promise<Tournament> {
    const bannerUrl = await this.maybeUpload(input.bannerUrl, "banners");
    // PDFs upload exactly like banners (any mime); the public URL goes into the
    // rules_text carrier column. Schedule items ride in schedule_text as JSON.
    const rulesPdfUrl = await this.maybeUpload(input.rulesPdfUrl, "rules");
    const payload: Record<string, unknown> = {
      ...input,
      bannerUrl,
      scheduleText: serializeScheduleGroups(input.scheduleGroups ?? []),
      rulesText: rulesPdfUrl ?? "",
    };
    delete payload.scheduleGroups;
    delete payload.rulesPdfUrl;
    const { data, error } = await this.sb.rpc("upsert_tournament", {
      p_admin_secret: getAdminSecret(),
      p_payload: payload,
    });
    if (error) this.rpcError(error);
    this.notify();
    return mapTournament(data);
  }

  async setTournamentStatus(
    id: string,
    status: TournamentStatus,
  ): Promise<Tournament> {
    const { data, error } = await this.sb.rpc("set_tournament_status", {
      p_admin_secret: getAdminSecret(),
      p_id: id,
      p_status: status,
    });
    if (error) this.rpcError(error);
    this.notify();
    return mapTournament(data);
  }

  // ── categories ──────────────────────────────────────────────────────────────
  async listCategories(tournamentId: string): Promise<Category[]> {
    const { data, error } = await this.sb
      .from("category")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapCategory);
  }

  async listCategoryStats(tournamentId: string): Promise<CategoryStat[]> {
    const { data, error } = await this.sb.rpc("admin_category_stats", {
      p_admin_secret: getAdminSecret(),
      p_tournament_id: tournamentId,
    });
    if (error) this.rpcError(error);
    return (data ?? []) as CategoryStat[];
  }

  async upsertCategory(input: CategoryInput): Promise<Category> {
    const { data, error } = await this.sb.rpc("upsert_category", {
      p_admin_secret: getAdminSecret(),
      p_payload: input,
    });
    if (error) this.rpcError(error);
    this.notify();
    return mapCategory(data);
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const { error } = await this.sb.rpc("delete_category", {
      p_admin_secret: getAdminSecret(),
      p_id: categoryId,
    });
    if (error) this.rpcError(error);
    this.notify();
  }

  // ── reservation ─────────────────────────────────────────────────────────────
  async reserveSeats(input: ReserveSeatsInput): Promise<ReserveSeatsResult> {
    const { data, error } = await this.sb.rpc("reserve_seats", {
      p_tournament_id: input.tournamentId,
      p_kind: input.kind,
      p_submitter_phone: input.submitterPhone,
      p_seats: input.seats,
    });
    if (error) throw new Error(error.message);
    this.notify();
    const d = data as any;
    if (d.ok) {
      return {
        ok: true,
        batchId: d.batchId,
        holdId: d.holdId,
        expiresAt: d.expiresAt,
        totalAmountThb: Number(d.totalAmountThb),
        referenceCode: d.referenceCode,
      };
    }
    return d as ReserveSeatsResult;
  }

  async getBatch(batchId: string): Promise<BatchWithSeats | null> {
    const { data, error } = await this.sb.rpc("get_batch_public", {
      p_batch_id: batchId,
    });
    if (error) throw new Error(error.message);
    if (!data) return null;
    return mapBatchWithSeats(data);
  }

  async getHold(): Promise<SeatHold | null> {
    // Not used by the UI (countdown derives from the reservation's expiresAt).
    return null;
  }

  async releaseBatch(batchId: string): Promise<void> {
    const { error } = await this.sb.rpc("release_batch", {
      p_batch_id: batchId,
    });
    if (error) throw new Error(error.message);
    this.notify();
  }

  async submitRegistration(input: SubmitInput): Promise<RegistrationBatch> {
    const slipUrl = await this.maybeUpload(input.slipUrl, "slips");
    const { data, error } = await this.sb.rpc("submit_registration", {
      p_batch_id: input.batchId,
      p_slip_url: slipUrl,
    });
    if (error) this.rpcError(error);
    this.notify();
    return mapBatch(data.batch);
  }

  // ── admin review ────────────────────────────────────────────────────────────
  async listRegistrations(
    tournamentId: string,
    status: RegistrationStatus | "all" = "all",
  ): Promise<BatchWithSeats[]> {
    const { data, error } = await this.sb.rpc("admin_list_registrations", {
      p_admin_secret: getAdminSecret(),
      p_tournament_id: tournamentId,
      p_status: status,
    });
    if (error) this.rpcError(error);
    return (data ?? []).map((o: any) => mapBatchWithSeats(o));
  }

  async confirmRegistration(
    batchId: string,
    adminId: string,
  ): Promise<RegistrationBatch> {
    const { data, error } = await this.sb.rpc("confirm_registration", {
      p_batch_id: batchId,
      p_admin_secret: getAdminSecret(),
      p_admin_id: adminId,
    });
    if (error) this.rpcError(error);
    this.notify();
    return mapBatch(data.batch);
  }

  async rejectRegistration(
    batchId: string,
    adminId: string,
    note: string,
  ): Promise<RegistrationBatch> {
    const { data, error } = await this.sb.rpc("reject_registration", {
      p_batch_id: batchId,
      p_admin_secret: getAdminSecret(),
      p_note: note,
      p_admin_id: adminId,
    });
    if (error) this.rpcError(error);
    this.notify();
    return mapBatch(data.batch);
  }

  async updateSeat(
    batchId: string,
    seatId: string,
    input: SeatEditInput,
    adminId: string,
  ): Promise<BatchWithSeats> {
    const { data, error } = await this.sb.rpc("admin_update_seat", {
      p_admin_secret: getAdminSecret(),
      p_batch_id: batchId,
      p_seat_id: seatId,
      p_payload: input,
      p_admin_id: adminId,
    });
    if (error) this.rpcError(error);
    this.notify();
    return mapBatchWithSeats(data);
  }

  async deleteSeat(
    batchId: string,
    seatId: string,
    adminId: string,
  ): Promise<BatchWithSeats> {
    const { data, error } = await this.sb.rpc("admin_delete_seat", {
      p_admin_secret: getAdminSecret(),
      p_batch_id: batchId,
      p_seat_id: seatId,
      p_admin_id: adminId,
    });
    if (error) this.rpcError(error);
    this.notify();
    return mapBatchWithSeats(data);
  }

  async deleteBatch(batchId: string, adminId: string): Promise<void> {
    const { error } = await this.sb.rpc("admin_delete_batch", {
      p_admin_secret: getAdminSecret(),
      p_batch_id: batchId,
      p_admin_id: adminId,
    });
    if (error) this.rpcError(error);
    this.notify();
  }

  async verifySlip(batchId: string): Promise<SlipVerifyResult> {
    const { data, error } = await this.sb.functions.invoke("verify-slip", {
      body: { batchId, adminSecret: getAdminSecret() },
    });
    if (error) throw new Error(error.message || "VERIFY_FAILED");
    const res = data as {
      ok: boolean;
      error?: string;
      status?: SlipVerifyStatus;
      data?: SlipVerifyData;
    };
    if (!res.ok || !res.status || !res.data) {
      throw new Error(res.error || "VERIFY_FAILED");
    }
    this.notify(); // the batch's slipVerify* changed → live queries refetch
    return { status: res.status, data: res.data };
  }

  // ── public participants ─────────────────────────────────────────────────────
  async listParticipants(tournamentId: string): Promise<ParticipantRow[]> {
    const { data, error } = await this.sb.rpc("list_participants", {
      p_tournament_id: tournamentId,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as ParticipantRow[];
  }

  // ── housekeeping + payment ──────────────────────────────────────────────────
  async refreshExpired(): Promise<number> {
    // Server-side: pg_cron sweeps every minute + RPCs lazily release on read.
    return 0;
  }

  async buildPromptPayPayload(
    tournamentId: string,
    amountThb: number,
  ): Promise<string> {
    const t = await this.getTournament(tournamentId);
    if (!t || !t.promptpayTargetValue) throw new Error("NO_PROMPTPAY_TARGET");
    return buildPromptPayPayload(
      t.promptpayTargetType,
      t.promptpayTargetValue,
      amountThb,
    );
  }

  // ── auth ────────────────────────────────────────────────────────────────
  async getCurrentUser(): Promise<AuthUser | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? "" } : null;
  }

  async signUp(
    email: string,
    password: string,
  ): Promise<{ user: AuthUser | null; needsEmailConfirm: boolean }> {
    const { data, error } = await this.sb.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    this.notify();
    return {
      user: data.user ? { id: data.user.id, email: data.user.email ?? "" } : null,
      needsEmailConfirm: data.session == null,
    };
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.sb.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        throw new Error("EMAIL_NOT_CONFIRMED");
      }
      if (error.message.toLowerCase().includes("invalid login")) {
        throw new Error("INVALID_CREDENTIALS");
      }
      throw new Error(error.message);
    }
    this.notify();
    return { id: data.user.id, email: data.user.email ?? "" };
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
    this.notify();
  }

  onAuthChange(cb: (user: AuthUser | null) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((_event, session) => {
      this.notify();
      const u = session?.user;
      cb(u ? { id: u.id, email: u.email ?? "" } : null);
    });
    return () => data.subscription.unsubscribe();
  }

  // ── own profile ───────────────────────────────────────────────────────────
  async getMyProfile(): Promise<Profile | null> {
    const user = await this.getCurrentUser();
    if (!user) return null;
    const { data, error } = await this.sb
      .from("profile")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { id: data.id, ...mapPersonRow(data) } : null;
  }

  async upsertMyProfile(input: ProfileInput): Promise<Profile> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("AUTH_REQUIRED");
    const { data, error } = await this.sb
      .from("profile")
      .upsert({
        id: user.id,
        ...personToRow(input as Person),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    this.notify();
    return { id: data.id, ...mapPersonRow(data) };
  }

  // ── managed players ─────────────────────────────────────────────────────
  async listMyPlayers(): Promise<ManagedPlayer[]> {
    const { data, error } = await this.sb
      .from("managed_player")
      .select("*")
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ id: r.id, ...mapPersonRow(r) }));
  }

  async upsertMyPlayer(input: ManagedPlayerInput): Promise<ManagedPlayer> {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("AUTH_REQUIRED");
    const row = personToRow(input as Person);
    if (input.id) {
      const { data, error } = await this.sb
        .from("managed_player")
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      this.notify();
      return { id: data.id, ...mapPersonRow(data) };
    }
    const { data, error } = await this.sb
      .from("managed_player")
      .insert({ owner_id: user.id, ...row })
      .select()
      .single();
    if (error) throw new Error(error.message);
    this.notify();
    return { id: data.id, ...mapPersonRow(data) };
  }

  async deleteMyPlayer(playerId: string): Promise<void> {
    const { error } = await this.sb
      .from("managed_player")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", playerId);
    if (error) throw new Error(error.message);
    this.notify();
  }

  // ── institutes (สถาบันหมากล้อม) ───────────────────────────────────────────
  async listInstitutes(): Promise<GoInstitute[]> {
    const { data, error } = await this.sb
      .from("go_institute")
      .select("*")
      .eq("active", true)
      .order("name_th", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapInstitute);
  }

  async findOrCreateInstitute(name: string): Promise<GoInstitute> {
    const { data, error } = await this.sb.rpc("find_or_create_institute", {
      p_name: name,
    });
    if (error) this.rpcError(error);
    this.notify();
    return mapInstitute(data);
  }

  async adminListInstitutes(): Promise<GoInstitute[]> {
    const { data, error } = await this.sb.rpc("admin_list_institutes", {
      p_admin_secret: getAdminSecret(),
    });
    if (error) this.rpcError(error);
    return ((data ?? []) as any[]).map(mapInstitute);
  }

  async upsertInstitute(input: GoInstituteInput): Promise<GoInstitute> {
    const { data, error } = await this.sb.rpc("upsert_institute", {
      p_admin_secret: getAdminSecret(),
      p_payload: input,
    });
    if (error) this.rpcError(error);
    this.notify();
    return mapInstitute(data);
  }

  async deleteInstitute(id: string): Promise<void> {
    const { error } = await this.sb.rpc("delete_institute", {
      p_admin_secret: getAdminSecret(),
      p_id: id,
    });
    if (error) this.rpcError(error);
    this.notify();
  }

  // ── rank databases (DAN / KYU / AWARD) ────────────────────────────────────
  private async searchSources(
    first: string,
    last: string,
    sources: GoPlayerSource[],
  ): Promise<RankCandidate[]> {
    const { data, error } = await this.sb.rpc("search_go_player_database", {
      p_first_name_th: first,
      p_last_name_th: last,
      p_sources: sources,
      p_limit: 10,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      source: r.source,
      firstNameTh: r.first_name_th,
      lastNameTh: r.last_name_th,
      rank: r.rank,
      powerLevel: r.power_level,
      rating: r.rating ?? null,
      matchType: r.match_type,
      similarityScore: r.similarity_score,
      evidence: buildEvidence(r),
    }));
  }

  async searchRank(
    firstNameTh: string,
    lastNameTh: string,
  ): Promise<RankSearchResult> {
    // Dan database wins outright; otherwise the strongest kyu/award match.
    let candidates = await this.searchSources(firstNameTh, lastNameTh, ["dan"]);
    if (candidates.length === 0) {
      candidates = await this.searchSources(firstNameTh, lastNameTh, [
        "kyu",
        "award",
      ]);
      // keep the strongest candidate per person
      const byName = new Map<string, RankCandidate>();
      for (const c of candidates) {
        const key = `${c.firstNameTh}|${c.lastNameTh}`;
        const cur = byName.get(key);
        if (!cur || c.powerLevel > cur.powerLevel) byName.set(key, c);
      }
      candidates = [...byName.values()];
    }
    const top = candidates.slice(0, 5);
    if (top.length === 0) return { status: "not_found", candidates: [] };
    if (top.length === 1)
      return { status: "matched", candidate: top[0], candidates: top };
    return { status: "multiple", candidates: top };
  }

  async importRankDatabase(
    source: GoPlayerSource,
    rows: GoPlayerImportRow[],
  ): Promise<number> {
    const { data, error } = await this.sb.rpc(
      "replace_go_player_database_source",
      {
        p_admin_secret: getAdminSecret(),
        p_source: source,
        p_rows: rows,
      },
    );
    if (error) this.rpcError(error);
    return Number(data ?? 0);
  }

  async getGoSheetUrl(source: GoPlayerSource): Promise<string> {
    const data = await this.invokeSync({ action: "get", source });
    return (data.url as string) ?? "";
  }

  async fetchGoSheetCsv(
    source: GoPlayerSource,
    url?: string,
  ): Promise<{ csv: string; url: string }> {
    const data = await this.invokeSync({ action: "fetch", source, url: url ?? null });
    return { csv: (data.csv as string) ?? "", url: (data.url as string) ?? "" };
  }

  /** Call the `sync-go-database` edge function with the admin passphrase.
   *  The function always returns 200 with { ok, ... }; surface ok:false as an error. */
  private async invokeSync(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await this.sb.functions.invoke("sync-go-database", {
      body: { ...body, adminSecret: getAdminSecret() },
    });
    if (error) throw new Error(error.message || "SYNC_FAILED");
    const d = (data ?? {}) as Record<string, unknown>;
    if (!d.ok) throw new Error((d.error as string) || "SYNC_FAILED");
    return d;
  }

}
