// DELETE /api/divisions/:id/rounds/:round → { success, deleted }
// v1 parity: reference/tesuji-v1/server.js. Called by the MacMahon .jar
// (deleteRound) before re-uploading a round's pairings.

import { getServerSupabase } from "@/lib/live/serverData";
import { extractToken, json, requireWriter } from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string; round: string } },
) {
  const unauth = await requireWriter(req);
  if (unauth) return unauth;
  try {
    const sb = getServerSupabase();
    // Count first so we can echo `deleted` like v1 did (public SELECT via RLS).
    const { count } = await sb
      .from("live_match")
      .select("id", { count: "exact", head: true })
      .eq("division_id", params.id)
      .eq("round", params.round);

    const { error } = await sb.rpc("live_delete_round", {
      p_secret: extractToken(req),
      p_division_id: params.id,
      p_round: params.round,
    });
    if (error) throw error;
    return json({ success: true, deleted: count ?? 0 });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}
