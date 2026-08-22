// GET  /api/divisions          → { success, divisions: [{id,name}] }   (public)
// POST /api/divisions {id,name} → { success }                          (writer)
// v1 parity: reference/tesuji-v1/server.js. Called by MacMahon .jar
// (getDivisions / ensureDivision) and the v1 admin.js import flow.

import { getServerSupabase, listDivisionsMeta } from "@/lib/live/serverData";
import { extractToken, json, requireWriter } from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json({ success: true, divisions: await listDivisionsMeta() });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}

export async function POST(req: Request) {
  const unauth = await requireWriter(req);
  if (unauth) return unauth;
  try {
    const { id, name } = (await req.json()) as { id?: string; name?: string };
    if (!id || !name) {
      return json({ success: false, error: "id and name required" }, 400);
    }
    const sb = getServerSupabase();
    // Best-guess tournament for a NEW division: the newest published one (the
    // .jar's API is fixed and can't say). Admins can reassign in /admin/live;
    // for an existing division the RPC keeps its current assignment (coalesce).
    const { data: tRows } = await sb
      .from("tournament")
      .select("id")
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(1);
    const { error } = await sb.rpc("live_upsert_division", {
      p_secret: extractToken(req),
      p_id: id,
      p_name: name,
      p_sort: 0,
      p_tournament_id: (tRows?.[0]?.id as string | undefined) ?? null,
    });
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}
