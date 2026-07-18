// Supabase-backed client for the live competition domain. Reads hit the tables
// directly (public SELECT via RLS); writes go through the guarded RPCs, passing
// a secret (admin passphrase for admin, or the live_token for judges / the .jar).

import { getSupabase } from "@/lib/data/supabaseClient";
import { parseAnnouncementValue } from "./types";
import type { JudgeInfo, LiveAnnouncement, LiveDivision, LiveMatch, LiveStanding } from "./types";

type MatchRow = {
  id: string;
  division_id: string;
  round: string;
  table_no: string;
  black: string;
  white: string;
  black_force: string;
  white_force: string;
  result: string;
  remark: string;
  check_in: string;
  absent: string;
  submitted_by: string;
};

function mapMatch(r: MatchRow): LiveMatch {
  return {
    id: r.id,
    divisionId: r.division_id,
    round: r.round,
    table: r.table_no,
    black: r.black_force || r.black,
    white: r.white_force || r.white,
    blackForce: r.black_force,
    whiteForce: r.white_force,
    result: r.result,
    remark: r.remark,
    checkIn: r.check_in,
    absent: r.absent,
    submittedBy: r.submitted_by,
    isForced: !!(r.black_force || r.white_force),
  };
}

// ── Reads ─────────────────────────────────────────────────────────────────────
export async function listDivisions(): Promise<LiveDivision[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("live_division")
    .select("id,name,sort_order")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id as string,
    name: d.name as string,
    sortOrder: (d.sort_order as number) ?? 0,
  }));
}

export async function listMatches(divisionId?: string): Promise<LiveMatch[]> {
  const sb = getSupabase();
  let q = sb
    .from("live_match")
    .select(
      "id,division_id,round,table_no,black,white,black_force,white_force,result,remark,check_in,absent,submitted_by",
    );
  if (divisionId) q = q.eq("division_id", divisionId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? [] as MatchRow[]).map((r) => mapMatch(r as MatchRow));
}

export async function listStandings(): Promise<LiveStanding[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("live_standing")
    .select("division_id,headers,rows,updated_at");
  if (error) throw error;
  return (data ?? []).map((s) => ({
    divisionId: s.division_id as string,
    headers: (s.headers as string[]) ?? [],
    rows: (s.rows as string[][]) ?? [],
    updatedAt: (s.updated_at as string) ?? null,
  }));
}

/** Current announcement banner (live_config, public read). Null-safe: missing
 *  row = no announcement yet. */
export async function getAnnouncement(): Promise<LiveAnnouncement> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("live_config")
    .select("value,updated_at")
    .eq("key", "announcement")
    .maybeSingle();
  if (error) throw error;
  const { text, urgent } = parseAnnouncementValue(data?.value);
  return { text, urgent, updatedAt: (data?.updated_at as string) ?? null };
}

// ── Realtime ────────────────────────────────────────────────────────────────
/** Subscribe to any change on the live tables. Returns an unsubscribe fn. */
export function subscribeLive(onChange: () => void): () => void {
  const sb = getSupabase();
  const channel = sb
    .channel("live-competition")
    .on("postgres_changes", { event: "*", schema: "public", table: "live_match" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "live_division" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "live_standing" }, onChange)
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}

// ── Writes (guarded RPCs) ─────────────────────────────────────────────────────
/** Validate a judge secret link / admin passphrase against the server. */
export async function checkToken(secret: string): Promise<boolean> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("live_check_token", { p_secret: secret });
  if (error) return false;
  return data === true;
}

export async function submitResult(
  secret: string,
  divisionId: string,
  round: string,
  table: string,
  result: string,
  remark?: string,
  by?: string,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("live_submit_result", {
    p_secret: secret,
    p_division_id: divisionId,
    p_round: round,
    p_table: table,
    p_result: result,
    // SQL text args accept NULL but codegen types them as string.
    p_remark: (remark ?? null) as unknown as string,
    p_by: by ?? "",
  });
  if (error) throw error;
}

/** Delete one round's pairings (and any submitted results in it) wholesale.
 *  The RPC accepts any live-writer secret, but the UI only offers this to admin. */
export async function deleteRound(
  secret: string,
  divisionId: string,
  round: string,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("live_delete_round", {
    p_secret: secret,
    p_division_id: divisionId,
    p_round: round,
  });
  if (error) throw error;
}

export async function setCheckin(
  secret: string,
  divisionId: string,
  round: string,
  table: string,
  checkin: string,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("live_set_checkin", {
    p_secret: secret,
    p_division_id: divisionId,
    p_round: round,
    p_table: table,
    p_checkin: checkin,
  });
  if (error) throw error;
}

/** Set (or clear, with empty text) the announcement banner on /live + /judge.
 *  Stored as {text, urgent} jsonb under live_config.announcement; the pages
 *  pick it up on their next 3s snapshot poll. */
export async function setAnnouncement(
  secret: string,
  text: string,
  urgent: boolean,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("live_set_config", {
    p_secret: secret,
    p_key: "announcement",
    p_value: { text, urgent },
  });
  if (error) throw error;
}

/** Admin-only: read the live_token to build the Judge link + configure the .jar. */
export async function getToken(adminSecret: string): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("live_get_token", { p_admin_secret: adminSecret });
  if (error) throw error;
  return (data as string) ?? null;
}

// ── Judge role (account_roles) ────────────────────────────────────────────────
/** Admin-only: grant/revoke the judge role + set a default รุ่น, by email. */
export async function setJudgeRole(
  adminSecret: string,
  email: string,
  isJudge: boolean,
  defaultDivisionId?: string | null,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("admin_set_judge", {
    p_admin_secret: adminSecret,
    p_email: email,
    p_is_judge: isJudge,
    p_default_division_id: (defaultDivisionId ?? null) as unknown as string,
  });
  if (error) throw error;
}

/** Admin-only: list current judges (email + Thai first name + default รุ่น). */
export async function listJudges(adminSecret: string): Promise<JudgeInfo[]> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("admin_list_judges", { p_admin_secret: adminSecret });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    accountId: r.account_id as string,
    email: r.email as string,
    firstNameTh: (r.first_name_th as string) ?? null,
    defaultDivisionId: (r.default_division_id as string) ?? null,
  }));
}

/** Judge-only: read the shared live_token (gated by holding the role, not a secret). */
export async function getJudgeToken(): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("judge_get_token");
  if (error) throw error;
  return data as string;
}

/** Whether the current logged-in user holds the judge role, + their default รุ่น. */
export async function getMyJudgeStatus(): Promise<{ isJudge: boolean; defaultDivisionId: string | null }> {
  const sb = getSupabase();
  const { data: userRes } = await sb.auth.getUser();
  const uid = userRes?.user?.id;
  if (!uid) return { isJudge: false, defaultDivisionId: null };
  // Filter on role — an account can hold several roles (e.g. admin + judge),
  // and without it maybeSingle() errors on the extra row (hiding the judge
  // button) while a lone admin row would count as judge.
  const { data, error } = await sb
    .from("account_roles")
    .select("default_division_id")
    .eq("account_id", uid)
    .eq("role", "judge")
    .maybeSingle();
  if (error || !data) return { isJudge: false, defaultDivisionId: null };
  return { isJudge: true, defaultDivisionId: (data.default_division_id as string) ?? null };
}
