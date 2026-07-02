// POST /api/divisions/:id/standings { standings: { headers, rows } } → { success }
// v1 parity: reference/tesuji-v1/server.js. Called by the MacMahon .jar
// (exportStandings / wall list) and the v1 admin.js import flow.

import { getServerSupabase } from "@/lib/live/serverData";
import { extractToken, json, requireWriter } from "@/lib/live/apiShared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const unauth = await requireWriter(req);
  if (unauth) return unauth;
  try {
    const body = (await req.json()) as {
      standings?: { headers?: string[]; rows?: string[][] };
    };
    const headers = body.standings?.headers;
    const rows = body.standings?.rows;
    if (!headers || !rows) {
      return json({ success: false, error: "standings.headers and standings.rows required" }, 400);
    }
    const sb = getServerSupabase();
    const { error } = await sb.rpc("live_set_standings", {
      p_secret: extractToken(req),
      p_division_id: params.id,
      p_headers: headers,
      p_rows: rows,
    });
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
}
