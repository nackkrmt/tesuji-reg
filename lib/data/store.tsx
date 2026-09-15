"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { dataLayer, isMockBackend } from "./index";
import type { DataLayer, StoreTopic } from "./types";
import { withRetry } from "@/lib/retry";

const Ctx = createContext<DataLayer>(dataLayer);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Periodic expiry sweep so idle categories show accurate "remaining".
    // Mock only: on Supabase the sweep is pg_cron plus the lazy release every
    // read RPC already does, so refreshExpired() there is a no-op that was
    // waking a timer in every open tab.
    const id = isMockBackend
      ? window.setInterval(() => {
          dataLayer.refreshExpired().catch(() => {
            /* best-effort sweep; next tick retries */
          });
        }, 30_000)
      : null;
    // Dev-only: expose the data layer for debugging / scripted checks.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__dataLayer = dataLayer;
    }
    return () => {
      if (id != null) window.clearInterval(id);
    };
  }, []);

  return <Ctx.Provider value={dataLayer}>{children}</Ctx.Provider>;
}

// ── central query-failure reporting ─────────────────────────────────────────
// A permanent read failure used to be invisible: nearly every useLiveQuery call
// site destructures only { data, loading } and renders `data ?? []`, so an RLS
// 403, a 500 or a PostgREST error paints a convincing empty state — "ยังไม่มี
// รายการ" over a query that never answered, with the admin concluding nobody
// registered. Patching the call sites one by one would only leave the next one
// silent, so the hook reports here instead and one installed handler surfaces
// it. The per-site `error` stays for screens that want their own retry UI.
type QueryErrorReporter = (error: Error) => void;

let queryErrorReporter: QueryErrorReporter | null = null;

/** Install the app-wide handler for failed live queries; returns the uninstall.
 *  Must be called from inside the Toast provider (AppStoreProvider sits above
 *  it), which is why GlassDock — mounted on every route — does it. */
export function setQueryErrorReporter(
  reporter: QueryErrorReporter,
): () => void {
  queryErrorReporter = reporter;
  return () => {
    if (queryErrorReporter === reporter) queryErrorReporter = null;
  };
}

function reportQueryError(error: Error) {
  // There is no monitoring backend, so the console is the log.
  console.error("live query failed", error);
  try {
    queryErrorReporter?.(error);
  } catch {
    /* a broken reporter must not take the query down with it */
  }
}

export function useDataLayer(): DataLayer {
  return useContext(Ctx);
}

export interface LiveQuery<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Runs an async query against the DataLayer and re-runs whenever the store
 * changes (in-tab mutations or cross-tab `storage` events) or `deps` change.
 *
 * Pass `topics` to only re-run when a mutation tagged with one of those
 * domains fires (untagged/broadcast changes still re-run everything). Omit it
 * for the safe default of re-running on every store change.
 */
export function useLiveQuery<T>(
  run: (dl: DataLayer) => Promise<T>,
  deps: unknown[] = [],
  topics?: readonly StoreTopic[],
): LiveQuery<T> {
  const dl = useDataLayer();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const loadedRef = useRef(false);
  // Monotonic id of the newest exec(). A run only applies its result while it
  // is still the latest — a slower, older request resolving after a newer one
  // (or after unmount) is discarded instead of clobbering fresh data.
  const runIdRef = useRef(0);

  const exec = useCallback(() => {
    const id = ++runIdRef.current;
    const isCurrent = () => runIdRef.current === id;
    if (!loadedRef.current) setLoading(true);
    // Reads are idempotent, so auto-retry transient failures (network blips,
    // rate limits, server-busy) with backoff before surfacing an error — this
    // is what keeps page loads smooth during a registration-open rush.
    withRetry(() => runRef.current(dl), { isCancelled: () => !isCurrent() })
      .then((d) => {
        if (!isCurrent()) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        // Not current → the run was superseded or the component unmounted
        // (withRetry rejects with an AbortError then); nothing failed.
        if (!isCurrent()) return;
        setError(e as Error);
        reportQueryError(e as Error);
      })
      .finally(() => {
        if (!isCurrent()) return;
        setLoading(false);
        loadedRef.current = true;
      });
  }, [dl]);

  const topicsRef = useRef(topics);
  topicsRef.current = topics;

  useEffect(() => {
    exec();
    const unsub = dl.subscribe(() => exec(), topicsRef.current);
    const runId = runIdRef;
    return () => {
      unsub();
      // Invalidate any in-flight run so it can't setState after unmount.
      runId.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: exec };
}
