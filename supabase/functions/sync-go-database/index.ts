// sync-go-database — fetch a published Google Sheet as CSV, server-side, so the
// browser admin can "Sync" a rank database without hitting CORS. Gated by the
// caller's Supabase Auth JWT (must hold the admin role; sent by functions.invoke).
//
// Request (POST JSON):
//   { action: "get",   source }             → { ok, url }
//   { action: "fetch", source, url? }        → { ok, csv, url }
// On any handled problem it returns HTTP 200 with { ok: false, error }.
//
// SSRF-safe: the target must be a Google Sheets URL (docs.google.com over https);
// redirects are followed MANUALLY with every hop's host re-validated against a
// Google allowlist, and the URL is only persisted after it passes validation.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SOURCES = new Set(["dan", "kyu", "award"]);
const MAX_CSV_BYTES = 25 * 1024 * 1024; // 25 MB ceiling

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

// ── SSRF gate ────────────────────────────────────────────────────────────────
function isIpLiteral(host: string): boolean {
  return (
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") ||
    host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")
  );
}
/** https host on the Google allowlist (initial URL is stricter — must be
 *  docs.google.com; redirects may land on Google's CSV-serving hosts). */
function httpsHost(u: string): string | null {
  try {
    const p = new URL(u);
    return p.protocol === "https:" ? p.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}
function isGoogleHost(host: string): boolean {
  return (
    host === "docs.google.com" ||
    host === "drive.google.com" ||
    host.endsWith(".googleusercontent.com") ||
    host.endsWith(".google.com")
  );
}

/** Fetch the CSV, following redirects manually and re-validating each hop's host
 *  so a link can never bounce into an internal address. */
async function safeFetchCsv(startUrl: string): Promise<Response> {
  let url = startUrl;
  for (let hop = 0; hop < 5; hop++) {
    const host = httpsHost(url);
    if (!host || isIpLiteral(host) || !isGoogleHost(host)) {
      throw new Error("SHEET_HOST_NOT_ALLOWED");
    }
    const res = await fetch(url, { redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      url = new URL(loc, url).toString(); // resolve relative redirects
      continue;
    }
    return res;
  }
  throw new Error("TOO_MANY_REDIRECTS");
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

// ── caller identity (Supabase Auth JWT) ──────────────────────────────────────
/** Resolve the caller's user id from their bearer token, or null if unauthenticated. */
async function getCallerUid(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!/^bearer /i.test(auth)) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: auth },
    });
    if (!res.ok) return null;
    const u = (await res.json()) as { id?: string };
    return typeof u.id === "string" ? u.id : null;
  } catch {
    return null;
  }
}

/** True when the given account holds the admin role. */
async function isUidAdmin(uid: string): Promise<boolean> {
  const rows = await pgGet(
    `account_roles?account_id=eq.${encodeURIComponent(uid)}&role=eq.admin&select=account_id`,
  );
  return rows.length > 0;
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

  if (!SOURCES.has(source)) return json({ ok: false, error: "INVALID_SOURCE" });

  // gate: caller must be a signed-in admin (JWT sent by functions.invoke).
  const uid = await getCallerUid(req);
  if (!uid || !(await isUidAdmin(uid))) {
    return json({ ok: false, error: "UNAUTHORIZED" });
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
      if (!effective) {
        const rows = await pgGet(`app_config?key=eq.${cfgKey}&select=value`);
        effective = (rows[0]?.value as string) ?? "";
      }
      if (!effective) {
        return json({ ok: false, error: "ยังไม่ได้ตั้งลิงก์ Google Sheet สำหรับฐานนี้" });
      }

      const target = toCsvExportUrl(effective);
      // SSRF gate: the pasted link must resolve to a Google Sheets host over https
      const initialHost = httpsHost(target);
      if (!initialHost || isIpLiteral(initialHost) || !isGoogleHost(initialHost)) {
        return json({
          ok: false,
          error: "ลิงก์ต้องเป็น Google Sheets (docs.google.com) ที่แชร์แบบ public เท่านั้น",
        });
      }

      // persist the config only AFTER the host passed validation
      if (url) await pgUpsertConfig(cfgKey, effective);

      const res = await safeFetchCsv(target);
      if (!res.ok) {
        return json({
          ok: false,
          error: `ดึงชีตไม่สำเร็จ (HTTP ${res.status}) — ตรวจว่าแชร์แบบ public / publish to web แล้ว`,
        });
      }
      const len = Number(res.headers.get("content-length") ?? "0");
      if (len > MAX_CSV_BYTES) return json({ ok: false, error: "ไฟล์ใหญ่เกินไป" });
      const csv = await res.text();
      if (csv.length > MAX_CSV_BYTES) return json({ ok: false, error: "ไฟล์ใหญ่เกินไป" });
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text/html") || csv.startsWith("<!DOCTYPE")) {
        return json({
          ok: false,
          error: "ชีตยังไม่ public — Google ส่งหน้า login มาแทน CSV",
        });
      }
      return json({ ok: true, csv, url: effective });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "SHEET_HOST_NOT_ALLOWED") {
        return json({ ok: false, error: "ลิงก์ปลายทางไม่ใช่ Google Sheets ที่อนุญาต" });
      }
      return json({ ok: false, error: msg });
    }
  }

  return json({ ok: false, error: "UNKNOWN_ACTION" });
});
