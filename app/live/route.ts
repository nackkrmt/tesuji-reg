// GET /live — there is no global board any more: every board belongs to one
// tournament (20260908_0001), so the old merged page would have shown two
// events' divisions under one event's schedule. Send visitors to the results
// hub, which lists one board per tournament (/live/[tid]).

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return Response.redirect(new URL("/results", req.url), 302);
}
