"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listDivisions,
  listMatchesByDivisions,
  listStandingsByDivisions,
  subscribeLive,
} from "./client";
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

/** Loads ONE tournament's live competition data and keeps it fresh via
 *  Supabase Realtime. Any insert/update/delete on the live tables triggers a
 *  debounced, tournament-scoped refetch. `null` (no tournament chosen yet)
 *  yields empty data and is not loading. */
export function useLive(tournamentId: string | null): LiveData {
  const [divisions, setDivisions] = useState<LiveDivision[]>([]);
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [standings, setStandings] = useState<LiveStanding[]>([]);
  const [loading, setLoading] = useState(!!tournamentId);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!tournamentId) {
      setDivisions([]);
      setMatches([]);
      setStandings([]);
      setError(null);
      setLoading(false);
      return;
    }
    try {
      const d = await listDivisions(tournamentId);
      const ids = d.map((x) => x.id);
      const [m, s] = await Promise.all([
        listMatchesByDivisions(ids),
        listStandingsByDivisions(ids),
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
  }, [tournamentId]);

  const refetch = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    // Coalesce bursts of realtime events (a round upload fires many rows).
    timer.current = setTimeout(() => void load(), 150);
  }, [load]);

  useEffect(() => {
    setLoading(!!tournamentId);
    void load();
    if (!tournamentId) return;
    const unsub = subscribeLive(tournamentId, refetch);
    return () => {
      unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [tournamentId, load, refetch]);

  return { divisions, matches, standings, loading, error, refetch };
}
