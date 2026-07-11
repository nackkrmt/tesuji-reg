import { buildPromptPayPayload } from "@/lib/promptpay";
import { getAdminSecret } from "@/lib/admin-auth";
import { withRetry } from "@/lib/retry";
import { parseScheduleGroups, serializeScheduleGroups } from "@/lib/schedule";
import { parseRulesSections, serializeRulesSections } from "@/lib/rules";
import { getSupabase, STORAGE_BUCKET, SLIP_BUCKET } from "./supabaseClient";
import {
  activeRegistrationKeys,
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
  ManagedPlayer,
  ManagedPlayerInput,
  ParticipantRow,
  Person,
  personMatchKey,
  pickActiveTournament,
  ApplyPromoResult,
  PromoCode,
  PromoCodeInput,
  PromoKind,
  PromptPayTargetType,
  Profile,
  ProfileInput,
  RankCandidate,
  RankSearchResult,
  RankStatus,
  RefundStatus,
  RegistrationBatch,
  RegistrationSeat,
  RegistrationStatus,
  ReserveSeatsInput,
  ReserveSeatsResult,
  SeatEditInput,
  SeatHold,
  StoreTopic,
  SlipVerifyData,
  SlipVerifyResult,
  SlipVerifyStatus,
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
import type { Json, Tables } from "./database.types";

// Generated row aliases — mappers are typed against the live schema, so a
// column rename breaks the build instead of failing silently at runtime.
type TournamentRow = Tables<"tournament">;
type CategoryRow = Tables<"category">;
type SeatRow = Tables<"registration_seat">;
// admin_list_registrations enriches batches with the owner account's info
type BatchRow = Tables<"registration_batch"> & {
  owner_name?: string | null;
  owner_email?: string | null;
};
type HoldRow = Tables<"seat_hold">;
type InstituteRow = Tables<"go_institute">;
type PromoRow = Tables<"promo_code">;
type PersonRow = Tables<"profile"> | Tables<"managed_player">;

/** RPC payloads/results are jsonb (typed as Json); this brands app-side
 *  shapes across that boundary in one visible place. */
const toJson = (v: unknown) => v as Json;

/** Shape of the jsonb `{batch, seats, hold}` objects the batch RPCs return. */
interface BatchWithSeatsRow {
  batch: BatchRow;
  seats?: SeatRow[] | null;
  hold?: HoldRow | null;
}

// ── row → entity mappers (snake_case → camelCase) ────────────────────────────
function mapTournament(r: TournamentRow): Tournament {
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
    rulesSections: parseRulesSections(r.rules_text),
    // The DB enum still allows phone/national_id from an earlier iteration;
    // the app only issues merchant QR payloads now.
    promptpayTargetType: r.promptpay_target_type as PromptPayTargetType,
    promptpayTargetValue: r.promptpay_target_value ?? "",
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapCategory(r: CategoryRow): Category {
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

function mapSeat(r: SeatRow): RegistrationSeat {
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
    withdrawnAt: r.withdrawn_at ?? null,
  };
}

/** admin_list_withdrawals / admin_set_withdrawal_status rows (already camelCase). */
interface WithdrawalRpcRow {
  id: string;
  seatId: string;
  batchId: string;
  tournamentId: string;
  personName: string;
  categoryId?: string | null;
  categoryLabel: string;
  feeThb: number | string;
  batchReference: string;
  reason?: string | null;
  bankName: string;
  bankAccountNo: string;
  bankAccountName: string;
  refundStatus: RefundStatus;
  refundSlipUrl?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

function mapWithdrawal(r: WithdrawalRpcRow): Withdrawal {
  return {
    id: r.id,
    seatId: r.seatId,
    batchId: r.batchId,
    tournamentId: r.tournamentId,
    personName: r.personName,
    categoryId: r.categoryId ?? null,
    categoryLabel: r.categoryLabel,
    feeThb: Number(r.feeThb),
    batchReference: r.batchReference,
    reason: r.reason ?? null,
    bankName: r.bankName,
    bankAccountNo: r.bankAccountNo,
    bankAccountName: r.bankAccountName,
    refundStatus: r.refundStatus,
    refundSlipUrl: r.refundSlipUrl ?? null,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt ?? null,
    resolvedBy: r.resolvedBy ?? null,
  };
}

function mapInstitute(r: InstituteRow): GoInstitute {
  return {
    id: r.id,
    nameTh: r.name_th,
    active: r.active ?? true,
    keywords: r.keywords ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapHold(r: HoldRow | null | undefined): SeatHold | null {
  if (!r) return null;
  return {
    id: r.id,
    tournamentId: r.tournament_id,
    batchId: r.batch_id ?? "",
    status: r.status,
    expiresAt: r.expires_at,
    lines: [],
    createdAt: r.created_at,
    releasedAt: r.released_at ?? null,
  };
}

function mapBatch(r: BatchRow): RegistrationBatch {
  return {
    id: r.id,
    tournamentId: r.tournament_id,
    accountId: r.account_id ?? null,
    kind: r.kind,
    submitterPhone: r.submitter_phone,
    submitterName: r.submitter_name ?? null,
    ownerName: r.owner_name ?? null,
    ownerEmail: r.owner_email ?? null,
    status: r.status,
    holdId: r.hold_id ?? null,
    totalAmountThb: Number(r.total_amount_thb),
    paymentSlipUrl: r.payment_slip_url ?? null,
    adminNote: r.admin_note ?? null,
    referenceCode: r.reference_code,
    reviewedBy: r.reviewed_by ?? null,
    reviewedAt: r.reviewed_at ?? null,
    slipVerifyStatus: (r.slip_verify_status ?? null) as SlipVerifyStatus | null,
    slipVerifyData: (r.slip_verify_data ?? null) as SlipVerifyData | null,
    slipVerifiedAt: r.slip_verified_at ?? null,
    promoCode: r.promo_code ?? null,
    promoKind: (r.promo_kind ?? null) as PromoKind | null,
    promoValue: r.promo_value == null ? null : Number(r.promo_value),
    discountThb: r.discount_thb == null ? 0 : Number(r.discount_thb),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapPromo(r: PromoRow): PromoCode {
  return {
    id: r.id,
    tournamentId: r.tournament_id,
    code: r.code,
    kind: r.kind as PromoKind,
    value: Number(r.value),
    maxUses: r.max_uses == null ? null : Number(r.max_uses),
    usedCount: Number(r.used_count ?? 0),
    validFrom: r.valid_from ?? null,
    validUntil: r.valid_until ?? null,
    active: !!r.active,
    note: r.note ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapBatchWithSeats(o: BatchWithSeatsRow): BatchWithSeats {
  return {
    batch: mapBatch(o.batch),
    seats: (o.seats ?? []).map(mapSeat),
    hold: mapHold(o.hold),
  };
}

function mapPersonRow(r: PersonRow): Person {
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
    rankStatus: (r.rank_status ?? "pending") as RankStatus,
    matchedGoPlayerId: r.matched_go_player_id ?? null,
    province: r.province ?? null,
    instituteId: r.institute_id ?? null,
    instituteName: r.institute_name ?? null,
    pdpaConsent: r.pdpa_consent ?? false,
    pdpaConsentAt: r.pdpa_consent_at ?? null,
  };
}

// Return type is inferred so the exact column keys flow into the typed
// profile/managed_player upserts below.
function personToRow(p: Person) {
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

/** Map an admin_*_award_exemption RPC row (already camelCase) to the type. */
interface AwardExemptionRpcRow {
  id: string;
  firstNameTh: string;
  lastNameTh: string;
  note?: string | null;
  createdAt: string;
}
function mapAwardExemption(r: AwardExemptionRpcRow): AwardLimitExemption {
  return {
    id: r.id,
    firstNameTh: r.firstNameTh,
    lastNameTh: r.lastNameTh,
    note: r.note ?? null,
    createdAt: r.createdAt,
  };
}

export class SupabaseDataLayer implements DataLayer {
  private sb = getSupabase();
  private listeners = new Map<() => void, readonly StoreTopic[] | undefined>();
  // Remembers the last slip upload so a submit retry (or a user re-tapping
  // confirm after a transient failure) doesn't re-upload the same data URL and
  // orphan a duplicate file in the slip bucket.
  private lastSlipUpload: { dataUrl: string; path: string } | null = null;

  // ── reactivity (in-client; mutations trigger refetch) ──────────────────────
  subscribe(listener: () => void, topics?: readonly StoreTopic[]): () => void {
    this.listeners.set(listener, topics);
    return () => this.listeners.delete(listener);
  }
  /** Notify listeners. `topics` tags which domains changed so topic-scoped
   *  subscribers skip unrelated refetches; calling with no topics broadcasts
   *  to everyone (auth changes, or anything hard to classify). */
  private notify(topics?: readonly StoreTopic[]) {
    this.listeners.forEach((subscribed, l) => {
      if (topics && subscribed && !topics.some((t) => subscribed.includes(t)))
        return;
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
      "ALREADY_WITHDRAWN",
      "CATEGORY_NOT_FOUND",
      "CATEGORY_FULL",
      "RANK_REQUIRED",
      "RANK_NOT_ELIGIBLE",
      "AGE_NOT_ELIGIBLE",
      "UNAUTHORIZED",
      "DUPLICATE_NAME",
      "EMPTY_NAME",
      "INVALID_NAME",
      "INSTITUTE_NOT_FOUND",
      "AUTH_REQUIRED",
      "LOCKED",
      "SLIP_REQUIRED",
      "NOT_FOUND",
      "INVALID_STATUS",
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

  /** Decode a `data:` URL to a Blob WITHOUT fetch(). fetch() of a data: URL is
   *  blocked by our CSP connect-src and is unreliable inside the LINE / iOS
   *  in-app webview — it threw a network error that the retry layer reported as
   *  a bogus "ระบบกำลังหนาแน่น" on slip upload. Decoding inline avoids both. */
  private dataUrlToBlob(dataUrl: string): Blob {
    const comma = dataUrl.indexOf(",");
    const header = dataUrl.slice(5, comma); // strip leading "data:"
    const mime = header.split(";")[0] || "image/jpeg";
    const body = dataUrl.slice(comma + 1);
    if (!/;base64/i.test(header)) {
      return new Blob([decodeURIComponent(body)], { type: mime });
    }
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
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
    const blob = this.dataUrlToBlob(value);
    const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await this.sb.storage
      .from(STORAGE_BUCKET)
      .upload(path, blob, { contentType: mime, upsert: false });
    if (error) throw new Error("STORAGE_FULL");
    return this.sb.storage.from(STORAGE_BUCKET).getPublicUrl(path).data
      .publicUrl;
  }

  /** Upload a payment slip to the PRIVATE slip bucket and return the object PATH
   *  (not a public URL). Slips are never world-readable; verify-slip reads them via
   *  the service role and admins view them via short-lived signed URLs. Values that
   *  are already a path/URL (re-submit) or empty pass through unchanged. */
  private async uploadSlip(
    value: string | null | undefined,
  ): Promise<string | null> {
    if (!value) return null;
    if (!value.startsWith("data:")) return value;
    if (this.lastSlipUpload?.dataUrl === value) return this.lastSlipUpload.path;
    const mime = value.substring(5, value.indexOf(";")) || "image/jpeg";
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    const blob = this.dataUrlToBlob(value);
    const path = `${crypto.randomUUID()}.${ext}`;
    // Fresh UUID path + upsert:false makes a retry of the same upload safe.
    await withRetry(async () => {
      const { error } = await this.sb.storage
        .from(SLIP_BUCKET)
        .upload(path, blob, { contentType: mime, upsert: false });
      if (error) throw new Error("STORAGE_FULL");
    });
    this.lastSlipUpload = { dataUrl: value, path };
    return path; // bare object path within the private bucket
  }

  /** Resolve a batch's payment slip to a viewable, short-lived signed URL (admin
   *  only). Routed through the admin-gated verify-slip function since signing needs
   *  the service role. Returns null when there is no slip. */
  async getSlipUrl(batchId: string): Promise<string | null> {
    const { data, error } = await this.sb.functions.invoke("verify-slip", {
      body: { batchId, adminSecret: getAdminSecret(), action: "view" },
    });
    if (error) throw new Error(error.message || "SLIP_URL_FAILED");
    const res = data as { ok: boolean; url?: string; error?: string };
    if (!res.ok || !res.url) return null;
    return res.url;
  }

  // ── tournaments ─────────────────────────────────────────────────────────────
  async getActiveTournament(): Promise<Tournament | null> {
    const { data, error } = await this.sb
      .from("tournament")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return pickActiveTournament((data ?? []).map(mapTournament));
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
    // Schedule groups and rules sections both ride in their text carrier
    // columns (schedule_text / rules_text) as JSON.
    const payload: Record<string, unknown> = {
      ...input,
      bannerUrl,
      scheduleText: serializeScheduleGroups(input.scheduleGroups ?? []),
      rulesText: serializeRulesSections(input.rulesSections ?? []),
    };
    delete payload.scheduleGroups;
    delete payload.rulesSections;
    const { data, error } = await this.sb.rpc("upsert_tournament", {
      p_admin_secret: getAdminSecret(),
      p_payload: toJson(payload),
    });
    if (error) this.rpcError(error);
    this.notify(["tournament"]);
    return mapTournament(data as unknown as TournamentRow);
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
    this.notify(["tournament"]);
    return mapTournament(data as unknown as TournamentRow);
  }

  // ── danger zone (post-event reset; irreversible) ─────────────────────────────
  async clearRegistrations(
    tournamentId: string,
    confirmName: string,
  ): Promise<number> {
    const { data, error } = await this.sb.rpc("admin_clear_registrations", {
      p_admin_secret: getAdminSecret(),
      p_tournament_id: tournamentId,
      p_confirm: confirmName,
    });
    if (error) this.rpcError(error);
    this.notify(["registrations", "categories", "withdrawals"]);
    return (data as number) ?? 0;
  }

  async clearCategories(
    tournamentId: string,
    confirmName: string,
  ): Promise<number> {
    const { data, error } = await this.sb.rpc("admin_clear_categories", {
      p_admin_secret: getAdminSecret(),
      p_tournament_id: tournamentId,
      p_confirm: confirmName,
    });
    if (error) this.rpcError(error);
    this.notify(["categories", "registrations"]);
    return (data as number) ?? 0;
  }

  async deleteTournament(
    tournamentId: string,
    confirmName: string,
  ): Promise<void> {
    const { error } = await this.sb.rpc("admin_delete_tournament", {
      p_admin_secret: getAdminSecret(),
      p_tournament_id: tournamentId,
      p_confirm: confirmName,
    });
    if (error) this.rpcError(error);
    this.notify(["tournament", "categories", "registrations", "withdrawals"]);
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
    return (data ?? []) as unknown as CategoryStat[];
  }

  async upsertCategory(input: CategoryInput): Promise<Category> {
    const { data, error } = await this.sb.rpc("upsert_category", {
      p_admin_secret: getAdminSecret(),
      p_payload: toJson(input),
    });
    if (error) this.rpcError(error);
    this.notify(["categories"]);
    return mapCategory(data as unknown as CategoryRow);
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const { error } = await this.sb.rpc("delete_category", {
      p_admin_secret: getAdminSecret(),
      p_id: categoryId,
    });
    if (error) this.rpcError(error);
    this.notify(["categories"]);
  }

  // ── reservation ─────────────────────────────────────────────────────────────
  async reserveSeats(input: ReserveSeatsInput): Promise<ReserveSeatsResult> {
    const { data, error } = await this.sb.rpc("reserve_seats", {
      p_tournament_id: input.tournamentId,
      p_kind: input.kind,
      p_submitter_phone: input.submitterPhone,
      p_seats: toJson(input.seats),
    });
    if (error) throw new Error(error.message);
    this.notify(["registrations", "categories"]);
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
    return mapBatchWithSeats(data as unknown as BatchWithSeatsRow);
  }

  /** Admin-gated single-batch read (owner check does not apply). get_batch_public
   *  is owner-only, so admin views go through this secret-gated RPC instead. */
  async getBatchAdmin(batchId: string): Promise<BatchWithSeats | null> {
    const { data, error } = await this.sb.rpc("admin_get_batch", {
      p_admin_secret: getAdminSecret(),
      p_batch_id: batchId,
    });
    if (error) this.rpcError(error);
    if (!data) return null;
    return mapBatchWithSeats(data as unknown as BatchWithSeatsRow);
  }

  async getHold(): Promise<SeatHold | null> {
    // Not used by the UI (countdown derives from the reservation's expiresAt).
    return null;
  }

  async listMyRegistrations(): Promise<BatchWithSeats[]> {
    const { data, error } = await this.sb.rpc("my_registrations");
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as BatchWithSeatsRow[]).map(
      mapBatchWithSeats,
    );
  }

  async releaseBatch(batchId: string): Promise<void> {
    const { error } = await this.sb.rpc("release_batch", {
      p_batch_id: batchId,
    });
    if (error) throw new Error(error.message);
    this.notify(["registrations", "categories"]);
  }

  // ── withdraw + swap (owner) ───────────────────────────────────────────────
  async withdrawSeat(input: WithdrawSeatInput): Promise<WithdrawSeatResult> {
    const { data, error } = await this.sb.rpc("withdraw_seat", {
      p_seat_id: input.seatId,
      // SQL text args accept NULL but codegen types them as string.
      p_reason: (input.reason ?? null) as unknown as string,
      p_bank_name: input.bankName,
      p_bank_account_no: input.bankAccountNo,
      p_bank_account_name: input.bankAccountName,
    });
    if (error) throw new Error(error.message);
    const d = data as WithdrawSeatResult;
    if (d.ok) this.notify(["registrations", "categories", "withdrawals"]);
    return d;
  }

  async swapSeat(input: SwapSeatInput): Promise<SwapSeatResult> {
    const { data, error } = await this.sb.rpc("swap_seat", {
      p_seat_id: input.seatId,
      p_source_kind: input.sourceKind,
      p_source_player_id: (input.sourcePlayerId ?? null) as unknown as string,
      p_category_id: input.categoryId,
    });
    if (error) throw new Error(error.message);
    const d = data as SwapSeatResult;
    if (d.ok) this.notify(["registrations", "categories"]);
    return d;
  }

  async adminListWithdrawals(tournamentId: string): Promise<Withdrawal[]> {
    const { data, error } = await this.sb.rpc("admin_list_withdrawals", {
      p_admin_secret: getAdminSecret(),
      p_tournament_id: tournamentId,
    });
    if (error) this.rpcError(error);
    return ((data ?? []) as unknown as WithdrawalRpcRow[]).map(mapWithdrawal);
  }

  async adminSetWithdrawalStatus(
    withdrawalId: string,
    status: RefundStatus,
    refundSlip?: string | null,
  ): Promise<Withdrawal> {
    // "refunded" needs proof: upload the slip data URL to the private bucket
    // first and hand the RPC the bare path (server re-validates + locks).
    const slipPath =
      status === "refunded" ? await this.uploadSlip(refundSlip) : null;
    const { data, error } = await this.sb.rpc("admin_set_withdrawal_status", {
      p_admin_secret: getAdminSecret(),
      p_withdrawal_id: withdrawalId,
      p_status: status,
      p_refund_slip_url: slipPath as unknown as string,
    });
    if (error) this.rpcError(error);
    this.notify(["withdrawals", "registrations"]);
    return mapWithdrawal(data as unknown as WithdrawalRpcRow);
  }

  /** Resolve a refund-proof slip path (private bucket) to a short-lived signed
   *  URL. Works client-side because admins hold a storage SELECT policy on the
   *  slip bucket. Data URLs / full URLs pass through unchanged. */
  async getRefundSlipUrl(ref: string): Promise<string | null> {
    if (!ref) return null;
    if (ref.startsWith("data:") || ref.includes("://")) return ref;
    const { data, error } = await this.sb.storage
      .from(SLIP_BUCKET)
      .createSignedUrl(ref, 600);
    if (error) return null;
    return data?.signedUrl ?? null;
  }

  async submitRegistration(input: SubmitInput): Promise<RegistrationBatch> {
    const slipUrl = await this.uploadSlip(input.slipUrl);
    // submit_registration is idempotent (a batch already past pending_payment
    // just returns its current state), so retrying transient failures here
    // cannot double-submit — unlike most writes, safe to wrap in withRetry.
    const data = await withRetry(async () => {
      const { data, error } = await this.sb.rpc("submit_registration", {
        p_batch_id: input.batchId,
        p_slip_url: slipUrl as unknown as string,
      });
      if (error) this.rpcError(error);
      return data as unknown as BatchWithSeatsRow;
    });
    this.notify(["registrations"]);
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
    return ((data ?? []) as unknown as BatchWithSeatsRow[]).map(
      mapBatchWithSeats,
    );
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
    this.notify(["registrations", "categories"]);
    return mapBatch((data as unknown as BatchWithSeatsRow).batch);
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
    this.notify(["registrations", "categories"]);
    return mapBatch((data as unknown as BatchWithSeatsRow).batch);
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
      p_payload: toJson(input),
      p_admin_id: adminId,
    });
    if (error) this.rpcError(error);
    this.notify(["registrations", "categories"]);
    return mapBatchWithSeats(data as unknown as BatchWithSeatsRow);
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
    this.notify(["registrations", "categories"]);
    return mapBatchWithSeats(data as unknown as BatchWithSeatsRow);
  }

  async deleteBatch(batchId: string, adminId: string): Promise<void> {
    const { error } = await this.sb.rpc("admin_delete_batch", {
      p_admin_secret: getAdminSecret(),
      p_batch_id: batchId,
      p_admin_id: adminId,
    });
    if (error) this.rpcError(error);
    this.notify(["registrations", "categories"]);
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
    this.notify(["registrations"]); // the batch's slipVerify* changed → live queries refetch
    return { status: res.status, data: res.data };
  }

  // ── public participants ─────────────────────────────────────────────────────
  async listParticipants(tournamentId: string): Promise<ParticipantRow[]> {
    const { data, error } = await this.sb.rpc("list_participants", {
      p_tournament_id: tournamentId,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ParticipantRow[];
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
    return buildPromptPayPayload(t.promptpayTargetValue, amountThb);
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

  async isAdmin(): Promise<boolean> {
    const { data, error } = await this.sb.rpc("is_admin_me");
    if (error) return false;
    return data === true;
  }

  onAuthChange(cb: (user: AuthUser | null) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((event, session) => {
      // TOKEN_REFRESHED fires periodically (~hourly) with the same user — no
      // query result can change, so don't force every live query on the page
      // to refetch (this used to wipe in-progress UI state mid-registration).
      if (event !== "TOKEN_REFRESHED") this.notify();
      const u = session?.user;
      cb(u ? { id: u.id, email: u.email ?? "" } : null);
    });
    return () => data.subscription.unsubscribe();
  }

  async requestPasswordReset(email: string): Promise<void> {
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/reset-password`
        : undefined;
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    if (error) throw new Error(error.message);
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.sb.auth.updateUser({ password: newPassword });
    if (error) {
      if (error.message.toLowerCase().includes("session")) {
        throw new Error("RECOVERY_SESSION_MISSING");
      }
      throw new Error(error.message);
    }
    this.notify();
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
    this.notify(["profile"]);
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
      this.notify(["players"]);
      return { id: data.id, ...mapPersonRow(data) };
    }
    const { data, error } = await this.sb
      .from("managed_player")
      .insert({ owner_id: user.id, ...row })
      .select()
      .single();
    if (error) throw new Error(error.message);
    this.notify(["players"]);
    return { id: data.id, ...mapPersonRow(data) };
  }

  async deleteMyPlayer(playerId: string): Promise<void> {
    // Block deletion while this player has a live registration in a competition.
    const [players, regs] = await Promise.all([
      this.listMyPlayers(),
      this.listMyRegistrations(),
    ]);
    const player = players.find((p) => p.id === playerId);
    if (player && activeRegistrationKeys(regs).has(personMatchKey(player))) {
      throw new Error("PLAYER_HAS_REGISTRATIONS");
    }
    const { error } = await this.sb
      .from("managed_player")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", playerId);
    if (error) throw new Error(error.message);
    this.notify(["players"]);
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
    this.notify(["institutes"]);
    return mapInstitute(data as unknown as InstituteRow);
  }

  async adminListInstitutes(): Promise<GoInstitute[]> {
    const { data, error } = await this.sb.rpc("admin_list_institutes", {
      p_admin_secret: getAdminSecret(),
    });
    if (error) this.rpcError(error);
    return ((data ?? []) as unknown as InstituteRow[]).map(mapInstitute);
  }

  async upsertInstitute(input: GoInstituteInput): Promise<GoInstitute> {
    const { data, error } = await this.sb.rpc("upsert_institute", {
      p_admin_secret: getAdminSecret(),
      p_payload: toJson(input),
    });
    if (error) this.rpcError(error);
    this.notify(["institutes"]);
    return mapInstitute(data as unknown as InstituteRow);
  }

  async deleteInstitute(id: string): Promise<void> {
    const { error } = await this.sb.rpc("delete_institute", {
      p_admin_secret: getAdminSecret(),
      p_id: id,
    });
    if (error) this.rpcError(error);
    this.notify(["institutes"]);
  }

  async purgeInstitute(id: string): Promise<void> {
    const { error } = await this.sb.rpc("purge_institute", {
      p_admin_secret: getAdminSecret(),
      p_id: id,
    });
    if (error) this.rpcError(error);
    this.notify(["institutes", "registrations"]);
  }

  async mergeInstitute(sourceId: string, targetId: string): Promise<string> {
    const { data, error } = await this.sb.rpc("merge_institute", {
      p_admin_secret: getAdminSecret(),
      p_source_id: sourceId,
      p_target_id: targetId,
    });
    if (error) this.rpcError(error);
    this.notify(["institutes", "registrations"]);
    return (data as unknown as { merge_id: string }).merge_id;
  }

  async unmergeInstitute(mergeId: string): Promise<void> {
    const { error } = await this.sb.rpc("unmerge_institute", {
      p_admin_secret: getAdminSecret(),
      p_merge_id: mergeId,
    });
    if (error) this.rpcError(error);
    this.notify(["institutes", "registrations"]);
  }

  async listInstituteMerges(): Promise<InstituteMerge[]> {
    const { data, error } = await this.sb.rpc("list_institute_merges", {
      p_admin_secret: getAdminSecret(),
    });
    if (error) this.rpcError(error);
    return (data ?? []) as unknown as InstituteMerge[];
  }

  async instituteRegistrationCounts(): Promise<Record<string, number>> {
    const { data, error } = await this.sb.rpc("admin_institute_counts", {
      p_admin_secret: getAdminSecret(),
    });
    if (error) this.rpcError(error);
    return (data ?? {}) as unknown as Record<string, number>;
  }

  // ── promo / discount codes ────────────────────────────────────────────────
  async applyPromo(
    batchId: string,
    code: string | null,
  ): Promise<ApplyPromoResult> {
    const { data, error } = await this.sb.rpc("apply_promo", {
      p_batch_id: batchId,
      p_code: code as unknown as string,
    });
    if (error) this.rpcError(error);
    this.notify(["registrations", "promos"]);
    return data as unknown as ApplyPromoResult;
  }

  async adminListPromos(tournamentId?: string): Promise<PromoCode[]> {
    const { data, error } = await this.sb.rpc("admin_list_promos", {
      p_admin_secret: getAdminSecret(),
      p_tournament_id: (tournamentId ?? null) as unknown as string,
    });
    if (error) this.rpcError(error);
    return ((data ?? []) as unknown as PromoRow[]).map(mapPromo);
  }

  async adminUpsertPromo(input: PromoCodeInput): Promise<PromoCode> {
    const { data, error } = await this.sb.rpc("admin_upsert_promo", {
      p_admin_secret: getAdminSecret(),
      p_payload: toJson(input),
    });
    if (error) this.rpcError(error);
    this.notify(["promos"]);
    return mapPromo(data as unknown as PromoRow);
  }

  async adminDeletePromo(id: string): Promise<void> {
    const { error } = await this.sb.rpc("admin_delete_promo", {
      p_admin_secret: getAdminSecret(),
      p_promo_id: id,
    });
    if (error) this.rpcError(error);
    this.notify(["promos"]);
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
    // The dan database wins outright only on a real (exact/normalized) match —
    // a confirmed dan player's current rank supersedes old kyu/award history.
    // A fuzzy dan hit must never shadow a stronger kyu/award match: trigram
    // similarity on the full name lets a sibling with the same long surname
    // slip past the threshold, so fuzzy candidates from all sources compete
    // on match quality instead.
    const [dan, kyuAward] = await Promise.all([
      this.searchSources(firstNameTh, lastNameTh, ["dan"]),
      this.searchSources(firstNameTh, lastNameTh, ["kyu", "award"]),
    ]);
    const danStrong = dan.filter((c) => c.matchType !== "fuzzy");
    let candidates: RankCandidate[];
    if (danStrong.length > 0) {
      candidates = danStrong;
    } else {
      // keep the strongest candidate per person (dan power > kyu/award, so a
      // person's dan row naturally wins over their own history)
      const byName = new Map<string, RankCandidate>();
      for (const c of [...dan, ...kyuAward]) {
        const key = `${c.firstNameTh}|${c.lastNameTh}`;
        const cur = byName.get(key);
        if (!cur || c.powerLevel > cur.powerLevel) byName.set(key, c);
      }
      const quality: Record<RankCandidate["matchType"], number> = {
        exact: 0,
        normalized: 1,
        fuzzy: 2,
      };
      candidates = [...byName.values()].sort(
        (a, b) =>
          quality[a.matchType] - quality[b.matchType] ||
          b.similarityScore - a.similarityScore ||
          b.powerLevel - a.powerLevel,
      );
    }
    const top = candidates.slice(0, 5);
    if (top.length === 0) return { status: "not_found", candidates: [] };
    // Auto-apply a single certain (exact/normalized) hit even when fuzzy
    // look-alikes come back with it — the exact name is unambiguous, so the
    // user shouldn't have to pick. Only-fuzzy results, or two genuine exact
    // namesakes, still need the user to confirm which one is them.
    const strong = top.filter((c) => c.matchType !== "fuzzy");
    if (strong.length === 1)
      return { status: "matched", candidate: strong[0], candidates: top };
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
        p_rows: toJson(rows),
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

  async checkAwardLimit(
    firstNameTh: string,
    lastNameTh: string,
  ): Promise<AwardLimitStatus> {
    const { data, error } = await this.sb.rpc("award_limit_status", {
      p_first_name_th: firstNameTh,
      p_last_name_th: lastNameTh,
    });
    if (error) throw new Error(error.message);
    const d = (data ?? {}) as {
      count?: number;
      inDan?: boolean;
      exempt?: boolean;
      banned?: boolean;
    };
    return {
      count: Number(d.count ?? 0),
      inDan: Boolean(d.inDan),
      exempt: Boolean(d.exempt),
      banned: Boolean(d.banned),
    };
  }

  async adminListAwardExemptions(): Promise<AwardLimitExemption[]> {
    const { data, error } = await this.sb.rpc("admin_list_award_exemptions", {
      p_admin_secret: getAdminSecret(),
    });
    if (error) this.rpcError(error);
    return ((data ?? []) as unknown as AwardExemptionRpcRow[]).map(
      mapAwardExemption,
    );
  }

  async adminAddAwardExemption(
    firstNameTh: string,
    lastNameTh: string,
    note: string | null,
  ): Promise<AwardLimitExemption> {
    const { data, error } = await this.sb.rpc("admin_add_award_exemption", {
      p_admin_secret: getAdminSecret(),
      p_first_name_th: firstNameTh,
      p_last_name_th: lastNameTh,
      p_note: note as unknown as string,
    });
    if (error) this.rpcError(error);
    this.notify(["rankdb"]);
    return mapAwardExemption(data as unknown as AwardExemptionRpcRow);
  }

  async adminRemoveAwardExemption(id: string): Promise<void> {
    const { error } = await this.sb.rpc("admin_remove_award_exemption", {
      p_admin_secret: getAdminSecret(),
      p_id: id,
    });
    if (error) this.rpcError(error);
    this.notify(["rankdb"]);
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
