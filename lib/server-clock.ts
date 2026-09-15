// The 15-minute seat hold is the only place in the app where being wrong about
// the time costs money. `expiresAt` comes from Postgres; the countdown used to
// compare it against `Date.now()`, so a device whose clock runs slow displayed
// time remaining after pg_cron had already swept the hold — the registrant
// scanned the PromptPay QR, transferred, and only then found the seats gone.
//
// reserve_seats and get_batch_public both return `serverNow` (20260915_0002 /
// _0006). Recording the difference the moment a response lands — not inside the
// timer, where the value may already be minutes old and its own age unknown —
// gives every consumer one clock to ask.
//
// Deliberately not exact: the offset absorbs one leg of network latency, which
// makes it pessimistic by tens of milliseconds against a fifteen-minute
// deadline. It also stays 0 on the mock backend, where the device clock IS the
// server clock.

let offsetMs = 0;
let haveOffset = false;

/** Record the server's clock from a response that carries `serverNow`. Safe to
 *  call with anything: a missing or unparseable value leaves the offset alone,
 *  so an older backend simply keeps the device clock. */
export function noteServerNow(iso: unknown): void {
  if (typeof iso !== "string" || !iso) return;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return;
  offsetMs = t - Date.now();
  haveOffset = true;
}

/** `Date.now()` corrected to the server's clock, or the device's if no response
 *  has reported one yet. */
export function serverNowMs(): number {
  return Date.now() + offsetMs;
}

/** Whether a server clock has actually been observed. Only useful for telling
 *  "in sync" apart from "assumed in sync" in diagnostics. */
export function hasServerClock(): boolean {
  return haveOffset;
}

/** Test seam: forget the recorded offset. */
export function resetServerClock(): void {
  offsetMs = 0;
  haveOffset = false;
}
