// GET /live — the legacy GLOBAL results board (every division). The shared v1
// shell lives in lib/live/shell.ts; the per-tournament board is /live/[tid].

import { localeFromCookie, renderLivePage } from "@/lib/live/shell";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const locale = localeFromCookie(req.headers.get("cookie"));
  return new Response(renderLivePage(locale, null), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
