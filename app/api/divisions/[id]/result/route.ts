// PUT /api/divisions/:id/result { round, table, winner, submittedBy } → { success }  (writer)
// v1 parity: reference/tesuji-v1/server.js PUT /api/divisions/:id/result. Called by the
// Judge page (public/live-assets/judge.js). `winner` uses v1's labels; map them to the
// "1-0" / "0-1" / "?-?" result codes that live_submit_result stores.

import { getServerSupabase } from "@/lib/live/serverData";
import { extractToken, json, requireWriter } from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireWriter(req);
  if (unauth) return unauth;
  try {
    const { round, table, winner, submittedBy, remark } = (await req.json()) as {
      round?: string;
      table?: string;
      winner?: string;
      submittedBy?: string;
      remark?: string;
    };
    if (!round || !table || !winner) {
      return json({ success: false, error: "round, table, winner required" }, 400);
    }
    const result =
      winner === "CANCEL" ? "?-?"
      : winner === "Black Win" ? "1-0"
      : winner === "White Win" ? "0-1"
      : null;
    if (result === null) {
      return json({ success: false, error: "invalid winner" }, 400);
    }
    const sb = getServerSupabase();
    const { error } = await sb.rpc("live_submit_result", {
      p_secret: extractToken(req),
      p_division_id: params.id,
      p_round: round,
      p_table: table,
      p_result: result,
      // Optional judge-console remark (e.g. 'ขาดแข่ง' from the no-show quick
      // action). live_submit_result coalesces NULL to the existing remark, so
      // plain submits leave it untouched.
      // SQL text args accept NULL but codegen types them as string.
      p_remark: (typeof remark === "string" && remark.trim()
        ? remark.trim().slice(0, 200)
        : null) as unknown as string,
      p_by: submittedBy ?? "",
    });
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}
