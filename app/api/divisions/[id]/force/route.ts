// PUT /api/divisions/:id/force { round, table, newBlack, newWhite, remark } → { success }
// v1 parity with v1's server.js (not in this repo): PUT /api/divisions/:id/force. Sets the manual
// override columns (black_force / white_force) + remark on the target table via
// live_set_force, which also de-dups the forced players off any other table this round.
// :id is resolved inside the token's tournament.

import { getServerSupabase, resolveDivisionId } from "@/lib/live/serverData";
import {
  boundedText,
  divisionNotFoundResponse,
  isMatchNotFound,
  json,
  matchNotFoundResponse,
  MAX_NAME_LEN,
  MAX_REMARK_LEN,
  requireWriter,
  serverError,
  shortKey,
} from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireWriter(req);
  if (auth instanceof Response) return auth;
  try {
    const { round, table, newBlack, newWhite, remark } = (await req.json()) as {
      round?: string;
      table?: string;
      newBlack?: string;
      newWhite?: string;
      remark?: string;
    };
    const roundKey = shortKey(round);
    const tableKey = shortKey(table);
    const black = boundedText(newBlack, MAX_NAME_LEN);
    const white = boundedText(newWhite, MAX_NAME_LEN);
    if (!roundKey || !tableKey || !black || !white) {
      return json(
        { success: false, error: "round, table, newBlack, newWhite required" },
        400,
      );
    }
    const divisionId = await resolveDivisionId(auth.tournamentId, id);
    if (!divisionId) return divisionNotFoundResponse();
    const sb = getServerSupabase();
    const { error } = await sb.rpc("live_set_force", {
      p_secret: auth.token,
      p_division_id: divisionId,
      p_round: roundKey,
      p_table: tableKey,
      p_black_force: black,
      p_white_force: white,
      // SQL text args accept NULL but codegen types them as string. Bounded
      // here as well: live_set_force stores the remark verbatim and the board
      // renders it, and the force route was the one writer that never capped it.
      p_remark: boundedText(remark, MAX_REMARK_LEN) as unknown as string,
    });
    if (error) {
      // Target table gone (round re-uploaded, stale table number): a client/state
      // conflict, not a server fault — and the RPC aborted before it could blank
      // the two named players out of the seats they actually occupy.
      if (isMatchNotFound(error)) {
        return matchNotFoundResponse(
          "ไม่พบโต๊ะนี้ในรอบปัจจุบัน — ตารางอาจถูกอัปเดตใหม่ กรุณารีเฟรชแล้วลองอีกครั้ง",
        );
      }
      throw error;
    }
    return json({ success: true });
  } catch (e) {
    return serverError(e, "PUT /api/divisions/:id/force");
  }
}
