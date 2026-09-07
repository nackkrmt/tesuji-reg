// Supabase-backed client for the live competition domain. Reads hit the tables
// directly (public SELECT via RLS); writes go through the guarded RPCs, passing
// a secret: "" for a signed-in admin (the RPCs check auth.uid()), or the
// tournament's live token for judges / the MacMahon .jar. Since 20260908_0001
// a token belongs to ONE tournament and every write is authorised against the
// division's tournament, so nothing here can reach another event's board.

import { getSupabase } from "@/lib/data/supabaseClient";
import { parseAnnouncementValue } from "./types";
import type {
  JudgeAssignment,
  JudgeInfo,
  LiveAnnouncement,
  LiveDivision,
  LiveMatch,
  LiveStanding,
} from "./types";

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
/** Divisions of one tournament (pass nothing only where every board is meant,
 *  e.g. the /results hub deciding which tournaments own a board). */
export async function listDivisions(
  tournamentId?: string,
): Promise<LiveDivision[]> {
  const sb = getSupabase();
  let q = sb
    .from("live_division")
    .select("id,code,name,sort_order,tournament_id")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (tournamentId) q = q.eq("tournament_id", tournamentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id as string,
    code: (d.code as string) ?? (d.id as string),
    name: d.name as string,
    sortOrder: (d.sort_order as number) ?? 0,
    tournamentId: d.tournament_id as string,
  }));
}

const MATCH_COLUMNS =
  "id,division_id,round,table_no,black,white,black_force,white_force,result,remark,check_in,absent,submitted_by";

/** Matches of the given divisions (the caller already knows the tournament's
 *  division ids — useLive fetches them first, so nothing is read twice). */
export async function listMatchesByDivisions(divisionIds: readonly string[]): Promise<LiveMatch[]> {
  if (divisionIds.length === 0) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from("live_match")
    .select(MATCH_COLUMNS)
    .in("division_id", [...divisionIds]);
  if (error) throw error;
  return ((data ?? []) as MatchRow[]).map(mapMatch);
}

/** Matches of one tournament (optionally one of its divisions). */
export async function listMatches(tournamentId: string, divisionId?: string): Promise<LiveMatch[]> {
  const ids = (await listDivisions(tournamentId)).map((d) => d.id);
  const scope = divisionId ? ids.filter((id) => id === divisionId) : ids;
  return listMatchesByDivisions(scope);
}

export async function listStandingsByDivisions(divisionIds: readonly string[]): Promise<LiveStanding[]> {
  if (divisionIds.length === 0) return [];
  const sb = getSupabase();
  const { data, error } = await sb
    .from("live_standing")
    .select("division_id,headers,rows,updated_at")
    .in("division_id", [...divisionIds]);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    divisionId: s.division_id as string,
    headers: (s.headers as string[]) ?? [],
    rows: (s.rows as string[][]) ?? [],
    updatedAt: (s.updated_at as string) ?? null,
  }));
}

export async function listStandings(tournamentId: string): Promise<LiveStanding[]> {
  const ids = (await listDivisions(tournamentId)).map((d) => d.id);
  return listStandingsByDivisions(ids);
}

/** One tournament's announcement banner (live_config, public read). Null-safe:
 *  missing row = no announcement yet. */
export async function getAnnouncement(tournamentId: string): Promise<LiveAnnouncement> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("live_config")
    .select("value,updated_at")
    .eq("tournament_id", tournamentId)
    .eq("key", "announcement")
    .maybeSingle();
  if (error) throw error;
  const { text, urgent } = parseAnnouncementValue(data?.value);
  return { text, urgent, updatedAt: (data?.updated_at as string) ?? null };
}

// ── Realtime ────────────────────────────────────────────────────────────────
/** Subscribe to changes on one tournament's live tables. Returns an
 *  unsubscribe fn. live_match / live_standing carry no tournament column, so
 *  those events arrive for every tournament — the refetch they trigger is
 *  scoped, so the worst case is a spare reload, never foreign rows. */
export function subscribeLive(tournamentId: string, onChange: () => void): () => void {
  const sb = getSupabase();
  const channel = sb
    .channel(`live-competition:${tournamentId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "live_match" }, onChange)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "live_division",
        filter: `tournament_id=eq.${tournamentId}`,
      },
      onChange,
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "live_standing" }, onChange)
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}

// ── Writes (guarded RPCs) ─────────────────────────────────────────────────────
/** Validate a judge secret link / admin session against the server. */
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
 *  The RPC accepts the division's own tournament token or an admin session;
 *  the UI only offers this to admin. */
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

/** Set (or clear, with empty text) one tournament's announcement banner on its
 *  /live board + judge console. Stored as {text, urgent} jsonb under
 *  live_config (tournament_id, 'announcement'); picked up on the next 3s poll. */
export async function setAnnouncement(
  secret: string,
  tournamentId: string,
  text: string,
  urgent: boolean,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("live_set_config", {
    p_secret: secret,
    p_tournament_id: tournamentId,
    p_key: "announcement",
    p_value: { text, urgent },
  });
  if (error) throw error;
}

/** Admin-only: one tournament's live token — builds its Judge link and the
 *  value for that event's launcher.properties. Minted on first read. */
export async function getToken(adminSecret: string, tournamentId: string): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("live_get_token", {
    p_admin_secret: adminSecret,
    p_tournament_id: tournamentId,
  });
  if (error) throw error;
  return (data as string) ?? null;
}

/** Admin-only: replace one tournament's token. Every judge link and MacMahon
 *  config issued for that tournament stops working; other tournaments are
 *  untouched. */
export async function rotateToken(adminSecret: string, tournamentId: string): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("live_rotate_token", {
    p_admin_secret: adminSecret,
    p_tournament_id: tournamentId,
  });
  if (error) throw error;
  return data as string;
}

// ── Judges (tournament_judge) ─────────────────────────────────────────────────
/** Admin-only: add/remove a judge of ONE tournament + set their default รุ่น,
 *  by email. The account must already exist. */
export async function setJudgeRole(
  adminSecret: string,
  tournamentId: string,
  email: string,
  isJudge: boolean,
  defaultDivisionId?: string | null,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("admin_set_judge", {
    p_admin_secret: adminSecret,
    p_tournament_id: tournamentId,
    p_email: email,
    p_is_judge: isJudge,
    p_default_division_id: (defaultDivisionId ?? null) as unknown as string,
  });
  if (error) throw error;
}

/** Admin-only: the judges of one tournament (email + Thai first name + default รุ่น). */
export async function listJudges(adminSecret: string, tournamentId: string): Promise<JudgeInfo[]> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("admin_list_judges", {
    p_admin_secret: adminSecret,
    p_tournament_id: tournamentId,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    accountId: r.account_id as string,
    email: r.email as string,
    firstNameTh: (r.first_name_th as string) ?? null,
    defaultDivisionId: (r.default_division_id as string) ?? null,
  }));
}

/** Judge-only: the token for a tournament the signed-in user is assigned to. */
export async function getJudgeToken(tournamentId: string): Promise<string> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("judge_get_token", { p_tournament_id: tournamentId });
  if (error) throw error;
  return data as string;
}

/** Every tournament the signed-in user judges (empty when signed out or not a
 *  judge anywhere), newest event first — one console link per tournament. */
export async function myJudgeAssignments(): Promise<JudgeAssignment[]> {
  const sb = getSupabase();
  const { data: userRes } = await sb.auth.getUser();
  if (!userRes?.user?.id) return [];
  const { data, error } = await sb.rpc("judge_my_assignments");
  if (error) throw error;
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return rows.map((r) => ({
    tournamentId: r.tournamentId as string,
    tournamentName: (r.tournamentName as string) ?? "",
    competitionDate: (r.competitionDate as string) ?? "",
    status: (r.status as string) ?? "",
    token: r.token as string,
    defaultDivisionId: (r.defaultDivisionId as string | null) ?? null,
  }));
}
