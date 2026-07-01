// verify-slip — verify a payment slip via the SlipOK API, server-side, so the
// SlipOK key never reaches the browser. Also mints short-lived signed URLs for
// admins to view a slip (action: "view"), since slips live in a PRIVATE bucket.
// Gated by the same admin passphrase as the other admin RPCs (app_config.admin_secret).
//
// Request (POST JSON):
//   { batchId, adminSecret }                 → verify   → { ok, status, data }
//   { batchId, adminSecret, action:"view" }  → sign URL → { ok, url }
//
// SSRF-safe: the slip is only ever read from THIS project's own Storage — either
// the private slip bucket via the service role (new uploads store a bare object
// path) or a legacy public URL that must be under this project's Storage host.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLIPOK_API_KEY = Deno.env.get("SLIPOK_API_KEY") ?? "";
const SLIPOK_BRANCH_ID = Deno.env.get("SLIPOK_BRANCH_ID") ?? "";

const SLIP_BUCKET = "tesuji-slips";
const MAX_SLIP_BYTES = 6 * 1024 * 1024; // 6 MB ceiling (bucket caps uploads at 5 MB)
const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/`; // legacy slips

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function pgGet(query: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  if (!res.ok) throw new Error(`db read failed (${res.status})`);
  return await res.json();
}

async function pgPatchBatch(
  batchId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/registration_batch?id=eq.${batchId}`,
    {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new Error(`db write failed (${res.status})`);
}

// ── slip location helpers (SSRF gate) ────────────────────────────────────────
/** A stored slip ref is either a bare private-bucket object path (new: e.g.
 *  "abc123.jpg") or a legacy full public URL. Anything else is rejected. */
function isPrivatePath(ref: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ref); // no scheme, no slash, no ".."
}
function isOwnPublicUrl(ref: string): boolean {
  return ref.startsWith(PUBLIC_PREFIX);
}

/** Download the slip bytes from our own Storage only. */
async function fetchSlipBlob(ref: string): Promise<Blob> {
  let url: string;
  if (isPrivatePath(ref)) {
    url = `${SUPABASE_URL}/storage/v1/object/${SLIP_BUCKET}/${ref}`;
  } else if (isOwnPublicUrl(ref)) {
    url = ref;
  } else {
    throw new Error("SLIP_LOCATION_INVALID");
  }
  const res = await fetch(url, {
    redirect: "manual",
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  if (!res.ok) throw new Error(`SLIP_FETCH_FAILED (${res.status})`);
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len > MAX_SLIP_BYTES) throw new Error("SLIP_TOO_LARGE");
  const blob = await res.blob();
  if (blob.size > MAX_SLIP_BYTES) throw new Error("SLIP_TOO_LARGE");
  return blob;
}

/** A viewable, short-lived signed URL (private path) or the legacy public URL. */
async function signSlipUrl(ref: string): Promise<string | null> {
  if (isPrivatePath(ref)) {
    const res = await fetch(
      `${SUPABASE_URL}/storage/v1/object/sign/${SLIP_BUCKET}/${ref}`,
      {
        method: "POST",
        redirect: "manual",
        headers: {
          apikey: SERVICE_ROLE,
          Authorization: `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 600 }),
      },
    );
    if (!res.ok) return null;
    const out = (await res.json()) as { signedURL?: string };
    return out.signedURL ? `${SUPABASE_URL}/storage/v1${out.signedURL}` : null;
  }
  if (isOwnPublicUrl(ref)) return ref; // legacy public slip
  return null;
}

// ── receiver matching ───────────────────────────────────────────────────────
function expectedReceiverDigits(
  type: string,
  value: string,
): { haystack: string; strict: boolean } {
  const v = (value ?? "").trim();
  if (type === "phone") {
    const d = v.replace(/\D/g, "");
    const intl = "66" + d.replace(/^0/, "");
    return { haystack: d + "|" + intl, strict: true };
  }
  if (type === "national_id") {
    return { haystack: v.replace(/\D/g, ""), strict: true };
  }
  return { haystack: v.replace(/\D/g, ""), strict: false };
}

function longestDigitRun(...vals: Array<unknown>): string {
  let best = "";
  for (const v of vals) {
    for (const run of String(v ?? "").match(/\d{4,}/g) ?? []) {
      if (run.length > best.length) best = run;
    }
  }
  return best;
}

function matchReceiver(
  type: string,
  expectedValue: string,
  ...revealedFrom: Array<unknown>
): boolean | null {
  const { haystack, strict } = expectedReceiverDigits(type, expectedValue);
  const revealed = longestDigitRun(...revealedFrom);
  if (!revealed || !haystack) return null;
  if (haystack.includes(revealed)) return true;
  return strict ? false : null;
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

  const batchId = typeof body.batchId === "string" ? body.batchId : "";
  const adminSecret = body.adminSecret as string;
  const action = typeof body.action === "string" ? body.action : "verify";
  if (!batchId) return json({ ok: false, error: "MISSING_BATCH" });

  // gate: admin passphrase must match app_config.admin_secret
  try {
    const rows = await pgGet("app_config?key=eq.admin_secret&select=value");
    const secret = rows[0]?.value as string | undefined;
    if (!secret || adminSecret !== secret) {
      return json({ ok: false, error: "UNAUTHORIZED" });
    }
  } catch (e) {
    return json({ ok: false, error: (e as Error).message });
  }

  // load the batch (authoritative amount + slip + tournament's PromptPay)
  let batch: Record<string, unknown>;
  try {
    const rows = await pgGet(
      `registration_batch?id=eq.${batchId}&select=total_amount_thb,payment_slip_url,tournament:tournament_id(promptpay_target_value,promptpay_target_type)`,
    );
    if (!rows.length) return json({ ok: false, error: "BATCH_NOT_FOUND" });
    batch = rows[0];
  } catch (e) {
    return json({ ok: false, error: (e as Error).message });
  }

  const expectedAmount = Number(batch.total_amount_thb);
  const slipUrl = batch.payment_slip_url as string | null;
  const tourn = (batch.tournament ?? {}) as Record<string, unknown>;
  const expectedReceiver = (tourn.promptpay_target_value as string) ?? "";
  const expectedType = (tourn.promptpay_target_type as string) ?? "";
  if (!slipUrl) return json({ ok: false, error: "NO_SLIP" });

  // ── action: view — return a short-lived signed URL for admin display ────────
  if (action === "view") {
    try {
      const url = await signSlipUrl(slipUrl);
      if (!url) return json({ ok: false, error: "SLIP_LOCATION_INVALID" });
      return json({ ok: true, url });
    } catch (e) {
      return json({ ok: false, error: (e as Error).message });
    }
  }

  const nowIso = new Date().toISOString();

  // ── DEMO MODE — no SlipOK key yet ──────────────────────────────────────────
  if (!SLIPOK_API_KEY || !SLIPOK_BRANCH_ID) {
    const data = {
      mode: "demo",
      amount: expectedAmount,
      expectedAmount,
      amountMatches: true,
      receiverMatches: null,
      expectedReceiver,
      note: "ยังไม่ได้ตั้ง SlipOK API key — นี่คือผลจำลอง (ยังไม่ได้ตรวจจริง)",
    };
    try {
      await pgPatchBatch(batchId, {
        slip_verify_status: "demo",
        slip_verify_data: data,
        slip_verified_at: nowIso,
      });
    } catch (e) {
      return json({ ok: false, error: (e as Error).message });
    }
    return json({ ok: true, status: "demo", data });
  }

  // ── LIVE MODE — call SlipOK with the slip image ─────────────────────────────
  try {
    let blob: Blob;
    try {
      blob = await fetchSlipBlob(slipUrl);
    } catch (e) {
      return json({ ok: false, error: (e as Error).message });
    }

    const form = new FormData();
    form.append("files", blob, "slip.jpg");
    form.append("log", "true");

    const slipRes = await fetch(
      `https://api.slipok.com/api/line/apikey/${SLIPOK_BRANCH_ID}`,
      { method: "POST", headers: { "x-authorization": SLIPOK_API_KEY }, body: form },
    );
    const out = (await slipRes.json()) as Record<string, unknown>;
    const ok = out.success === true;
    const d = (out.data ?? {}) as Record<string, unknown>;
    const code = Number(out.code ?? d.code ?? 0);
    const amount = ok ? Number(d.amount) : NaN;
    const amountMatches = ok && Number.isFinite(amount) && amount === expectedAmount;

    const receiver = (d.receiver ?? {}) as Record<string, unknown>;
    const receiverAccount = (receiver.account ?? {}) as Record<string, unknown>;
    const receiverProxyObj = (receiver.proxy ?? {}) as Record<string, unknown>;
    const receiverAcct =
      (receiverAccount.value as string) ??
      (receiver.displayName as string) ??
      null;
    const receiverProxy = (receiverProxyObj.value as string) ?? null;
    const receivingBank =
      (out.receivingBank as string) ??
      (d.receivingBank as string) ??
      (((receiver.bank ?? {}) as Record<string, unknown>).id as string) ??
      null;
    const sender = (d.sender ?? {}) as Record<string, unknown>;
    const senderName = sender.displayName ?? sender.name ?? null;

    const receiverMatches = ok
      ? matchReceiver(expectedType, expectedReceiver, receiverProxy, receiverAcct)
      : null;

    const status = ok
      ? !amountMatches
        ? "amount_mismatch"
        : receiverMatches === false
          ? "receiver_mismatch"
          : "verified"
      : code === 1012
        ? "duplicate"
        : "failed";

    const data = {
      mode: "live",
      amount: Number.isFinite(amount) ? amount : null,
      expectedAmount,
      amountMatches,
      receiver: receiverAcct,
      receiverProxy,
      receivingBank,
      receiverMatches,
      expectedReceiver,
      sender: senderName,
      transRef: d.transRef ?? null,
      transDate: d.transDate ?? null,
      transTime: d.transTime ?? null,
      code: code || null,
      message: (out.message ?? d.message ?? null) as string | null,
    };

    await pgPatchBatch(batchId, {
      slip_verify_status: status,
      slip_verify_data: data,
      slip_verified_at: nowIso,
    });
    return json({ ok: true, status, data });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message });
  }
});
