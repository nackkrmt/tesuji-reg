// PUT /api/divisions/:id/close { round, closed, by } → { success, closure? }  (writer)
//
// The judge console's "ปิดรอบ" button (lib/live/roundClose.ts explains why it
// exists). `closed: true` records that `round` of this division is over;
// `closed: false` reopens it. Only the division's CURRENT round (the highest one
// on the board) can be closed — a past round is already over by definition,
// and a close aimed at a round MacMahon has since replaced would tell the
// operator about the wrong pairing. :id is resolved inside the token's
// tournament, like every other writer route here.
//
// The stored closure is built from what the server reads at this moment, not
// from the client: which tables had no result and every table's result, so
// /admin/live can flag a result that changes after the close.
//
// `by` is the judge's display name and is self-asserted, exactly like
// submittedBy on a result — an operational "who to ask", never evidence.

import {
  getDivisionMatchData,
  getServerSupabase,
  resolveDivisionId,
} from "@/lib/live/serverData";
import {
  boundedText,
  divisionNotFoundResponse,
  json,
  MAX_NAME_LEN,
  requireWriter,
  serverError,
  shortKey,
} from "@/lib/live/apiShared";
import { buildClosure, ROUND_NOT_CURRENT, roundClosedKey } from "@/lib/live/roundClose";
import type { Json } from "@/lib/data/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireWriter(req);
  if (auth instanceof Response) return auth;
  try {
    const { round, closed, by } = (await req.json()) as {
      round?: string;
      closed?: boolean;
      by?: string;
    };
    const roundKey = shortKey(round);
    if (!roundKey || typeof closed !== "boolean") {
      return json({ success: false, error: "round and closed (boolean) required" }, 400);
    }
    const divisionId = await resolveDivisionId(auth.tournamentId, id);
    if (!divisionId) return divisionNotFoundResponse();

    const data = await getDivisionMatchData(divisionId);
    if (data.currentRound !== roundKey) {
      return json(
        {
          success: false,
          code: ROUND_NOT_CURRENT,
          error: "รอบนี้ไม่ใช่รอบปัจจุบันแล้ว — มีรอบใหม่ถูกอัปโหลด กรุณารีเฟรช",
          currentRound: data.currentRound,
        },
        409,
      );
    }

    const judge = boundedText(by, MAX_NAME_LEN) ?? "";
    const at = new Date().toISOString();
    const value = closed
      ? buildClosure(
          roundKey,
          data.allMatches.filter((m) => m.round === roundKey),
          judge,
          at,
        )
      : // Reopened: an empty round is what parseRoundClosure reads as "open".
        // Who reopened it and when are kept for whoever looks at the row.
        { round: "", reopenedRound: roundKey, at, by: judge };

    const sb = getServerSupabase();
    const { error } = await sb.rpc("live_set_config", {
      p_secret: auth.token,
      p_tournament_id: auth.tournamentId,
      p_key: roundClosedKey(divisionId),
      p_value: value as unknown as Json,
    });
    if (error) throw error;

    return json({
      success: true,
      closure: closed && "pending" in value
        ? { round: value.round, at: value.at, pending: value.pending }
        : null,
    });
  } catch (e) {
    return serverError(e, "PUT /api/divisions/:id/close");
  }
}
