// GET /live/snapshot → the full v1-shaped FULL_UPDATE payload as a one-shot JSON
// response. Replaces the held-open SSE endpoint (/live/events) so the page fits
// Vercel's serverless model: the browser (public/live-assets/results.js) polls
// this every 3s instead of holding a stream open. ETag + 304 keeps unchanged
// polls tiny on the wire.
//
// The payload is fully public and identical for every viewer (no cookies, no
// per-user data — the "follow my students" roster is a separate client-side
// Supabase call), so it's shared-cached at Vercel's CDN: s-maxage=3 means all
// viewers polling within the same 3s window share ONE origin hit — Supabase is
// read ~once per 3s total regardless of audience size, instead of once per
// viewer. stale-while-revalidate serves the (at most 3s old) copy instantly
// while the edge refreshes in the background, so nobody waits on the origin.
// Vercel strips s-maxage/SWR before forwarding to the browser, so browsers
// still revalidate every poll (via ETag) against the edge, not the origin.

import { createHash } from "node:crypto";
import { buildFullUpdate } from "@/lib/live/serverData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_SHARED = "public, s-maxage=3, stale-while-revalidate=27";

export async function GET(req: Request) {
  try {
    const payload = await buildFullUpdate();
    const body = JSON.stringify(payload);
    const etag = `"${createHash("sha1").update(body).digest("hex")}"`;

    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": CACHE_SHARED },
      });
    }

    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        ETag: etag,
        "Cache-Control": CACHE_SHARED,
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      // Errors must never be shared-cached — a single failed refresh would
      // otherwise be served to every viewer for the full TTL.
      { status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    );
  }
}
