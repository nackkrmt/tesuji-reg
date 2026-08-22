// GET /live/[tid] — the per-tournament results board: the same v1 shell, with
// window.__LIVE_TID injected so results.js polls /live/snapshot?t=<tid> and the
// back button returns to that tournament's detail page. A non-UUID tid renders
// the global board rather than 404ing a hand-typed link.

import { localeFromCookie, renderLivePage } from "@/lib/live/shell";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  { params }: { params: { tid: string } },
) {
  const locale = localeFromCookie(req.headers.get("cookie"));
  const tid = UUID_RE.test(params.tid) ? params.tid : null;
  return new Response(renderLivePage(locale, tid), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
