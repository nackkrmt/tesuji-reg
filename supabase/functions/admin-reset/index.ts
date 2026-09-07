// admin-reset — the checklist reset behind the admin Danger Zone (/admin/reset).
// The admin ticks which data groups to wipe; this function runs the wipe:
//   • db rows       → public.admin_selective_reset(p_keep_uid, p_confirm, p_targets, p_tournament_id)
//   • slip files    → empty the tesuji-slips bucket   (when 'registrations' ticked)
//   • banner/rules  → empty tesuji banners/ + rules/  (when 'tournament' ticked)
//
// Gated by the caller's Supabase Auth JWT (sent automatically by
// functions.invoke) — the caller must hold the admin role. The kept account is
// the caller's OWN uid, so an admin can never wipe themselves out and get locked
// out. Mirrors verify-slip / sync-go-database for the auth + service-role setup.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SLIP_BUCKET = "tesuji-slips";
const PUBLIC_BUCKET = "tesuji";
const CONFIRM_PHRASE = "ล้างข้อมูล";
const KNOWN_TARGETS = [
  "registrations",
  "promo_codes",
  "accounts",
  "institutes",
  "player_db",
  "live",
  "categories",
  "tournament",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function pgGet(query: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  if (!res.ok) throw new Error(`db read failed (${res.status})`);
  return await res.json();
}

// ── caller identity (Supabase Auth JWT) ──────────────────────────────────────
/** Resolve the caller's user id from their bearer token, or null if unauthenticated. */
async function getCallerUid(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!/^bearer /i.test(auth)) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: auth },
    });
    if (!res.ok) return null;
    const u = (await res.json()) as { id?: string };
    return typeof u.id === "string" ? u.id : null;
  } catch {
    return null;
  }
}

/** True when the given account holds the admin role. */
async function isUidAdmin(uid: string): Promise<boolean> {
  const rows = await pgGet(
    `account_roles?account_id=eq.${encodeURIComponent(uid)}&role=eq.admin&select=account_id`,
  );
  return rows.length > 0;
}

// ── storage: empty a bucket prefix via the Storage API ───────────────────────
/** List + delete every object under `prefix` in `bucket`. Returns the count
 *  removed. Loops (list → delete) until the prefix lists empty so it handles
 *  any object count. NOTE: list returns prefix-RELATIVE names — the delete
 *  payload must prepend the prefix back. */
async function emptyBucketPrefix(bucket: string, prefix: string): Promise<number> {
  let removed = 0;
  for (let guard = 0; guard < 100; guard++) {
    const listRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/list/${bucket}`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prefix,
          limit: 1000,
          offset: 0,
          sortBy: { column: "name", order: "asc" },
        }),
      },
    );
    if (!listRes.ok) throw new Error(`storage list failed (${listRes.status})`);
    const items = (await listRes.json()) as Array<{ name: string; id: string | null }>;
    // Real objects only (a null id row is a pseudo-folder).
    const names = items
      .filter((i) => i.id !== null && i.name && !i.name.endsWith("/"))
      .map((i) => prefix + i.name);
    if (names.length === 0) break;

    const delRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: names }),
    });
    if (!delRes.ok) throw new Error(`storage delete failed (${delRes.status})`);
    removed += names.length;
  }
  return removed;
}

/** Delete an explicit list of object paths from `bucket` (batched). */
async function deleteObjects(bucket: string, names: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < names.length; i += 500) {
    const chunk = names.slice(i, i + 500);
    const delRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: chunk }),
    });
    if (!delRes.ok) throw new Error(`storage delete failed (${delRes.status})`);
    removed += chunk.length;
  }
  return removed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "BAD_REQUEST" });
  }
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  const targets = Array.isArray(body.targets)
    ? (body.targets as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  if (targets.length === 0 || targets.some((t) => !KNOWN_TARGETS.includes(t))) {
    return json({ ok: false, error: "INVALID_TARGETS" });
  }
  // Multi-tournament scope: when present, registrations/promo_codes/
  // categories/tournament wipe that tournament only (global groups stay
  // global). Absent/null = the original whole-database wipe.
  const tournamentId =
    typeof body.tournament_id === "string" && body.tournament_id.length > 0
      ? body.tournament_id
      : null;
  if (
    tournamentId !== null &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tournamentId)
  ) {
    return json({ ok: false, error: "BAD_TOURNAMENT_ID" });
  }

  // gate: caller must be a signed-in admin (JWT sent by functions.invoke).
  const uid = await getCallerUid(req);
  if (!uid) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  if (!(await isUidAdmin(uid))) return json({ ok: false, error: "UNAUTHORIZED" }, 403);

  if (confirm.trim() !== CONFIRM_PHRASE) {
    return json({ ok: false, error: "CONFIRM_MISMATCH" });
  }

  // Scoped runs can't empty the whole slip bucket — collect this
  // tournament's slip paths BEFORE the rows are deleted.
  let scopedSlipPaths: string[] | null = null;
  if (targets.includes("registrations") && tournamentId !== null) {
    try {
      const tid = encodeURIComponent(tournamentId);
      const paths = new Set<string>();
      for (const row of await pgGet(
        `registration_batch?tournament_id=eq.${tid}&payment_slip_url=not.is.null&select=payment_slip_url`,
      )) {
        if (typeof row.payment_slip_url === "string") paths.add(row.payment_slip_url);
      }
      for (const row of await pgGet(
        `seat_withdrawal?tournament_id=eq.${tid}&refund_slip_url=not.is.null&select=refund_slip_url`,
      )) {
        if (typeof row.refund_slip_url === "string") paths.add(row.refund_slip_url);
      }
      for (const row of await pgGet(
        `seat_division_change?tournament_id=eq.${tid}&select=payment_slip_url,refund_slip_url`,
      )) {
        if (typeof row.payment_slip_url === "string") paths.add(row.payment_slip_url);
        if (typeof row.refund_slip_url === "string") paths.add(row.refund_slip_url);
      }
      scopedSlipPaths = [...paths];
    } catch (e) {
      return json({ ok: false, error: `SLIP_SCAN_FAILED: ${(e as Error).message}` });
    }
  }

  // Same for the tournament's own banner / venue-map / rules images in the
  // public bucket (their storage paths only live on the row being deleted).
  let scopedAssetPaths: string[] | null = null;
  if (targets.includes("tournament") && tournamentId !== null) {
    try {
      const rows = await pgGet(
        `tournament?id=eq.${encodeURIComponent(tournamentId)}&select=banner_url,venue_map_url,rules_text`,
      );
      const paths = new Set<string>();
      const marker = "/storage/v1/object/public/" + PUBLIC_BUCKET + "/";
      const collect = (v: unknown) => {
        if (typeof v !== "string") return;
        for (const m of v.matchAll(
          new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^\"'\\s)]+)", "g"),
        )) {
          paths.add(decodeURIComponent(m[1]));
        }
      };
      for (const row of rows) {
        collect(row.banner_url);
        collect(row.venue_map_url);
        collect(row.rules_text);
      }
      scopedAssetPaths = [...paths];
    } catch (e) {
      return json({ ok: false, error: `ASSET_SCAN_FAILED: ${(e as Error).message}` });
    }
  }

  // 1) wipe the selected db groups (keeps app_config + THIS admin's account)
  let counts: Record<string, unknown> = {};
  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_selective_reset`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_keep_uid: uid,
        p_confirm: confirm,
        p_targets: targets,
        p_tournament_id: tournamentId,
      }),
    });
    if (!rpcRes.ok) {
      const detail = await rpcRes.text();
      return json({ ok: false, error: `DB_RESET_FAILED: ${detail}` });
    }
    counts = (await rpcRes.json()) as Record<string, unknown>;
  } catch (e) {
    return json({ ok: false, error: `DB_RESET_FAILED: ${(e as Error).message}` });
  }

  // 2) purge storage. Best-effort: the DB is already clean, so a failure here
  //    only leaves orphaned unreferenced files — report it rather than failing
  //    the whole reset (the admin can rerun the same group to retry).
  let slipsDeleted = 0;
  let slipError: string | null = null;
  if (targets.includes("registrations")) {
    try {
      if (scopedSlipPaths !== null) {
        slipsDeleted = await deleteObjects(SLIP_BUCKET, scopedSlipPaths);
      } else {
        slipsDeleted = await emptyBucketPrefix(SLIP_BUCKET, "");
      }
    } catch (e) {
      slipError = (e as Error).message;
    }
  }
  let assetsDeleted = 0;
  let assetError: string | null = null;
  if (targets.includes("tournament")) {
    try {
      if (scopedAssetPaths !== null) {
        assetsDeleted = await deleteObjects(PUBLIC_BUCKET, scopedAssetPaths);
      } else {
        assetsDeleted += await emptyBucketPrefix(PUBLIC_BUCKET, "banners/");
        assetsDeleted += await emptyBucketPrefix(PUBLIC_BUCKET, "rules/");
      }
    } catch (e) {
      assetError = (e as Error).message;
    }
  }

  return json({
    ok: true,
    result: {
      counts,
      slips_deleted: slipsDeleted,
      slip_error: slipError,
      assets_deleted: assetsDeleted,
      asset_error: assetError,
    },
  });
});
