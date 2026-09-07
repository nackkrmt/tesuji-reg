// GET /live/snapshot?t=<tournament id> → the full v1-shaped FULL_UPDATE payload
// for ONE tournament's board, as a one-shot JSON response. Replaces the
// held-open SSE endpoint (/live/events) so the page fits Vercel's serverless
// model: the browser (public/live-assets/results.js, judge.js) polls this every
// 3s instead of holding a stream open. ETag + 304 keeps unchanged polls tiny.
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
//
// `t` is required (20260908_0001): boards belong to one tournament each and a
// merged snapshot no longer exists. A missing/junk value is a 400, not someone
// else's board — and it is never shared-cached.

import { createHash } from "node:crypto";
import { buildFullUpdate } from "@/lib/live/serverData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_SHARED = "public, s-maxage=3, stale-while-revalidate=27";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t");
  if (!t || !UUID_RE.test(t)) {
    return new Response(JSON.stringify({ error: "TOURNAMENT_REQUIRED" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  try {
    // The query string keys the CDN cache, so two tournaments' snapshots never
    // share an entry.
    const payload = await buildFullUpdate(t);
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
