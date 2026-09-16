// PUT /api/divisions/:id/result { round, table, winner, submittedBy, black, white } → { success }  (writer)
// v1 parity: PUT /api/divisions/:id/result. Called by the Judge page
// (public/live-assets/judge.js). `winner` uses v1's labels; map them to the
// "1-0" / "0-1" / "?-?" result codes that live_submit_result stores. :id is resolved
// inside the token's tournament.
//
// `black`/`white` are the two names the judge had on screen when they tapped.
// They are not stored — they are the pairing's identity, checked by the RPC
// (20260915_0005) so a result submitted from a stale screen, or replayed out of
// the offline queue minutes later, cannot land on whoever sits at that table
// number NOW. Optional: a result queued before that deploy carries no names and
// is accepted the way it always was rather than stranded in the queue.
//
// `submittedBy` is a self-asserted label, not an identity: the route gates on
// the write token alone, so anyone holding the judge link can put any name in
// this column. It is an operational "who to ask about table 7", never evidence.

import { getServerSupabase, resolveDivisionId } from "@/lib/live/serverData";
import {
  boundedText,
  divisionNotFoundResponse,
  isMatchChanged,
  isMatchNotFound,
  json,
  matchChangedResponse,
  matchNotFoundResponse,
  MAX_NAME_LEN,
  MAX_REMARK_LEN,
  requireWriter,
  serverError,
  shortKey,
} from "@/lib/live/apiShared";
import type { Database } from "@/lib/data/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubmitResultArgs = Database["public"]["Functions"]["live_submit_result"]["Args"];

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireWriter(req);
  if (auth instanceof Response) return auth;
  try {
    const { round, table, winner, submittedBy, remark, black, white } = (await req.json()) as {
      round?: string;
      table?: string;
      winner?: string;
      submittedBy?: string;
      remark?: string;
      black?: string;
      white?: string;
    };
    const roundKey = shortKey(round);
    const tableKey = shortKey(table);
    if (!roundKey || !tableKey || !winner) {
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
    const divisionId = await resolveDivisionId(auth.tournamentId, id);
    if (!divisionId) return divisionNotFoundResponse();
    const sb = getServerSupabase();
    const { error } = await sb.rpc("live_submit_result", {
      p_secret: auth.token,
      p_division_id: divisionId,
      p_round: roundKey,
      p_table: tableKey,
      p_result: result,
      // Optional judge-console remark (e.g. 'ขาดแข่ง' from the no-show quick
      // action). live_submit_result coalesces NULL to the existing remark, so
      // plain submits leave it untouched.
      // These are DEFAULT NULL in SQL; codegen types them optional, so an
      // absent value has to be undefined rather than null.
      p_remark: boundedText(remark, MAX_REMARK_LEN) ?? undefined,
      p_by: boundedText(submittedBy, MAX_NAME_LEN) ?? "",
      p_black: boundedText(black, MAX_NAME_LEN) ?? undefined,
      p_white: boundedText(white, MAX_NAME_LEN) ?? undefined,
    } satisfies SubmitResultArgs);
    if (error) {
      if (isMatchNotFound(error)) {
        return matchNotFoundResponse(
          "ไม่พบคู่นี้ในตารางแล้ว — รอบอาจถูกอัปเดตใหม่ กรุณารีเฟรชแล้วส่งผลอีกครั้ง",
        );
      }
      if (isMatchChanged(error)) {
        return matchChangedResponse(
          "โต๊ะนี้เปลี่ยนคู่แข่งขันแล้ว — ผลยังไม่ถูกบันทึก กรุณารีเฟรชแล้วส่งผลของคู่ปัจจุบัน",
        );
      }
      throw error;
    }
    return json({ success: true });
  } catch (e) {
    return serverError(e, "PUT /api/divisions/:id/result");
  }
}
