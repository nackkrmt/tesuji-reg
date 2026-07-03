// PUT /api/divisions/:id/checkin { round, table, side, checked } → { success }  (writer)
// v1 parity: reference/tesuji-v1/server.js PUT /api/divisions/:id/checkin. `side` is
// 'B' | 'W'; the merge into the '' | 'B' | 'W' | 'BOTH' check-in code is done atomically
// by live_toggle_checkin (read-modify-write in one RPC).

import { getServerSupabase } from "@/lib/live/serverData";
import { extractToken, json, requireWriter } from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireWriter(req);
  if (unauth) return unauth;
  try {
    const { round, table, side, checked } = (await req.json()) as {
      round?: string;
      table?: string;
      side?: string;
      checked?: boolean;
    };
    if (!round || !table || (side !== "B" && side !== "W")) {
      return json({ success: false, error: "round, table and side (B|W) required" }, 400);
    }
    const sb = getServerSupabase();
    const { error } = await sb.rpc("live_toggle_checkin", {
      p_secret: extractToken(req),
      p_division_id: params.id,
      p_round: round,
      p_table: table,
      p_side: side,
      p_checked: !!checked,
    });
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}
