// Shared helpers for the MacMahon-compatible REST API (app/api/divisions/*).
// These routes reproduce tesuji-v1's Express endpoints in JSON shape and auth
// so the MacMahon-TESUJI .jar (and the old v1 HTML clients) work unchanged —
// see reference/tesuji-v1/server.js and TesujiClient.java.
//
// Tournament scope (20260908_0001): the write token identifies ONE tournament.
// Every writer request resolves its token to that tournament first, and the
// :id path segment is then looked up inside it — as the internal division id
// or as the MacMahon code ('01'), which is only unique per tournament.

import { getServerSupabase } from "./serverData";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** v1 requireAuth: token from `x-admin-token` header or `?token=` query. */
export function extractToken(req: Request): string {
  const header = req.headers.get("x-admin-token");
  if (header) return header;
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
// per client. In-memory is per-server-instance — fine for the single-instance
// deployments this venue tool runs on, and judges tapping results stay far
// below the cap.
const RATE_LIMIT_MAX = 30; // writes per window per client
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
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(`${ip}|${token}`)) {
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
