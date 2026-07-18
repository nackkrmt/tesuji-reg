// PUT /api/divisions/:id/absent { round, table, side, absent } → { success }  (writer)
// Judge-console only (no v1 counterpart): per-side "ไม่มา" (no-show) toggle. The
// merge into the '' | 'B' | 'W' | 'BOTH' absent code — plus clearing the same
// side's check-in bit — is done atomically by live_toggle_absent.

import { getServerSupabase } from "@/lib/live/serverData";
import { extractToken, json, requireWriter } from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireWriter(req);
  if (unauth) return unauth;
  try {
    const { round, table, side, absent } = (await req.json()) as {
      round?: string;
      table?: string;
      side?: string;
      absent?: boolean;
    };
    if (!round || !table || (side !== "B" && side !== "W")) {
      return json({ success: false, error: "round, table and side (B|W) required" }, 400);
    }
    const sb = getServerSupabase();
    const { error } = await sb.rpc("live_toggle_absent", {
      p_secret: extractToken(req),
      p_division_id: params.id,
      p_round: round,
      p_table: table,
      p_side: side,
      p_absent: !!absent,
    });
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}
