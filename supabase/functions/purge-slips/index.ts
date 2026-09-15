// purge-slips — the retention job the privacy notice promises and the system
// never had.
//
// th.ts keepNoAutoBody tells registrants their slips and bank details are kept
// "as long as the organiser needs them", with no end date and no scheduled
// deletion. That was literally true: the only slip deletion in the product is
// the whole-group Danger Zone reset, which also destroys the registrations, so
// in practice nothing was ever deleted. 124 payment slips and four refund bank
// accounts from a tournament that finished on 2026-08-09 are still on disk.
// This function is the bounded half of that promise: once a tournament has been
// closed for RETENTION_DAYS, its slip images go, the columns that pointed at
// them are nulled, and the bank fields of resolved refunds are blanked.
//
// It replaces a 410 stub of the same name (a one-off purge from 2026-07 that
// was neutralized rather than deleted) — same deployed entry point, real
// behaviour.
//
// The retention clock runs from tournament.competition_date, not from when the
// status was flipped: there is no closed_at column, and the day the games were
// played is the date the notice talks about anyway. A tournament must ALSO be
// status='closed' — a published event is never touched no matter how old its
// date is.
//
// DRY RUN BY DEFAULT. A call with no body reports exactly what it would delete
// and deletes nothing; { "apply": true } is what actually removes files.
//
// Gated like verify-slip / admin-reset: the caller's Supabase Auth JWT must
// belong to an admin. A bearer token that IS the service-role key is also
// accepted, so the job can be driven by a scheduler (pg_cron + pg_net, or a
// GitHub Actions cron) that has no user to sign in as.
//
// Request (POST JSON, every field optional):
//   { apply?: boolean,        // false/absent = dry run
//     days?: number,          // retention window, default 90, minimum 30
//     tournamentId?: string } // limit to one closed tournament
//
// Response: { ok, dryRun, cutoffDate, tournaments, slips, rows, bank }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SLIP_BUCKET = "tesuji-slips";
const DEFAULT_RETENTION_DAYS = 90;
// Below a month this stops being retention and becomes a way to destroy the
// payment evidence for an event whose refunds are still being argued about.
const MIN_RETENTION_DAYS = 30;
const PAGE = 1000;

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

/** Read every row of a PostgREST query, a page at a time. A single GET stops at
 *  max_rows (1000) and would leave the rest of a big event behind. */
async function pgGetAll(query: string): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    });
    if (!res.ok) throw new Error(`db read failed (${res.status})`);
    const batch = (await res.json()) as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

/** PATCH every row matching `query`; returns the number of rows changed. */
async function pgPatch(query: string, patch: Record<string, unknown>): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`db write failed (${res.status})`);
  return ((await res.json()) as unknown[]).length;
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
  const rows = await pgGetAll(
    `account_roles?account_id=eq.${encodeURIComponent(uid)}&role=eq.admin&select=account_id`,
  );
  return rows.length > 0;
}

/** A scheduler presenting the service-role key itself. Knowing that key already
 *  grants everything this function does, so accepting it adds no authority. */
function isServiceRoleCaller(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  return auth.replace(/^bearer /i, "").trim() === SERVICE_ROLE;
}

// ── slip refs ────────────────────────────────────────────────────────────────
/** Same rule verify-slip uses: a slip ref is a bare object path in the private
 *  bucket. Legacy full public URLs predate that bucket and are reported rather
 *  than passed to the Storage API, which would just fail on them. */
function isPrivatePath(ref: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(ref);
}

async function deleteObjects(names: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < names.length; i += 500) {
    const chunk = names.slice(i, i + 500);
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${SLIP_BUCKET}`, {
      method: "DELETE",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: chunk }),
    });
    if (!res.ok) throw new Error(`storage delete failed (${res.status})`);
    removed += chunk.length;
  }
  return removed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  // An empty body is a valid request: it means "dry run, default window".
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "BAD_REQUEST" });
  }

  // gate: a signed-in admin, or the scheduler holding the service-role key.
  if (!isServiceRoleCaller(req)) {
    const uid = await getCallerUid(req);
    if (!uid) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
    if (!(await isUidAdmin(uid))) return json({ ok: false, error: "UNAUTHORIZED" }, 403);
  }

  const apply = body.apply === true;
  const days = Number.isFinite(body.days as number)
    ? Math.floor(body.days as number)
    : DEFAULT_RETENTION_DAYS;
  if (days < MIN_RETENTION_DAYS) {
    return json({ ok: false, error: "RETENTION_TOO_SHORT", minimumDays: MIN_RETENTION_DAYS });
  }
  const tournamentId =
    typeof body.tournamentId === "string" && body.tournamentId.length > 0
      ? body.tournamentId
      : null;
  if (
    tournamentId !== null &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tournamentId)
  ) {
    return json({ ok: false, error: "BAD_TOURNAMENT_ID" });
  }

  const cutoff = new Date(Date.now() - days * 86_400_000);
  // tournament.competition_date is text in ISO date shape, so a lexicographic
  // comparison is the date comparison.
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const cutoffTs = cutoff.toISOString();

  try {
    // 1) which tournaments are past their retention window
    const scope = tournamentId ? `&id=eq.${encodeURIComponent(tournamentId)}` : "";
    const tournaments = (
      await pgGetAll(
        `tournament?status=eq.closed&competition_date=lt.${cutoffDate}${scope}&select=id,competition_date`,
      )
    ).map((t) => ({ id: String(t.id), competitionDate: String(t.competition_date) }));

    if (tournaments.length === 0) {
      return json({
        ok: true,
        dryRun: !apply,
        cutoffDate,
        tournaments: [],
        slips: { found: 0, unsupported: 0, deleted: 0 },
        rows: {},
        bank: {},
      });
    }
    const ids = `(${tournaments.map((t) => t.id).join(",")})`;

    // 2) every slip object those tournaments still reference
    const refs = new Set<string>();
    const unsupported: string[] = [];
    const collect = (v: unknown) => {
      if (typeof v !== "string" || v === "") return;
      if (isPrivatePath(v)) refs.add(v);
      else unsupported.push(v);
    };
    for (const row of await pgGetAll(
      `registration_batch?tournament_id=in.${ids}&payment_slip_url=not.is.null&select=payment_slip_url`,
    )) collect(row.payment_slip_url);
    for (const row of await pgGetAll(
      `seat_withdrawal?tournament_id=in.${ids}&refund_slip_url=not.is.null&select=refund_slip_url`,
    )) collect(row.refund_slip_url);
    for (const row of await pgGetAll(
      `seat_division_change?tournament_id=in.${ids}&select=payment_slip_url,refund_slip_url`,
    )) {
      collect(row.payment_slip_url);
      collect(row.refund_slip_url);
    }

    // 3) how many refund bank records have been resolved long enough to blank.
    //    seat_withdrawal's bank_* columns are NOT NULL, so scrubbing writes an
    //    empty string there; seat_division_change's are nullable.
    //    Scrubbing is idempotent — a row whose bank fields are already blank is
    //    simply rewritten — so the scope filters on the retention window only,
    //    and the reported count is "rows in scope", not "rows changed today".
    const withdrawalScope =
      `seat_withdrawal?tournament_id=in.${ids}&resolved_at=lt.${encodeURIComponent(cutoffTs)}`;
    const changeScope =
      `seat_division_change?tournament_id=in.${ids}&resolved_at=lt.${encodeURIComponent(cutoffTs)}` +
      `&bank_account_no=not.is.null`;
    const withdrawals = await pgGetAll(`${withdrawalScope}&select=id`);
    const changes = await pgGetAll(`${changeScope}&select=id`);

    if (!apply) {
      return json({
        ok: true,
        dryRun: true,
        cutoffDate,
        tournaments,
        slips: { found: refs.size, unsupported: unsupported.length, deleted: 0 },
        rows: { wouldClearSlipColumns: refs.size },
        bank: { seat_withdrawal: withdrawals.length, seat_division_change: changes.length },
        note: "nothing was deleted — re-send with { \"apply\": true }",
      });
    }

    // 4) files first, columns second. The columns are the only index of which
    //    objects belong to whom; nulling them before the delete succeeds would
    //    strand the files in the bucket with nothing pointing at them.
    const deleted = refs.size > 0 ? await deleteObjects([...refs]) : 0;

    const rows = {
      registration_batch: await pgPatch(
        `registration_batch?tournament_id=in.${ids}&payment_slip_url=not.is.null&select=id`,
        { payment_slip_url: null },
      ),
      seat_withdrawal: await pgPatch(
        `seat_withdrawal?tournament_id=in.${ids}&refund_slip_url=not.is.null&select=id`,
        { refund_slip_url: null },
      ),
      seat_division_change: await pgPatch(
        `seat_division_change?tournament_id=in.${ids}&or=(payment_slip_url.not.is.null,refund_slip_url.not.is.null)&select=id`,
        { payment_slip_url: null, refund_slip_url: null },
      ),
    };

    const bank = {
      seat_withdrawal: await pgPatch(`${withdrawalScope}&select=id`, {
        bank_name: "",
        bank_account_no: "",
        bank_account_name: "",
      }),
      seat_division_change: await pgPatch(`${changeScope}&select=id`, {
        bank_name: null,
        bank_account_no: null,
        bank_account_name: null,
      }),
    };

    return json({
      ok: true,
      dryRun: false,
      cutoffDate,
      tournaments,
      slips: { found: refs.size, unsupported: unsupported.length, deleted },
      rows,
      bank,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message });
  }
});
