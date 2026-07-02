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

/** Mirror of v1 requireAuth: validate the write token up-front (returns a 401
 *  response to send back, or null when authorized). Unlike v1 (where an unset
 *  ADMIN_TOKEN disabled auth), a live_token always exists here, so writes are
 *  always gated — the .jar must be configured with it. */
export async function requireWriter(req: Request): Promise<Response | null> {
  const token = extractToken(req);
  const sb = getServerSupabase();
  const { data, error } = await sb.rpc("live_check_token", { p_secret: token });
  if (error || data !== true) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  return null;
}
