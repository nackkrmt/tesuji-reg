// POST /api/divisions/:id/standings { standings: { headers, rows } } → { success }
// v1 parity with v1's server.js (that tree is not in this repo). Called by the MacMahon .jar
// (exportStandings / wall list) and the v1 admin.js import flow. :id is
// resolved inside the token's tournament.

import { getServerSupabase, resolveDivisionId } from "@/lib/live/serverData";
import {
  divisionNotFoundResponse,
  json,
  parseStandings,
  requireWriter,
  serverError,
} from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireWriter(req);
  if (auth instanceof Response) return auth;
  try {
    const body = (await req.json()) as {
      standings?: { headers?: unknown; rows?: unknown };
    };
    // Shape-checked, not just truthy: live_set_standings stores whatever it is
    // handed and results.js then calls headers[i].toLowerCase() and row.map()
    // on it for every viewer on every 3s poll — a wall list of numbers instead
    // of strings would break the public board, not just this upload.
    const standings = parseStandings(body.standings?.headers, body.standings?.rows);
    if (!standings) {
      return json(
        { success: false, error: "standings.headers and standings.rows must be lists of text" },
        400,
      );
    }
    const divisionId = await resolveDivisionId(auth.tournamentId, id);
    if (!divisionId) return divisionNotFoundResponse();
    const sb = getServerSupabase();
    const { error } = await sb.rpc("live_set_standings", {
      p_secret: auth.token,
      p_division_id: divisionId,
      p_headers: standings.headers,
      p_rows: standings.rows,
    });
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    return serverError(e, "POST /api/divisions/:id/standings");
  }
}
