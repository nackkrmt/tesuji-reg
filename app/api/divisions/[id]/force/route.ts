// PUT /api/divisions/:id/force { round, table, newBlack, newWhite, remark } → { success }
// v1 parity: reference/tesuji-v1/server.js PUT /api/divisions/:id/force. Sets the manual
// override columns (black_force / white_force) + remark on the target table via
// live_set_force, which also de-dups the forced players off any other table this round.

import { getServerSupabase } from "@/lib/live/serverData";
import { extractToken, json, requireWriter } from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireWriter(req);
  if (unauth) return unauth;
  try {
    const { round, table, newBlack, newWhite, remark } = (await req.json()) as {
      round?: string;
      table?: string;
      newBlack?: string;
      newWhite?: string;
      remark?: string;
    };
    if (!round || !table || !newBlack || !newWhite) {
      return json(
        { success: false, error: "round, table, newBlack, newWhite required" },
        400,
      );
    }
    const sb = getServerSupabase();
    const { error } = await sb.rpc("live_set_force", {
      p_secret: extractToken(req),
      p_division_id: params.id,
      p_round: round,
      p_table: table,
      p_black_force: newBlack,
      p_white_force: newWhite,
      // SQL text args accept NULL but codegen types them as string.
      p_remark: (remark ?? null) as unknown as string,
    });
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}
