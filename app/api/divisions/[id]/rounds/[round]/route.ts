// DELETE /api/divisions/:id/rounds/:round → { success, deleted }
// v1 parity: reference/tesuji-v1/server.js. Called by the MacMahon .jar
// (deleteRound) before re-uploading a round's pairings. :id is resolved inside
// the token's tournament (internal id or MacMahon code).

import { getServerSupabase, resolveDivisionId } from "@/lib/live/serverData";
import { divisionNotFoundResponse, json, requireWriter } from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string; round: string } },
) {
  const auth = await requireWriter(req);
  if (auth instanceof Response) return auth;
  try {
    const divisionId = await resolveDivisionId(auth.tournamentId, params.id);
    if (!divisionId) return divisionNotFoundResponse();
    const sb = getServerSupabase();
    // Count first so we can echo `deleted` like v1 did (public SELECT via RLS).
    const { count } = await sb
      .from("live_match")
      .select("id", { count: "exact", head: true })
      .eq("division_id", divisionId)
      .eq("round", params.round);

    const { error } = await sb.rpc("live_delete_round", {
      p_secret: auth.token,
      p_division_id: divisionId,
      p_round: params.round,
    });
    if (error) throw error;
    return json({ success: true, deleted: count ?? 0 });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}
