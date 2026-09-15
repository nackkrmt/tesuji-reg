// GET  /api/divisions/:id/matches?round=X
//        → { success, matches, allMatches, rounds, currentRound, allNames }  (public)
// POST /api/divisions/:id/matches { round, matches:[{table,black,white,blackScore?,whiteScore?}] }
//        → { success }                                                       (writer)
// v1 parity with v1's server.js (that tree is not in this repo). Called by the MacMahon .jar
// (getMatches / exportPairings) and the v1 admin.js import flow.
//
// POST semantics: v1 APPENDED rows; here the round is replaced wholesale
// (live_replace_round), which makes admin re-imports idempotent instead of
// duplicating. Since 20260915_0005 "replace" means upsert + delete-what-was-
// dropped rather than delete-then-insert: the .jar re-exports a round on every
// Export Pairings, and a table whose two seats are unchanged must keep the
// results, check-ins and no-shows the judges already entered against it.
//
// :id is resolved inside the caller's tournament — the token's for writes; for
// the public GET, ?t= or a token if the caller sends one, else :id must be the
// internal division id.

import {
  getDivisionMatchData,
  getServerSupabase,
  resolveDivisionId,
} from "@/lib/live/serverData";
import {
  divisionNotFoundResponse,
  json,
  optionalTournamentScope,
  parseRoundMatches,
  requireWriter,
  serverError,
  shortKey,
} from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const scope = await optionalTournamentScope(req);
    const divisionId = scope ? await resolveDivisionId(scope, id) : id;
    if (!divisionId) return divisionNotFoundResponse();
    const data = await getDivisionMatchData(divisionId);
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
    return serverError(e, "GET /api/divisions/:id/matches");
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireWriter(req);
  if (auth instanceof Response) return auth;
  try {
    const { round, matches } = (await req.json()) as {
      round?: string;
      matches?: { table: string; black: string; white: string; blackScore?: string; whiteScore?: string }[];
    };
    const roundKey = shortKey(round);
    if (!roundKey || !matches) {
      return json({ success: false, error: "round and matches required" }, 400);
    }
    const rows = parseRoundMatches(matches);
    if (!rows) {
      return json({ success: false, error: "matches must be a list of pairings" }, 400);
    }
    const divisionId = await resolveDivisionId(auth.tournamentId, id);
    if (!divisionId) return divisionNotFoundResponse();
    const sb = getServerSupabase();
    const { error } = await sb.rpc("live_replace_round", {
      p_secret: auth.token,
      p_division_id: divisionId,
      p_round: roundKey,
      p_matches: rows,
    });
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    return serverError(e, "POST /api/divisions/:id/matches");
  }
}
