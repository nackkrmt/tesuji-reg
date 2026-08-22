-- ── Live results: tournament scoping (expand step) ──────────────────────────
-- The live subsystem predates multi-tournament and had no tournament
-- dimension. This adds one, additively:
--   • live_division.tournament_id (nullable FK; on delete set null so wiping
--     a tournament never breaks a running board).
--   • Backfill existing divisions to the newest published tournament (the
--     only one they could have belonged to).
--   • A 5-arg live_upsert_division overload that records the tournament; the
--     4-arg version stays for the deployed uploader until contract time. A
--     null p_tournament_id never clears an existing assignment.
-- live_match / live_standing reach the tournament through their division_id.
-- /live (unscoped) keeps showing every division; /live/<tid> and
-- /live/snapshot?t=<tid> filter on this column.

alter table live_division
  add column if not exists tournament_id uuid references tournament(id) on delete set null;

create index if not exists live_division_tournament_idx
  on live_division(tournament_id);

update live_division
   set tournament_id = (
     select id from tournament
      where status = 'published'
      order by updated_at desc
      limit 1
   )
 where tournament_id is null;

create or replace function public.live_upsert_division(
  p_secret text, p_id text, p_name text, p_sort int, p_tournament_id uuid
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;
  insert into live_division (id, name, sort_order, tournament_id)
  values (
    p_id, p_name,
    coalesce(nullif(p_sort, 0), nullif(substring(p_id from '^[0-9]{1,6}'), '')::int, 1000000),
    p_tournament_id
  )
  on conflict (id) do update
    set name = excluded.name,
        sort_order = excluded.sort_order,
        tournament_id = coalesce(excluded.tournament_id, live_division.tournament_id);
end; $$;

grant execute on function
  public.live_upsert_division(text, text, text, int, uuid)
to anon, authenticated;
