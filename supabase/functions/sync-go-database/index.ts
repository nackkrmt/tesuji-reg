// sync-go-database — fetch a published Google Sheet as CSV, server-side, so the
// browser admin can "Sync" a rank database without hitting CORS. Gated by the
// same admin passphrase as the SQL admin RPCs (app_config.admin_secret).
//
// Request (POST JSON):
//   { action: "get",   source, adminSecret }            → { ok, url }
//   { action: "fetch", source, url?, adminSecret }       → { ok, csv, url }
// On any handled problem it returns HTTP 200 with { ok: false, error }.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SOURCES = new Set(["dan", "kyu", "award"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Turn a Google Sheets edit/share URL into a CSV export endpoint. Leaves
 *  already-CSV ("publish to web") links untouched. Mirrors the mock layer. */
function toCsvExportUrl(raw: string): string {
  const u = raw.trim();
  if (/output=csv|format=csv/.test(u)) return u;
  const m = u.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) {
    const gid = u.match(/[#&?]gid=(\d+)/)?.[1];
    return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${
      gid ? `&gid=${gid}` : ""
    }`;
  }
  return u;
}

async function pgGet(query: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  if (!res.ok) throw new Error(`config read failed (${res.status})`);
  return await res.json();
}

async function pgUpsertConfig(key: string, value: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_config?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error(`config write failed (${res.status})`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "BAD_REQUEST" });
  }

  const action = body.action as string;
  const source = body.source as string;
  const url = typeof body.url === "string" ? (body.url as string).trim() : "";
  const adminSecret = body.adminSecret as string;

  if (!SOURCES.has(source)) return json({ ok: false, error: "INVALID_SOURCE" });

  // verify admin passphrase against app_config.admin_secret
  try {
    const rows = await pgGet("app_config?key=eq.admin_secret&select=value");
    const secret = rows[0]?.value as string | undefined;
    if (!secret || adminSecret !== secret) {
      return json({ ok: false, error: "UNAUTHORIZED" });
    }
  } catch (e) {
    return json({ ok: false, error: (e as Error).message });
  }

  const cfgKey = `gsheet_${source}_url`;

  if (action === "get") {
    try {
      const rows = await pgGet(`app_config?key=eq.${cfgKey}&select=value`);
      return json({ ok: true, url: (rows[0]?.value as string) ?? "" });
    } catch (e) {
      return json({ ok: false, error: (e as Error).message });
    }
  }

  if (action === "fetch") {
    try {
      let effective = url;
      if (effective) {
        await pgUpsertConfig(cfgKey, effective);
      } else {
        const rows = await pgGet(`app_config?key=eq.${cfgKey}&select=value`);
        effective = (rows[0]?.value as string) ?? "";
      }
      if (!effective) {
        return json({ ok: false, error: "ยังไม่ได้ตั้งลิงก์ Google Sheet สำหรับฐานนี้" });
      }

      const res = await fetch(toCsvExportUrl(effective), { redirect: "follow" });
      if (!res.ok) {
        return json({
          ok: false,
          error: `ดึงชีตไม่สำเร็จ (HTTP ${res.status}) — ตรวจว่าแชร์แบบ public / publish to web แล้ว`,
        });
      }
      const csv = await res.text();
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text/html") || csv.startsWith("<!DOCTYPE")) {
        return json({
          ok: false,
          error: "ชีตยังไม่ public — Google ส่งหน้า login มาแทน CSV",
        });
      }
      return json({ ok: true, csv, url: effective });
    } catch (e) {
      return json({ ok: false, error: (e as Error).message });
    }
  }

  return json({ ok: false, error: "UNKNOWN_ACTION" });
});
