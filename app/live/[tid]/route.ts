// GET /live/[tid] — one tournament's results board: the v1 shell with
// window.__LIVE_TID injected so results.js polls /live/snapshot?t=<tid> and the
// back button returns to that tournament's detail page. A malformed tid is a
// 404, never someone else's board.

import { localeFromCookie, renderLivePage } from "@/lib/live/shell";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  { params }: { params: { tid: string } },
) {
  if (!UUID_RE.test(params.tid)) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const locale = localeFromCookie(req.headers.get("cookie"));
  return new Response(renderLivePage(locale, params.tid), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
