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
  // live_match / live_standing events arrive for every tournament (no
  // tournament column to filter on server-side), so the division ids of the
  // board currently loaded are what tells a foreign event from ours.
  const divisionIds = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!tournamentId) {
      divisionIds.current = new Set();
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
      divisionIds.current = new Set(ids);
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
    // While the channel is not up, poll: a realtime hiccup used to leave the
    // admin board frozen on stale data with nothing on screen to say so, and
    // this page is what an organiser watches during a round upload.
    let fallback: ReturnType<typeof setInterval> | null = setInterval(() => void load(), 30_000);
    const stopFallback = () => {
      if (fallback) { clearInterval(fallback); fallback = null; }
    };
    const unsub = subscribeLive(tournamentId, refetch, {
      belongsToScope: (divisionId) =>
        !divisionId || divisionIds.current.size === 0 || divisionIds.current.has(divisionId),
      onStatus: (status) => {
        if (status === "subscribed") {
          stopFallback();
          // A write between load()'s SELECT and the channel joining produced no
          // event we could see; one refetch on join closes that window.
          refetch();
          setError(null);
        } else {
          setError("realtime connection lost — refreshing every 30s");
          if (!fallback) fallback = setInterval(() => void load(), 30_000);
        }
      },
    });
    return () => {
      unsub();
      stopFallback();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [tournamentId, load, refetch]);

  return { divisions, matches, standings, loading, error, refetch };
}
