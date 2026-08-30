-- ── Award XML append (/admin/awards) ─────────────────────────────────────────
-- Appends award rows produced by the MacMahon-XML import page. Unlike
-- admin_import_rank_database (replace-all per source, built for re-syncing the
-- whole master Google Sheet), this writes ONE tournament's medals on top of
-- what is already there. The master sheet stays the source of truth: the page
-- also hands the admin an .xlsx of the same rows to paste into the sheet, so a
-- later full sheet re-sync converges to the same data instead of losing it.
--
-- Idempotency: rows are keyed by (event_name, event_date, rank_in_category,
-- category) — re-importing a division of the same event replaces its previous
-- rows rather than duplicating them. `category` MUST be part of the key: one
-- event routinely runs sibling divisions sharing a rank label (e.g. "9x9
-- ทั่วไป" and "9x9 อายุไม่เกิน 12 ปี" both have rank_in_category "9x9"), and
-- without it importing one sibling would delete the other's medals. NULL and
-- '' compare equal here so a blank-field re-import still matches what it
-- wrote before.

create or replace function public.admin_append_award_rows(
  p_admin_secret text,
  p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_deleted integer;
  v_count integer;
  v_registry jsonb;
  v_propagation jsonb;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'ROWS_NOT_ARRAY'; end if;
  if jsonb_array_length(p_rows) = 0 then raise exception 'EMPTY_ROWS'; end if;

  delete from go_player_database g
   where g.source = 'award'
     and exists (
       select 1
         from jsonb_to_recordset(p_rows)
              as r(event_name text, event_date text, rank_in_category text, category text)
        where coalesce(g.event_name, '')       = coalesce(r.event_name, '')
          and coalesce(g.event_date, '')       = coalesce(r.event_date, '')
          and coalesce(g.rank_in_category, '') = coalesce(r.rank_in_category, '')
          and coalesce(g.category, '')         = coalesce(r.category, ''));
  get diagnostics v_deleted = row_count;

  insert into go_player_database (
    source, seq, prefix_th, first_name_th, last_name_th,
    first_name_th_normalized, last_name_th_normalized, rank, power_level, rating,
    year_promoted, diamond, category, rank_in_category, rank_award,
    event_name, event_date, raw_data, uploaded_at)
  select 'award', r.seq, r.prefix_th, r.first_name_th, r.last_name_th,
    r.first_name_th_normalized, r.last_name_th_normalized, r.rank, r.power_level, r.rating,
    r.year_promoted, r.diamond, r.category, r.rank_in_category, r.rank_award,
    r.event_name, r.event_date, r.raw_data, now()
  from jsonb_to_recordset(p_rows) as r(
    seq text, prefix_th text, first_name_th text, last_name_th text,
    first_name_th_normalized text, last_name_th_normalized text, rank text,
    power_level integer, rating numeric, year_promoted integer, diamond text,
    category text, rank_in_category text, rank_award integer,
    event_name text, event_date text, raw_data jsonb)
  where r.first_name_th is not null and r.last_name_th is not null
    and r.first_name_th_normalized is not null and r.last_name_th_normalized is not null
    and r.rank_award between 1 and 10;
  get diagnostics v_count = row_count;

  -- same post-insert steps + order as admin_import_rank_database
  v_registry    := public._refresh_go_person_registry();
  v_propagation := public._propagate_person_ranks();

  return jsonb_build_object('ok', true, 'imported', v_count, 'replaced', v_deleted)
         || v_registry || v_propagation;
end; $$;

revoke execute on function public.admin_append_award_rows(text,jsonb) from public, anon;
grant  execute on function public.admin_append_award_rows(text,jsonb) to authenticated;
