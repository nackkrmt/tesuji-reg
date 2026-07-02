// GET /live/snapshot → the full v1-shaped FULL_UPDATE payload as a one-shot JSON
// response. Replaces the held-open SSE endpoint (/live/events) so the page fits
// Vercel's serverless model: the browser (public/live-assets/results.js) polls
// this every 3s instead of holding a stream open. ETag + 304 keeps unchanged
// polls tiny on the wire.

import { createHash } from "node:crypto";
import { buildFullUpdate } from "@/lib/live/serverData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const payload = await buildFullUpdate();
    const body = JSON.stringify(payload);
    const etag = `"${createHash("sha1").update(body).digest("hex")}"`;

    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "no-store" },
      });
    }

    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        ETag: etag,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
