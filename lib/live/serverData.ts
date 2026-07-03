// Server-side (Node) data assembly for the /live snapshot endpoint. Rebuilds
// the exact FULL_UPDATE payload shape v1's server.js used to push over SSE, but
// sourced from Supabase instead of Google Sheets — see parseMatches()/
// getAllData() in reference/tesuji-v1/server.js for the shape this mirrors.
// Consumed by app/live/snapshot/route.ts (polled by the browser) and the
// MacMahon-compatible REST routes in app/api/divisions/*.

import https from "node:https";
import { createClient } from "@supabase/supabase-js";
import { parseScheduleGroups } from "@/lib/schedule";
import { SCHEDULE_EVENT_LABEL, ScheduleEntry } from "@/lib/data/types";

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
  blackScore: string | null; // MacMahon score entering this round (may be "1½") — null if a
  whiteScore: string | null; // Force override changed who's actually playing this seat
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

export interface LiveScheduleEvent {
  id: string;
  label: string;
  start: string; // "HH:MM"
  end: string | null; // "HH:MM" or null when open-ended
  type: "match" | "break" | "ceremony";
}

export interface LiveScheduleGroup {
  name: string; // joined รุ่น names sharing this schedule
  events: LiveScheduleEvent[];
}

export interface FullUpdatePayload {
  type: "FULL_UPDATE";
  announcement: string;
  divisions: { id: string; name: string }[];
  divData: Record<string, DivData>;
  standings: Record<string, { headers: string[]; rows: string[][] }>;
  schedule: LiveScheduleGroup[];
  scheduleMap: Record<string, number>;
  tournamentDate: string;
}

// ── Schedule (กำหนดการ) sourced from the tournament's admin-entered schedule ──
// The live competition's divisions (e.g. "7-8 Kyu A") are free-text ids created
// by MacMahon .jar export/import, with no FK to the reg-app's `category` table —
// so a division is matched to its รุ่น's schedule by substring containment on
// normalized names (e.g. category "7-8 Kyu" matches division "7-8 Kyu A"; "9x9"
// matches "9-15 Kyu 9x9 B"). Unmatched divisions simply have no schedule entry.
function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

function toEvent(e: ScheduleEntry): LiveScheduleEvent {
  const m = e.time.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})/);
  const start = m ? m[1] : (e.time.match(/\d{1,2}:\d{2}/)?.[0] ?? "");
  const end = m ? m[2] : null;
  const type: LiveScheduleEvent["type"] =
    e.type === "lunch" ? "break" : e.type === "match" ? "match" : "ceremony";
  let label = SCHEDULE_EVENT_LABEL[e.type];
  if (e.boardNumber) label += ` (กระดานที่ ${e.boardNumber})`;
  if (e.note) label += ` — ${e.note}`;
  return { id: e.id, label, start, end, type };
}

async function buildLiveSchedule(
  divisions: { id: string; name: string }[],
): Promise<{ schedule: LiveScheduleGroup[]; scheduleMap: Record<string, number>; tournamentDate: string }> {
  const sb = getServerSupabase();
  const { data: tRows } = await sb
    .from("tournament")
    .select("id,competition_date,schedule_text,status,updated_at")
    .order("updated_at", { ascending: false });
  const tournament = (tRows ?? []).find((t) => t.status === "published") ?? tRows?.[0] ?? null;
  if (!tournament) return { schedule: [], scheduleMap: {}, tournamentDate: "" };

  const { data: catRows } = await sb
    .from("category")
    .select("id,name")
    .eq("tournament_id", tournament.id as string);
  const categoryNameById = new Map(
    (catRows ?? []).map((c) => [c.id as string, c.name as string]),
  );

  const groups = parseScheduleGroups(tournament.schedule_text as string | null);
  const schedule: LiveScheduleGroup[] = groups.map((g) => ({
    name: g.categoryIds.map((id) => categoryNameById.get(id)).filter(Boolean).join(" / "),
    events: g.entries.map(toEvent),
  }));
  const groupCategoryNames = groups.map((g) =>
    g.categoryIds.map((id) => categoryNameById.get(id)).filter((n): n is string => !!n),
  );

  const scheduleMap: Record<string, number> = {};
  for (const div of divisions) {
    const normDiv = normalizeName(div.name);
    const idx = groupCategoryNames.findIndex((names) =>
      names.some((n) => normDiv.includes(normalizeName(n))),
    );
    if (idx !== -1) scheduleMap[div.id] = idx;
  }

  return { schedule, scheduleMap, tournamentDate: (tournament.competition_date as string) ?? "" };
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
    black_score: string | null;
    white_score: string | null;
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

  // The score was exported for the SYSTEM-paired player (that's who the .jar
  // computed it for). Build (round → name → score) from the system columns so a
  // player Force-moved to another table still shows THEIR own score, looked up
  // by the name actually displayed. A Force to a non-player (BYE / "ไม่มีผู้เข้า
  // แข่งขัน") won't be in the map → no score, which is correct.
  const scoreByRoundName = new Map<string, string>();
  const rnKey = (round: string, name: string) => `${round} ${name}`;
  for (const r of rows) {
    const bs = r.black.trim();
    const ws = r.white.trim();
    if (bs && r.black_score != null) scoreByRoundName.set(rnKey(r.round, bs), r.black_score);
    if (ws && r.white_score != null) scoreByRoundName.set(rnKey(r.round, ws), r.white_score);
  }

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
    const isForced = fBlack !== "" || fWhite !== "";
    return {
      round: r.round,
      table: r.table_no,
      black,
      white,
      blackScore: scoreByRoundName.get(rnKey(r.round, black)) ?? null,
      whiteScore: scoreByRoundName.get(rnKey(r.round, white)) ?? null,
      isForced,
      result: r.result || "?-?",
      remark: r.remark || "",
      checkB: chk === "B" || chk === "BOTH",
      checkW: chk === "W" || chk === "BOTH",
      submittedBy: r.submitted_by || "",
    };
  });
  // Stable table ordering. The underlying SELECT has no ORDER BY, so Postgres can
  // hand back rows in a different order after an UPDATE (e.g. a Force Pairing or
  // result write) — which made the judge's table grid / lists visibly jump around
  // (v1 never saw this: its Google-Sheet rows had fixed positions). Sort by round
  // then table, numeric with a string fallback, so positions stay put.
  const numOr = (s: string, d: number) => {
    const n = parseFloat(s);
    return Number.isNaN(n) ? d : n;
  };
  allMatches.sort((a, b) => {
    const ra = numOr(a.round, Infinity), rb = numOr(b.round, Infinity);
    if (ra !== rb) return ra - rb;
    if (a.round !== b.round) return a.round.localeCompare(b.round);
    const ta = numOr(a.table, Infinity), tb = numOr(b.table, Infinity);
    if (ta !== tb) return ta - tb;
    return a.table.localeCompare(b.table);
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
        "division_id,round,table_no,black,white,black_force,white_force,black_score,white_score,result,remark,check_in,submitted_by",
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
      black_score: r.black_score as string | null,
      white_score: r.white_score as string | null,
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
  const { schedule, scheduleMap, tournamentDate } = await buildLiveSchedule(divisions);

  return {
    type: "FULL_UPDATE",
    announcement,
    divisions,
    divData,
    standings,
    schedule,
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
      "round,table_no,black,white,black_force,white_force,black_score,white_score,result,remark,check_in,submitted_by",
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
      black_score: r.black_score as string | null,
      white_score: r.white_score as string | null,
      result: r.result as string,
      remark: r.remark as string,
      check_in: r.check_in as string,
      submitted_by: r.submitted_by as string,
    })),
  );
}

export { getServerSupabase };
