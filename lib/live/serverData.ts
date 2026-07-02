// Server-side (Node) data assembly for the /live snapshot endpoint. Rebuilds
// the exact FULL_UPDATE payload shape v1's server.js used to push over SSE, but
// sourced from Supabase instead of Google Sheets — see parseMatches()/
// getAllData() in reference/tesuji-v1/server.js for the shape this mirrors.
// Consumed by app/live/snapshot/route.ts (polled by the browser) and the
// MacMahon-compatible REST routes in app/api/divisions/*.

import https from "node:https";
import { createClient } from "@supabase/supabase-js";

// Next.js patches the global `fetch` with request memoization. It bit hard in
// the original held-open SSE design (a setInterval inside a ReadableStream kept
// returning the FIRST fetch's result forever, despite real DB writes — and
// neither `cache: "no-store"` nor `next: { revalidate: 0 }` escaped it, since
// those control HTTP caching, not the separate memoization layer). We've since
// moved to per-request polling, but the reliable fix is kept: bypass `fetch`
// entirely via node:https (which Next.js does not patch) so every read is
// guaranteed fresh regardless of route type. Works on Vercel's Node runtime.
function rawFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: init?.method || "GET", headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        const resHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === "string") resHeaders[k] = v;
        }
        const status = res.statusCode || 200;
        // The Response constructor forbids a body for these statuses — PostgREST
        // returns 204 on writes (RPCs / mutations), so pass null there.
        const nullBody = status === 204 || status === 205 || status === 304;
        resolve(new Response(nullBody ? null : body, { status, headers: resHeaders }));
      });
    });
    req.on("error", reject);
    if (init?.body) req.write(init.body as string);
    req.end();
  });
}

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }
  // NOTE: no `auth: { persistSession: false }` override here — that option
  // silently breaks the Realtime postgres_changes auth handshake (confirmed by
  // testing in isolation: subscribe() reports SUBSCRIBED either way, but change
  // events never arrive with persistSession:false). Defaults work fine in Node
  // (falls back to an in-memory store when `window` is undefined) and this
  // client is anon-only / never logs a user in, so there's no session to leak.
  return createClient(url, key, { global: { fetch: rawFetch } });
}

interface MatchRow {
  round: string;
  table: string;
  black: string;
  white: string;
  result: string;
  remark: string;
  checkB: boolean;
  checkW: boolean;
  submittedBy: string;
  isForced: boolean;
}

interface DivData {
  matches: MatchRow[];
  allMatches: MatchRow[];
  rounds: string[];
  currentRound: string | null;
  allNames: string[];
}

export interface FullUpdatePayload {
  type: "FULL_UPDATE";
  announcement: string;
  divisions: { id: string; name: string }[];
  divData: Record<string, DivData>;
  standings: Record<string, { headers: string[]; rows: string[][] }>;
  scheduleMap: Record<string, number>;
  tournamentDate: string;
}

// Mirrors v1 server.js parseMatches(): sort rounds numerically-descending
// (current round = highest), pick black/white via Force-column override,
// collect allNames from base + forced columns (excluding empty / 'BYE').
function parseMatches(
  rows: {
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
  }[],
): DivData {
  if (rows.length === 0) {
    return { matches: [], allMatches: [], rounds: [], currentRound: null, allNames: [] };
  }
  const allRounds = [...new Set(rows.map((r) => r.round))];
  allRounds.sort((a, b) => {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    return Number.isNaN(na) || Number.isNaN(nb) ? b.localeCompare(a) : nb - na;
  });
  const currentRound = allRounds[0] ?? null;

  const allNames = new Set<string>();
  const allMatches: MatchRow[] = rows.map((r) => {
    const blackSys = r.black.trim();
    const whiteSys = r.white.trim();
    const fBlack = r.black_force.trim();
    const fWhite = r.white_force.trim();
    const black = fBlack !== "" ? fBlack : blackSys;
    const white = fWhite !== "" ? fWhite : whiteSys;
    [blackSys, whiteSys, fBlack, fWhite].forEach((n) => {
      if (n && n !== "BYE") allNames.add(n);
    });
    const chk = r.check_in;
    return {
      round: r.round,
      table: r.table_no,
      black,
      white,
      isForced: fBlack !== "" || fWhite !== "",
      result: r.result || "?-?",
      remark: r.remark || "",
      checkB: chk === "B" || chk === "BOTH",
      checkW: chk === "W" || chk === "BOTH",
      submittedBy: r.submitted_by || "",
    };
  });
  const matches = allMatches.filter((m) => m.round === currentRound?.toString());
  return { matches, allMatches, rounds: allRounds, currentRound, allNames: [...allNames].sort() };
}

/** Assemble the full v1-shaped payload from current Supabase state. */
export async function buildFullUpdate(): Promise<FullUpdatePayload> {
  const sb = getServerSupabase();
  const [divRes, matchRes, standingRes, configRes] = await Promise.all([
    sb.from("live_division").select("id,name").order("sort_order").order("id"),
    sb
      .from("live_match")
      .select(
        "division_id,round,table_no,black,white,black_force,white_force,result,remark,check_in,submitted_by",
      ),
    sb.from("live_standing").select("division_id,headers,rows"),
    sb.from("live_config").select("key,value"),
  ]);

  const divisions = (divRes.data ?? []).map((d) => ({ id: d.id as string, name: d.name as string }));

  const matchesByDiv = new Map<string, Parameters<typeof parseMatches>[0]>();
  for (const r of matchRes.data ?? []) {
    const divId = r.division_id as string;
    if (!matchesByDiv.has(divId)) matchesByDiv.set(divId, []);
    matchesByDiv.get(divId)!.push({
      round: r.round as string,
      table_no: r.table_no as string,
      black: r.black as string,
      white: r.white as string,
      black_force: r.black_force as string,
      white_force: r.white_force as string,
      result: r.result as string,
      remark: r.remark as string,
      check_in: r.check_in as string,
      submitted_by: r.submitted_by as string,
    });
  }
  const divData: Record<string, DivData> = {};
  for (const d of divisions) {
    divData[d.id] = parseMatches(matchesByDiv.get(d.id) ?? []);
  }

  const standings: FullUpdatePayload["standings"] = {};
  for (const s of standingRes.data ?? []) {
    standings[s.division_id as string] = {
      headers: (s.headers as string[]) ?? [],
      rows: (s.rows as string[][]) ?? [],
    };
  }

  const config = new Map((configRes.data ?? []).map((c) => [c.key as string, c.value]));
  const announcement = (config.get("announcement") as string) || "";
  const scheduleMap = (config.get("schedule_map") as Record<string, number>) || {};
  const tournamentDate = (config.get("tournament_date") as string) || "";

  return {
    type: "FULL_UPDATE",
    announcement,
    divisions,
    divData,
    standings,
    scheduleMap,
    tournamentDate,
  };
}

// ── Focused reads for the MacMahon-compatible REST API (app/api/divisions/*) ──
// The .jar polls per-division/per-round frequently, so these avoid rebuilding
// all divisions like buildFullUpdate() does.

/** GET /api/divisions payload: [{ id, name }] ordered as v1 did. */
export async function listDivisionsMeta(): Promise<{ id: string; name: string }[]> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from("live_division")
    .select("id,name")
    .order("sort_order")
    .order("id");
  if (error) throw error;
  return (data ?? []).map((d) => ({ id: d.id as string, name: d.name as string }));
}

/** One division's parsed match data (matches/allMatches/rounds/currentRound/allNames). */
export async function getDivisionMatchData(divisionId: string): Promise<DivData> {
  const sb = getServerSupabase();
  const { data, error } = await sb
    .from("live_match")
    .select(
      "round,table_no,black,white,black_force,white_force,result,remark,check_in,submitted_by",
    )
    .eq("division_id", divisionId);
  if (error) throw error;
  return parseMatches(
    (data ?? []).map((r) => ({
      round: r.round as string,
      table_no: r.table_no as string,
      black: r.black as string,
      white: r.white as string,
      black_force: r.black_force as string,
      white_force: r.white_force as string,
      result: r.result as string,
      remark: r.remark as string,
      check_in: r.check_in as string,
      submitted_by: r.submitted_by as string,
    })),
  );
}

export { getServerSupabase };
