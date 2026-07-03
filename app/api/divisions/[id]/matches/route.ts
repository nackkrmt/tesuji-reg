// GET  /api/divisions/:id/matches?round=X
//        → { success, matches, allMatches, rounds, currentRound, allNames }  (public)
// POST /api/divisions/:id/matches { round, matches:[{table,black,white,blackScore?,whiteScore?}] }
//        → { success }                                                       (writer)
// v1 parity: reference/tesuji-v1/server.js. Called by the MacMahon .jar
// (getMatches / exportPairings) and the v1 admin.js import flow.
//
// POST semantics: v1 APPENDED rows; here we replace the round wholesale
// (live_replace_round = delete that round + insert). The .jar deletes the
// round first anyway, and replace makes admin re-imports idempotent instead
// of duplicating — a strict improvement, same end state for the .jar's flow.

import { getDivisionMatchData, getServerSupabase } from "@/lib/live/serverData";
import { extractToken, json, requireWriter } from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const data = await getDivisionMatchData(params.id);
    const round = new URL(req.url).searchParams.get("round");
    if (round) {
      // v1: when ?round given, filter matches to it and report it as current.
      const matches = data.allMatches.filter((m) => m.round === round.toString());
      return json({
        success: true,
        matches,
        allMatches: data.allMatches,
        rounds: data.rounds,
        currentRound: round,
        allNames: data.allNames,
      });
    }
    return json({ success: true, ...data });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireWriter(req);
  if (unauth) return unauth;
  try {
    const { round, matches } = (await req.json()) as {
      round?: string;
      matches?: { table: string; black: string; white: string; blackScore?: string; whiteScore?: string }[];
    };
    if (!round || !matches) {
      return json({ success: false, error: "round and matches required" }, 400);
    }
    const sb = getServerSupabase();
    const { error } = await sb.rpc("live_replace_round", {
      p_secret: extractToken(req),
      p_division_id: params.id,
      p_round: round,
      p_matches: matches,
    });
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}
