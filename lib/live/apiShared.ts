// Shared helpers for the MacMahon-compatible REST API (app/api/divisions/*).
// These routes reproduce tesuji-v1's Express endpoints verbatim in JSON shape
// and auth so the MacMahon-TESUJI .jar (and the old v1 HTML clients) work
// unchanged — see reference/tesuji-v1/server.js and TesujiClient.java.

import { getServerSupabase } from "./serverData";

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

/** Mirror of v1 requireAuth: validate the write token up-front (returns a 401
 *  response to send back, or null when authorized). Unlike v1 (where an unset
 *  ADMIN_TOKEN disabled auth), a live_token always exists here, so writes are
 *  always gated — the .jar must be configured with it. */
export async function requireWriter(req: Request): Promise<Response | null> {
  const token = extractToken(req);
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(`${ip}|${token}`)) {
    return json({ success: false, error: "Too Many Requests" }, 429);
  }
  const sb = getServerSupabase();
  const { data, error } = await sb.rpc("live_check_token", { p_secret: token });
  if (error || data !== true) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  return null;
}
