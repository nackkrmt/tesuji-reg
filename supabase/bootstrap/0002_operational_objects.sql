-- Operational objects, recovered from production.
--
-- These were created through the Supabase dashboard and live in no migration,
-- so an environment rebuilt from this repo would come up subtly wrong: seat
-- holds would never expire on a timer, and the live board would not receive
-- realtime updates. Neither failure announces itself.
--
-- Captured from project ytgbimtjayecaxfyssta on 2026-08-30.
-- Part of the fresh-environment bootstrap: schema-baseline → bootstrap →
-- migrations. Production already has all of this; do not apply it there.

-- ── pg_cron: expire abandoned seat holds ─────────────────────────────────────
-- A 15-minute hold that is never paid keeps its seats counted against capacity
-- until something releases them. Every RPC that reads a roster calls
-- release_expired_holds(<tournament>) opportunistically, but that only covers
-- tournaments somebody is actively looking at — an abandoned hold in a quiet
-- second tournament would hold its seat indefinitely. This job is what makes
-- expiry unconditional.
--
-- Note the argument-less call: release_expired_holds(p_tournament_id uuid
-- DEFAULT NULL) sweeps every tournament when called with no argument.
-- SupabaseDataLayer.refreshExpired() returns 0 and defers to this job, so
-- without it the 30s client timer in lib/data/store.tsx is a no-op.

create extension if not exists pg_cron with schema cron;

select cron.schedule(
  'release-expired-holds',
  '* * * * *',
  $$ select release_expired_holds(); $$
);

-- ── Realtime: the live-competition tables ────────────────────────────────────
-- lib/data/store.tsx subscribes to these to push pairings, results and
-- standings to the spectator board and the judge console without a reload.
-- 20260702_0001 adds them on a fresh install; re-stated here so the bootstrap
-- is self-contained and the intended membership is reviewable in one place.

alter publication supabase_realtime add table public.live_division;
alter publication supabase_realtime add table public.live_match;
alter publication supabase_realtime add table public.live_standing;
