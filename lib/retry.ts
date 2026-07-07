/**
 * Auto-retry for transient failures (network blips, rate limits, server-busy)
 * with exponential backoff + jitter.
 *
 * Why jitter: if a few hundred clients all fail at the same instant (e.g. the
 * moment registration opens) and retry on a fixed delay, they stampede the
 * server again in sync. Randomising each client's wait spreads the retries out.
 *
 * IMPORTANT: only safe to wrap around READS (idempotent — re-running has no
 * side effect), or writes whose RPC is itself idempotent (e.g. submit_registration,
 * which just returns the current state when the batch is already past
 * pending_payment). Do NOT blanket-wrap non-idempotent writes like reserve_seats:
 * a write may have succeeded on the server with only the response lost, so
 * retrying could double-book a seat. Those use a user-triggered "try again" instead.
 */

const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const TRANSIENT_PATTERNS = [
  "failed to fetch", // Chrome network failure
  "load failed", // Safari network failure
  "networkerror", // Firefox
  "network request failed",
  "fetch failed",
  "timeout",
  "timed out",
  "econnreset",
  "econnrefused",
  "etimedout",
  "rate limit",
  "too many requests",
  "service unavailable",
  "temporarily unavailable",
  "bad gateway",
  "gateway timeout",
];

/**
 * True for errors worth retrying. By the time a Supabase error reaches the UI
 * the data layer has often wrapped it as `new Error(message)`, so we sniff both
 * structured status codes and the message text. Conservative by design — when
 * unsure we treat it as permanent and fail fast (no pointless retries on
 * validation / "เต็มแล้ว" / auth errors).
 */
export function isTransientError(err: unknown): boolean {
  if (err == null) return false;
  // A failed fetch throws a TypeError before any HTTP status exists.
  if (err instanceof TypeError) return true;

  const e = err as {
    name?: string;
    status?: number;
    statusCode?: number;
    code?: string | number;
    message?: string;
  };
  // An explicit cancel (aborted request / unmounted component) is not transient.
  if (e.name === "AbortError") return false;

  const status =
    typeof e.status === "number"
      ? e.status
      : typeof e.statusCode === "number"
        ? e.statusCode
        : undefined;
  if (status != null && TRANSIENT_STATUS.has(status)) return true;

  const msg = (e.message ?? String(err)).toLowerCase();
  if (/\b(408|425|429|500|502|503|504)\b/.test(msg)) return true;
  return TRANSIENT_PATTERNS.some((p) => msg.includes(p));
}

export interface RetryOptions {
  /** Total attempts including the first (default 4). */
  attempts?: number;
  /** Backoff for the first retry, doubled each round (default 400ms). */
  baseDelayMs?: number;
  /** Upper bound for a single wait (default 4000ms). */
  maxDelayMs?: number;
  /** Decide whether a given error is worth retrying (default isTransientError). */
  shouldRetry?: (err: unknown) => boolean;
  /** Bail out between attempts — e.g. () => !active when a component unmounts. */
  isCancelled?: () => boolean;
  /** Observe each retry (logging / UI hint). */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

/** Run `fn`, retrying transient failures with backoff + jitter. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 4,
    baseDelayMs = 400,
    maxDelayMs = 4000,
    shouldRetry = isTransientError,
    isCancelled,
    onRetry,
  } = opts;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (isCancelled?.()) throw lastError ?? new DOMException("cancelled", "AbortError");
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= attempts || !shouldRetry(err) || isCancelled?.()) throw err;
      // Equal jitter: half fixed backoff (guarantees it grows) + half random
      // (de-syncs clients). e.g. 400ms cap → wait somewhere in [200, 400)ms.
      const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delayMs = cap / 2 + Math.random() * (cap / 2);
      onRetry?.({ attempt, delayMs, error: err });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
