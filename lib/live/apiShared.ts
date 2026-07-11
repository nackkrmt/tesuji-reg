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
