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
import { dataLayer } from "./index";
import type { DataLayer, StoreTopic } from "./types";
import { withRetry } from "@/lib/retry";

const Ctx = createContext<DataLayer>(dataLayer);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Periodic expiry sweep so idle categories show accurate "remaining".
    const id = window.setInterval(() => {
      dataLayer.refreshExpired().catch(() => {
        /* best-effort sweep; next tick retries */
      });
    }, 30_000);
    // Dev-only: expose the data layer for debugging / scripted checks.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__dataLayer = dataLayer;
    }
    return () => window.clearInterval(id);
  }, []);

  return <Ctx.Provider value={dataLayer}>{children}</Ctx.Provider>;
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
        if (isCurrent()) setError(e as Error);
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
