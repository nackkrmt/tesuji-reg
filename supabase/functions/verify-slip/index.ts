// verify-slip — verify a payment slip via the SlipOK API, server-side, so the
// SlipOK key never reaches the browser. Gated by the same admin passphrase as
// the other admin RPCs (app_config.admin_secret).
//
// Request (POST JSON): { batchId, adminSecret }
// Response (always HTTP 200): { ok, status, data } | { ok: false, error }
//   status: 'verified' | 'amount_mismatch' | 'receiver_mismatch' | 'duplicate'
//         | 'failed' | 'demo'
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

// ── receiver matching ───────────────────────────────────────────────────────
// SlipOK masks the receiver (e.g. "x-xxxx-1234-x"), so we compare only the
// VISIBLE digit runs against the tournament's configured account. Conservative:
// we assert a mismatch only for personal proxies (phone / national id) where the
// expected number is exact. For a merchant QR the receiving bank-account differs
// from the QR's biller id, so we never auto-reject — only confirm or leave
// "unknown" and rely on SlipOK's branch-account binding + the admin's eyes.
function expectedReceiverDigits(
  type: string,
  value: string,
): { haystack: string; strict: boolean } {
  const v = (value ?? "").trim();
  if (type === "phone") {
    const d = v.replace(/\D/g, "");
    const intl = "66" + d.replace(/^0/, ""); // PromptPay encodes 0xx… as 66xx…
    return { haystack: d + "|" + intl, strict: true };
  }
  if (type === "national_id") {
    return { haystack: v.replace(/\D/g, ""), strict: true };
  }
  // merchant_qr (or unknown): every digit in the QR payload as a loose haystack
  // — enough to CONFIRM a match, never strict enough to assert a mismatch.
  return { haystack: v.replace(/\D/g, ""), strict: false };
}

/** Longest run of >=4 consecutive visible digits across the given values. */
function longestDigitRun(...vals: Array<unknown>): string {
  let best = "";
  for (const v of vals) {
    for (const run of String(v ?? "").match(/\d{4,}/g) ?? []) {
      if (run.length > best.length) best = run;
    }
  }
  return best;
}

/** true = receiver confirmed, false = clear mismatch, null = can't tell. */
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

    // Did the money land in the tournament's account? (null = couldn't tell)
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
