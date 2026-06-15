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
import type { DataLayer } from "./types";

const Ctx = createContext<DataLayer>(dataLayer);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Periodic expiry sweep so idle categories show accurate "remaining".
    const id = window.setInterval(() => {
      void dataLayer.refreshExpired();
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
 */
export function useLiveQuery<T>(
  run: (dl: DataLayer) => Promise<T>,
  deps: unknown[] = [],
): LiveQuery<T> {
  const dl = useDataLayer();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  const loadedRef = useRef(false);

  const exec = useCallback(() => {
    let active = true;
    if (!loadedRef.current) setLoading(true);
    runRef
      .current(dl)
      .then((d) => {
        if (!active) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (active) setError(e as Error);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        loadedRef.current = true;
      });
    return () => {
      active = false;
    };
  }, [dl]);

  useEffect(() => {
    const cleanup = exec();
    const unsub = dl.subscribe(() => exec());
    return () => {
      cleanup();
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: exec };
}
