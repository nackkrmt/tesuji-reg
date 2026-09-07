// POST /api/divisions/:id/standings { standings: { headers, rows } } → { success }
// v1 parity: reference/tesuji-v1/server.js. Called by the MacMahon .jar
// (exportStandings / wall list) and the v1 admin.js import flow. :id is
// resolved inside the token's tournament.

import { getServerSupabase, resolveDivisionId } from "@/lib/live/serverData";
import { divisionNotFoundResponse, json, requireWriter } from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireWriter(req);
  if (auth instanceof Response) return auth;
  try {
    const body = (await req.json()) as {
      standings?: { headers?: string[]; rows?: string[][] };
    };
    const headers = body.standings?.headers;
    const rows = body.standings?.rows;
    if (!headers || !rows) {
      return json({ success: false, error: "standings.headers and standings.rows required" }, 400);
    }
    const divisionId = await resolveDivisionId(auth.tournamentId, params.id);
    if (!divisionId) return divisionNotFoundResponse();
    const sb = getServerSupabase();
    const { error } = await sb.rpc("live_set_standings", {
      p_secret: auth.token,
      p_division_id: divisionId,
      p_headers: headers,
      p_rows: rows,
    });
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}
