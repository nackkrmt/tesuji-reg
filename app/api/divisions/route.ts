// GET  /api/divisions          → { success, divisions: [{id,name,…}] }   (public)
// POST /api/divisions {id,name} → { success, id }                        (writer)
// v1 parity: reference/tesuji-v1/server.js. Called by MacMahon .jar
// (getDivisions / ensureDivision) and the v1 admin.js import flow.
//
// Tournament scope (20260908_0001): the write token belongs to ONE tournament,
// so a POSTed division is created under that tournament — no more guessing
// "the newest published one" (which, with two events published at once, was
// whichever row an admin had edited last). The .jar's `id` is the MacMahon
// code ('01'); the row's internal id comes back as `id` in the response.

import { getServerSupabase, listDivisionsMeta } from "@/lib/live/serverData";
import { json, optionalTournamentScope, requireWriter } from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const scope = await optionalTournamentScope(req);
    const rows = await listDivisionsMeta(scope ?? undefined);
    // Scoped (the .jar, with its token or ?t=): v1 shape, `id` = the code the
    // caller already uses for its filenames, so "does my division exist yet?"
    // still compares equal. Unscoped: every board; codes repeat across
    // tournaments, so `id` is the internal one and the code rides alongside.
    const divisions = scope
      ? rows.map((d) => ({ id: d.code, internalId: d.id, name: d.name, tournamentId: d.tournamentId }))
      : rows.map((d) => ({ id: d.id, code: d.code, name: d.name, tournamentId: d.tournamentId }));
    return json({ success: true, divisions });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}

export async function POST(req: Request) {
  const auth = await requireWriter(req);
  if (auth instanceof Response) return auth;
  try {
    const { id, name } = (await req.json()) as { id?: string; name?: string };
    if (!id || !name) {
      return json({ success: false, error: "id and name required" }, 400);
    }
    const sb = getServerSupabase();
    // The RPC derives the tournament from the token itself; p_tournament_id is
    // only for admin sessions (no token), so it stays null here.
    const { data, error } = await sb.rpc("live_upsert_division", {
      p_secret: auth.token,
      p_id: id,
      p_name: name,
      p_sort: 0,
      p_tournament_id: null,
    });
    if (error) throw error;
    return json({ success: true, id: data, tournamentId: auth.tournamentId });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}
