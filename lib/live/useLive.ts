"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listDivisions, listMatches, listStandings, subscribeLive } from "./client";
import type { LiveDivision, LiveMatch, LiveStanding } from "./types";

export interface LiveData {
  divisions: LiveDivision[];
  matches: LiveMatch[];
  standings: LiveStanding[];
  loading: boolean;
  error: string | null;
  /** Manual refetch (also called automatically on realtime events). */
  refetch: () => void;
}

/** Loads all live competition data and keeps it fresh via Supabase Realtime.
 *  Any insert/update/delete on the live tables triggers a debounced refetch. */
export function useLive(): LiveData {
  const [divisions, setDivisions] = useState<LiveDivision[]>([]);
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [standings, setStandings] = useState<LiveStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, m, s] = await Promise.all([
        listDivisions(),
        listMatches(),
        listStandings(),
      ]);
      setDivisions(d);
      setMatches(m);
      setStandings(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    // Coalesce bursts of realtime events (a round upload fires many rows).
    timer.current = setTimeout(() => void load(), 150);
  }, [load]);

  useEffect(() => {
    void load();
    const unsub = subscribeLive(refetch);
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load, refetch]);

  return { divisions, matches, standings, loading, error, refetch };
}
