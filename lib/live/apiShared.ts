// Shared helpers for the MacMahon-compatible REST API (app/api/divisions/*).
// These routes reproduce tesuji-v1's Express endpoints in JSON shape and auth
// so the MacMahon-TESUJI .jar (and the old v1 HTML clients) work unchanged.
// (The reference/tesuji-v1 tree those endpoints were copied from is NOT in this
// repository — the shapes below and in the route comments are the only record
// of the contract the .jar expects. Change them only against a real .jar.)
//
// Tournament scope (20260908_0001): the write token identifies ONE tournament.
// Every writer request resolves its token to that tournament first, and the
// :id path segment is then looked up inside it — as the internal division id
// or as the MacMahon code ('01'), which is only unique per tournament.

import { getServerSupabase } from "./serverData";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** v1 requireAuth: token from `x-admin-token` header or `?token=` query.
 *
 *  The query-string form is a leak path the header form does not have: Vercel
 *  records request URLs in its logs (and any proxy between will too), so the
 *  live write token ends up in a place many more people can read than can read
 *  a judge link. The judge console has always sent the header; the only caller
 *  that might still put it in the URL is the MacMahon .jar, whose
 *  launcher.properties we cannot inspect from here — and refusing its uploads
 *  on competition day is worse than the log exposure. So it stays accepted, and
 *  LIVE_REJECT_QUERY_TOKEN=1 turns it off in one deploy once that config has
 *  been switched to `x-admin-token`. */
export function extractToken(req: Request): string {
  const header = req.headers.get("x-admin-token");
  if (header) return header;
  if (process.env.LIVE_REJECT_QUERY_TOKEN === "1") return "";
  const url = new URL(req.url);
  return url.searchParams.get("token") ?? "";
}

/** JSON response matching v1's Express `res.json(...)` output. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// ── write rate limit ─────────────────────────────────────────────────────────
// The live token rides in every judge-console URL, so it is the most
// leak-prone secret in the system (browser history, shared links). A leaked
// token still shouldn't allow rewriting results at machine speed: cap writes
// per client.
//
// Two things this is NOT, so nothing downstream relies on them: the map is
// per-lambda, and Vercel runs as many of those as it likes, so the cap is
// per-instance rather than global; and the RPCs behind these routes are
// callable straight against PostgREST, where no limiter sits at all. Rotating
// the token in /admin/live is the actual answer to a leak — this is a speed
// bump, not a gate.
//
// The bucket key used to be x-forwarded-for + token. Every judge at a venue
// shares BOTH (one token per tournament, one NAT'd wifi), so the whole judging
// team shared a 30-writes-per-10s budget: round start is ~2 taps per table
// across 112 tables, which blew through it in seconds and turned check-ins into
// a cascade of failures for everyone at once. judge.js now sends a per-device
// id (x-judge-client, generated once and kept in localStorage), so each judge
// gets their own bucket; the .jar sends none and falls back to its IP.
const RATE_LIMIT_MAX = 120; // writes per window per client
const RATE_LIMIT_WINDOW_MS = 10_000;
const writeHits = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const hit = writeHits.get(key);
  if (!hit || now - hit.windowStart >= RATE_LIMIT_WINDOW_MS) {
    // New window; also a cheap moment to drop stale entries so the map
    // doesn't grow unboundedly across a long-running server.
    if (writeHits.size > 1000) {
      writeHits.forEach((v, k) => {
        if (now - v.windowStart >= RATE_LIMIT_WINDOW_MS) writeHits.delete(k);
      });
    }
    writeHits.set(key, { count: 1, windowStart: now });
    return false;
  }
  hit.count += 1;
  return hit.count > RATE_LIMIT_MAX;
}

// ── zero-row writes ──────────────────────────────────────────────────────────
// The live_* write RPCs used to UPDATE by (division, round, table) and return
// void whether or not a row matched, so a judge tapping a result while the
// MacMahon .jar re-uploaded that round (live_replace_round = delete + insert)
// got a green checkmark for a write that went nowhere. They now raise
// MATCH_NOT_FOUND; translate that into a 409 the judge console can act on.
export const MATCH_NOT_FOUND = "MATCH_NOT_FOUND";

/** True when a live_* RPC aborted because the target pairing row is gone. */
export function isMatchNotFound(err: { message?: string } | null | undefined): boolean {
  // `includes`, not `===`: PostgREST surfaces the raise text as error.message
  // (SQLSTATE P0001) and supabase-js may prefix it.
  return !!err?.message && err.message.includes(MATCH_NOT_FOUND);
}

/** 409 + machine code, so the judge UI can resync instead of retrying blindly. */
export function matchNotFoundResponse(msg: string): Response {
  return json({ success: false, code: MATCH_NOT_FOUND, error: msg }, 409);
}

// ── the pairing moved under the writer ───────────────────────────────────────
// MATCH_NOT_FOUND only fires when the (division, round, table) row is GONE.
// MacMahon reuses table numbers, so after a re-export table 5 usually still
// exists — holding two different players. live_submit_result (20260915_0005)
// therefore also compares the names the judge was looking at and raises this
// when they no longer match. Same 409 treatment, different code: the console
// must tell the judge their result was not recorded against that pair, rather
// than say "the table is gone" about a table that is right there.
export const MATCH_CHANGED = "MATCH_CHANGED";

/** True when a live_* RPC aborted because the seats at the target table changed. */
export function isMatchChanged(err: { message?: string } | null | undefined): boolean {
  return !!err?.message && err.message.includes(MATCH_CHANGED);
}

/** 409 + machine code for a write aimed at a pairing that has since changed. */
export function matchChangedResponse(msg: string): Response {
  return json({ success: false, code: MATCH_CHANGED, error: msg }, 409);
}

// ── error responses ──────────────────────────────────────────────────────────
/** 500 that logs the real cause and tells the caller nothing about the schema.
 *  A PostgREST failure's message is the Postgres one — function signatures,
 *  column names, "permission denied for function …" — and these endpoints are
 *  reachable anonymously, so echoing it hands out a map of the database. The
 *  only error the judge console acts on is the 409 code above. */
export function serverError(e: unknown, where: string): Response {
  console.error(`[live] ${where} failed:`, e instanceof Error ? e.message : e);
  return json({ success: false, error: "internal error" }, 500);
}

// ── request body validation ──────────────────────────────────────────────────
// Everything below is written by whoever holds the write token — a judge link
// that was forwarded once, or a .jar someone reconfigured — and is stored
// verbatim and then rendered on the public board by every viewer on every poll.
// A standings payload of `{headers:[1],rows:[[1]]}` is enough to make
// renderStandings throw for everyone who opens that division. Shape and length
// are checked here so the database never holds something the board cannot draw.
export const MAX_KEY_LEN = 16; // round / table numbers, as MacMahon writes them
export const MAX_NAME_LEN = 120; // player names, submitter names
export const MAX_REMARK_LEN = 200;
const MAX_STANDING_COLS = 40;
const MAX_STANDING_ROWS = 2000;

/** A required short identifier (round, table): non-empty, bounded, trimmed. */
export function shortKey(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.length <= MAX_KEY_LEN ? s : null;
}

/** An optional free-text field, trimmed to `max` — never a reason to reject. */
export function boundedText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** A standings grid as MacMahon exports it: a header row of strings and rows of
 *  strings, both bounded. Returns null when the payload is not that. */
export function parseStandings(
  headers: unknown,
  rows: unknown,
): { headers: string[]; rows: string[][] } | null {
  if (!Array.isArray(headers) || !Array.isArray(rows)) return null;
  if (headers.length === 0 || headers.length > MAX_STANDING_COLS) return null;
  if (rows.length > MAX_STANDING_ROWS) return null;
  if (!headers.every((h) => typeof h === "string" && h.length <= MAX_NAME_LEN)) return null;
  const out: string[][] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length > MAX_STANDING_COLS) return null;
    if (!row.every((c) => typeof c === "string" && c.length <= MAX_NAME_LEN)) return null;
    out.push(row as string[]);
  }
  return { headers: headers as string[], rows: out };
}

/** One round's pairings as the .jar posts them. Deliberately lenient about the
 *  contents of each entry — the SQL already coalesces a missing table/name to
 *  '' and an upload refused mid-tournament is a worse failure than a row with
 *  an empty seat. What it does enforce is that this is a bounded array of
 *  objects with bounded strings, so no upload can put something on the board
 *  that the board cannot draw. */
export function parseRoundMatches(
  v: unknown,
): { table: string; black: string; white: string; blackScore?: string; whiteScore?: string }[] | null {
  if (!Array.isArray(v) || v.length > MAX_STANDING_ROWS) return null;
  const out: { table: string; black: string; white: string; blackScore?: string; whiteScore?: string }[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const m = raw as Record<string, unknown>;
    const blackScore = boundedText(m.blackScore, MAX_KEY_LEN);
    const whiteScore = boundedText(m.whiteScore, MAX_KEY_LEN);
    out.push({
      table: boundedText(m.table, MAX_KEY_LEN) ?? "",
      black: boundedText(m.black, MAX_NAME_LEN) ?? "",
      white: boundedText(m.white, MAX_NAME_LEN) ?? "",
      ...(blackScore ? { blackScore } : {}),
      ...(whiteScore ? { whiteScore } : {}),
    });
  }
  return out;
}

/** 404 for a :id that is not a division of the caller's tournament. Deliberately
 *  the same answer whether the division exists elsewhere or nowhere. */
export function divisionNotFoundResponse(): Response {
  return json({ success: false, error: "division not found in this tournament" }, 404);
}

/** The tournament a write token belongs to, or null when it is not a live token. */
export async function tournamentForToken(token: string): Promise<string | null> {
  if (!token) return null;
  const sb = getServerSupabase();
  const { data, error } = await sb.rpc("live_token_tournament", { p_secret: token });
  return !error && typeof data === "string" && data ? data : null;
}

export interface WriterAuth {
  token: string;
  tournamentId: string;
}

/** Mirror of v1 requireAuth, per tournament: validate the write token up front
 *  and return the tournament it authorises — or the 401/429 response to send
 *  back. A token always exists per tournament, so writes are always gated;
 *  each event's .jar must be configured with that event's token. */
export async function requireWriter(req: Request): Promise<WriterAuth | Response> {
  const token = extractToken(req);
  // The device id is a bucket key, never a credential — the token is still the
  // only thing that authorises anything, so a forged/absent one costs its
  // sender nothing but its own bucket.
  const client =
    req.headers.get("x-judge-client")?.slice(0, 64) ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  if (isRateLimited(`${client}|${token}`)) {
    return json({ success: false, error: "Too Many Requests" }, 429);
  }
  const tournamentId = await tournamentForToken(token);
  if (!tournamentId) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  return { token, tournamentId };
}

/** Scope for the PUBLIC reads: an explicit ?t=<tournament id>, else the
 *  tournament of a token the caller happens to send (the .jar sends its token
 *  on GETs too), else null (unscoped — the :id must then be an internal id). */
export async function optionalTournamentScope(req: Request): Promise<string | null> {
  const t = new URL(req.url).searchParams.get("t");
  if (t && UUID_RE.test(t)) return t;
  const token = extractToken(req);
  return token ? tournamentForToken(token) : null;
}
