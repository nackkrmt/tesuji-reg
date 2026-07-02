// Supabase-backed client for the live competition domain. Reads hit the tables
// directly (public SELECT via RLS); writes go through the guarded RPCs, passing
// a secret (admin passphrase for admin, or the live_token for judges / the .jar).

import { getSupabase } from "@/lib/data/supabaseClient";
import type { LiveDivision, LiveMatch, LiveStanding } from "./types";

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
      "id,division_id,round,table_no,black,white,black_force,white_force,result,remark,check_in,submitted_by",
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
    .select("division_id,headers,rows");
  if (error) throw error;
  return (data ?? []).map((s) => ({
    divisionId: s.division_id as string,
    headers: (s.headers as string[]) ?? [],
    rows: (s.rows as string[][]) ?? [],
  }));
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
    p_remark: remark ?? null,
    p_by: by ?? "",
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

/** Admin-only: wipe ALL live competition data (reusable across events). */
export async function clearAll(adminSecret: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.rpc("live_clear_all", { p_admin_secret: adminSecret });
  if (error) throw error;
}

/** Admin-only: read the live_token to build the Judge link + configure the .jar. */
export async function getToken(adminSecret: string): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("live_get_token", { p_admin_secret: adminSecret });
  if (error) throw error;
  return (data as string) ?? null;
}
