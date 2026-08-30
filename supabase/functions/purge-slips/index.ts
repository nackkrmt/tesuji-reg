// Disabled one-off maintenance function (slip purge, completed 2026-07-01).
// Neutralized — retained only because the MCP has no delete-function API.
// Safe to remove from the Supabase dashboard.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(() => new Response(JSON.stringify({ ok: false, error: "GONE" }), { status: 410, headers: { "Content-Type": "application/json" } }));
