import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * Is the database this build is pointed at actually ready for this code?
 *
 * The release runbook used to smoke-test by curling /live/snapshot and looking
 * for a 200 — which proves nothing: buildFullUpdate coerces a failed query to
 * an empty array, so a schema-mismatched deploy answers 200 with an empty board
 * that reads as "the event hasn't started". These probes answer the question
 * directly, and 503 means "do not merge yet".
 *
 * Every probe is side-effect-free. The RPC checks call admin-gated functions
 * with deliberately invalid credentials: the auth check runs before any write,
 * so an existing function answers UNAUTHORIZED (or a permission error) while a
 * missing one answers PostgREST's PGRST202. Both are proof; neither writes.
 */

type Check = { name: string; ok: boolean; detail: string };

const MISSING_FN = "PGRST202"; // PostgREST: function not found in schema cache
const MISSING_COL = "42703"; // Postgres: undefined_column

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const sb = client();
  if (!sb) {
    return NextResponse.json(
      {
        ok: false,
        checks: [
          {
            name: "env",
            ok: false,
            detail: "NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY are not set in this build",
          },
        ],
      },
      { status: 503 },
    );
  }

  const checks: Check[] = [];

  // Connectivity, and the one table every page reads.
  const conn = await sb.from("tournament").select("id").limit(1);
  checks.push({
    name: "database",
    ok: !conn.error,
    detail: conn.error ? conn.error.message : "reachable",
  });

  // Migration 20260908_0001 — per-tournament live isolation. Without `code`
  // the .jar's uploads 404 and /live/[tid] renders an empty board.
  const col = await sb.from("live_division").select("code,tournament_id").limit(1);
  checks.push({
    name: "live_division.code",
    ok: !col.error,
    detail: col.error
      ? col.error.code === MISSING_COL
        ? "missing — apply 20260908_0001_live_tournament_isolation"
        : col.error.message
      : "present",
  });

  // Same migration — the per-tournament token lookup every API write and the
  // judge console go through. Returns null for a junk secret, never errors.
  const tok = await sb.rpc("live_token_tournament", { p_secret: "" });
  checks.push({
    name: "live_token_tournament()",
    ok: tok.error?.code !== MISSING_FN,
    detail:
      tok.error?.code === MISSING_FN
        ? "missing — apply 20260908_0001_live_tournament_isolation"
        : "present",
  });

  // Migration 20260822_0003 — /admin/rules cannot save without it.
  const rules = await sb.rpc("update_tournament_rules", {
    p_admin_secret: "",
    p_id: "00000000-0000-0000-0000-000000000000",
    p_rules_text: null,
  });
  checks.push({
    name: "update_tournament_rules()",
    ok: rules.error?.code !== MISSING_FN,
    detail:
      rules.error?.code === MISSING_FN
        ? "missing — apply 20260822_0003_update_tournament_rules"
        : "present",
  });

  // The 5-arg live_upsert_division the MacMahon .jar posts to (20260822_0004,
  // re-defined by 20260908_0001 to derive the tournament from the token).
  const div = await sb.rpc("live_upsert_division", {
    p_secret: "",
    p_id: "",
    p_name: "",
    p_sort: 0,
    p_tournament_id: null,
  });
  checks.push({
    name: "live_upsert_division(5-arg)",
    ok: div.error?.code !== MISSING_FN,
    detail:
      div.error?.code === MISSING_FN
        ? "missing — apply 20260822_0004_live_tournament_scope"
        : "present",
  });

  // Migration 20260822_0001 — the scoped Danger-Zone reset. service_role-only,
  // so anon gets a permission error when it exists; that still proves the
  // 4-arg overload is there. It does NOT prove the admin-reset edge function
  // was redeployed — check that separately, or a "this tournament only" reset
  // still wipes everything.
  const reset = await sb.rpc("admin_selective_reset", {
    p_keep_uid: "00000000-0000-0000-0000-000000000000",
    p_confirm: "",
    p_targets: [],
    p_tournament_id: null,
  });
  checks.push({
    name: "admin_selective_reset(4-arg)",
    ok: reset.error?.code !== MISSING_FN,
    detail:
      reset.error?.code === MISSING_FN
        ? "missing — apply 20260822_0001_admin_selective_reset_scoped"
        : "present (edge function version not checked here)",
  });

  const ok = checks.every((c) => c.ok);
  return NextResponse.json(
    { ok, checks, checkedAt: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
