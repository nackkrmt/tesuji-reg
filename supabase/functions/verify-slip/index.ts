// verify-slip — verify a payment slip via the SlipOK API, server-side, so the
// SlipOK key never reaches the browser. Gated by the same admin passphrase as
// the other admin RPCs (app_config.admin_secret).
//
// Request (POST JSON): { batchId, adminSecret }
// Response (always HTTP 200): { ok, status, data } | { ok: false, error }
//   status: 'verified' | 'amount_mismatch' | 'duplicate' | 'failed' | 'demo'
//
// DEMO MODE: when SLIPOK_API_KEY / SLIPOK_BRANCH_ID are not set, returns a
// SIMULATED result (status 'demo') so the UI works before the key is added.
// Set the secrets to switch to real verification.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLIPOK_API_KEY = Deno.env.get("SLIPOK_API_KEY") ?? "";
const SLIPOK_BRANCH_ID = Deno.env.get("SLIPOK_BRANCH_ID") ?? "";

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
  if (!slipUrl) return json({ ok: false, error: "NO_SLIP" });

  const nowIso = new Date().toISOString();

  // ── DEMO MODE — no SlipOK key yet ──────────────────────────────────────────
  if (!SLIPOK_API_KEY || !SLIPOK_BRANCH_ID) {
    const data = {
      mode: "demo",
      amount: expectedAmount,
      expectedAmount,
      amountMatches: true,
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
    const imgRes = await fetch(slipUrl);
    if (!imgRes.ok) return json({ ok: false, error: "SLIP_FETCH_FAILED" });
    const blob = await imgRes.blob();

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
    const receiverAcct =
      ((receiver.account ?? {}) as Record<string, unknown>).value ??
      receiver.displayName ??
      null;
    const sender = (d.sender ?? {}) as Record<string, unknown>;
    const senderName = sender.displayName ?? sender.name ?? null;

    const status = ok
      ? amountMatches
        ? "verified"
        : "amount_mismatch"
      : code === 1012
        ? "duplicate"
        : "failed";

    const data = {
      mode: "live",
      amount: Number.isFinite(amount) ? amount : null,
      expectedAmount,
      amountMatches,
      receiver: receiverAcct,
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
