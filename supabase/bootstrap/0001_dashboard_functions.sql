-- Dashboard-era functions, recovered from production.
--
-- These 26 functions run in production but were authored in the Supabase SQL
-- editor and never captured in supabase/migrations/, so `supabase db reset` or
-- a fresh project could not reproduce a working backend. Dumped with
-- pg_get_functiondef() from project ytgbimtjayecaxfyssta on 2026-08-30 and
-- verified byte-for-byte against the source (md5 of each dump batch compared
-- against md5() computed in the database).
--
-- Apply order for a fresh environment:
--   1. supabase/schema-baseline.sql   (tables, types, RLS, buckets)
--   2. this file                      (the functions below)
--   3. supabase/migrations/*.sql      (in filename order)
-- The SQL-language functions here reference tables, so step 1 is required
-- first; the plpgsql ones are not body-checked at creation time.
--
-- On the grants at the end: almost every function carries EXECUTE for PUBLIC.
-- That is PostgreSQL's default on CREATE FUNCTION, not a decision — the bodies
-- all gate on _is_admin()/auth.uid() internally. Reproduced faithfully so this
-- file matches production; tightening them is a separate migration.
--
-- Regenerate with scripts/dump-prod-functions.sql.

CREATE OR REPLACE FUNCTION public._batch_json(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'batch', to_jsonb(b) || jsonb_build_object(
      'owner_name', (
        select nullif(trim(
          (case when p.title_prefix::text = 'อื่นๆ'
                then coalesce(p.title_custom, '')
                else coalesce(p.title_prefix::text, '') end)
          || coalesce(p.first_name_th, '')
          || (case when p.has_middle_name and coalesce(p.middle_name_th, '') <> ''
                   then ' ' || p.middle_name_th else '' end)
          || ' ' || coalesce(p.last_name_th, '')
        ), '')
        from profile p where p.id = b.account_id
      ),
      'owner_email', (
        select u.email from auth.users u where u.id = b.account_id
      )
    ),
    'seats', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at)
                       from registration_seat s where s.batch_id = b.id), '[]'::jsonb),
    'hold',  (select to_jsonb(h) from seat_hold h where h.id = b.hold_id)
  ) from registration_batch b where b.id = p_batch_id;
$function$;

CREATE OR REPLACE FUNCTION public.admin_category_stats(p_admin_secret text, p_tournament_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  perform release_expired_holds(p_tournament_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'categoryId', c.id, 'capacity', c.capacity,
      'remaining', greatest(0, c.capacity - c.seats_taken),
      'confirmed', coalesce(cf.cnt, 0),
      'held', greatest(0, c.seats_taken - coalesce(cf.cnt, 0))))
    from category c
    left join (
      select s.category_id, count(*)::int cnt from registration_seat s
      join registration_batch b on b.id = s.batch_id
      where b.status = 'confirmed' and s.withdrawn_at is null group by s.category_id
    ) cf on cf.category_id = c.id
    where c.tournament_id = p_tournament_id
  ), '[]'::jsonb);
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_clear_categories(p_admin_secret text, p_tournament_id uuid, p_confirm text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text; v_n int;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  select name_th into v_name from tournament where id = p_tournament_id;
  if v_name is null then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if btrim(coalesce(p_confirm,'')) <> btrim(v_name) then raise exception 'CONFIRM_MISMATCH'; end if;
  delete from registration_batch where tournament_id = p_tournament_id;
  delete from seat_hold where tournament_id = p_tournament_id;
  select count(*) into v_n from category where tournament_id = p_tournament_id;
  delete from category where tournament_id = p_tournament_id; -- cascades any leftovers
  return v_n;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_clear_registrations(p_admin_secret text, p_tournament_id uuid, p_confirm text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text; v_n int;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  select name_th into v_name from tournament where id = p_tournament_id;
  if v_name is null then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if btrim(coalesce(p_confirm,'')) <> btrim(v_name) then raise exception 'CONFIRM_MISMATCH'; end if;
  select count(*) into v_n from registration_batch where tournament_id = p_tournament_id;
  delete from registration_batch where tournament_id = p_tournament_id; -- cascades seats + holds
  delete from seat_hold where tournament_id = p_tournament_id;          -- any stragglers
  update category set seats_taken = 0, updated_at = now() where tournament_id = p_tournament_id;
  return v_n;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_delete_batch(p_admin_secret text, p_batch_id uuid, p_admin_id text DEFAULT 'admin'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_exists uuid; v_hold seat_hold;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  select id into v_exists from registration_batch where id = p_batch_id;
  if v_exists is null then raise exception 'BATCH_NOT_FOUND'; end if;

  select h.* into v_hold from seat_hold h
    join registration_batch b on b.hold_id = h.id where b.id = p_batch_id for update;
  if v_hold.id is not null and v_hold.status in ('active', 'consumed') then
    update category c set seats_taken = greatest(0, c.seats_taken - l.seats), updated_at = now()
      from seat_hold_line l where l.hold_id = v_hold.id and c.id = l.category_id;
    update seat_hold set status = 'released', released_at = now() where id = v_hold.id;
  end if;

  update registration_batch set status = 'cancelled', updated_at = now() where id = p_batch_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_delete_tournament(p_admin_secret text, p_tournament_id uuid, p_confirm text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  select name_th into v_name from tournament where id = p_tournament_id;
  if v_name is null then raise exception 'TOURNAMENT_NOT_FOUND'; end if;
  if btrim(coalesce(p_confirm,'')) <> btrim(v_name) then raise exception 'CONFIRM_MISMATCH'; end if;
  delete from registration_batch where tournament_id = p_tournament_id;
  delete from seat_hold where tournament_id = p_tournament_id;
  delete from category where tournament_id = p_tournament_id;
  delete from tournament where id = p_tournament_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_institute_counts(p_admin_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_object_agg(institute_id, c) from (
      select s.institute_id as institute_id, count(*) as c
      from public.registration_seat s
      join public.registration_batch b on b.id = s.batch_id
      where s.institute_id is not null
        and b.status in ('pending_payment','pending_review','confirmed')
      group by s.institute_id
    ) t
  ), '{}'::jsonb);
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_list_institutes(p_admin_secret text)
 RETURNS SETOF go_institute
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  return query select * from public.go_institute order by active desc, name_th;
end; $function$;

CREATE OR REPLACE FUNCTION public.admin_list_registrations(p_admin_secret text, p_tournament_id uuid, p_status text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  perform release_expired_holds(p_tournament_id);
  return coalesce((
    select jsonb_agg(_batch_json(b.id) order by b.created_at desc)
    from registration_batch b
    where b.tournament_id = p_tournament_id and b.status <> 'cancelled'
      and (p_status = 'all' or b.status = p_status::registration_status)
  ), '[]'::jsonb);
end; $function$;

CREATE OR REPLACE FUNCTION public.confirm_registration(p_batch_id uuid, p_admin_secret text, p_admin_id text DEFAULT 'admin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_batch registration_batch;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  update registration_batch set status = 'confirmed', reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now()
    where id = p_batch_id and status = 'pending_review' returning * into v_batch;
  if v_batch.id is null then raise exception 'NOT_PENDING_REVIEW'; end if;
  return _batch_json(p_batch_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.delete_category(p_admin_secret text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if exists(select 1 from category where id = p_id and seats_taken > 0) then
    raise exception 'CATEGORY_IN_USE';
  end if;
  delete from category where id = p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.delete_institute(p_admin_secret text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  update public.go_institute set active = false, updated_at = now() where id = p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.find_or_create_institute(p_name text)
 RETURNS go_institute
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_norm text; v_row public.go_institute;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_norm := lower(public.normalize_thai_name(p_name));
  if v_norm = '' then raise exception 'EMPTY_NAME'; end if;
  select * into v_row from public.go_institute where name_normalized = v_norm;
  if v_row.id is not null then
    if not v_row.active then
      update public.go_institute set active = true, updated_at = now()
        where id = v_row.id returning * into v_row;
    end if;
    return v_row;
  end if;
  insert into public.go_institute (name_th, name_normalized)
    values (btrim(p_name), v_norm) returning * into v_row;
  return v_row;
end; $function$;

CREATE OR REPLACE FUNCTION public.list_institute_merges(p_admin_secret text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'sourceName', source_name, 'targetName', target_name,
      'targetId', target_id, 'mergedAt', merged_at,
      'movedCount', coalesce(array_length(moved_profiles,1),0)
        + coalesce(array_length(moved_players,1),0)
        + coalesce(array_length(moved_seats,1),0)
    ) order by merged_at desc)
    from public.institute_merge where reversed_at is null
  ), '[]'::jsonb);
end; $function$;

CREATE OR REPLACE FUNCTION public.live_force_pairing(p_secret text, p_division_id text, p_round text, p_table text, p_new_black text, p_new_white text, p_remark text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not _is_live_writer(p_secret) then raise exception 'UNAUTHORIZED'; end if;

  -- Target row: apply the manual override + remark (result is left untouched).
  update live_match
     set black_force = p_new_black,
         white_force = p_new_white,
         remark      = coalesce(p_remark, ''),
         updated_at  = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;

  -- Other rows in the same round: if a player just placed on the target table was
  -- previously seated elsewhere, blank that seat out. Compare against the row's
  -- EFFECTIVE name (force override if present, else the system pairing).
  update live_match
     set black_force = 'ไม่มีผู้เข้าแข่งขัน', updated_at = now()
   where division_id = p_division_id and round = p_round and table_no <> p_table
     and coalesce(nullif(black_force, ''), black) in (p_new_black, p_new_white);

  update live_match
     set white_force = 'ไม่มีผู้เข้าแข่งขัน', updated_at = now()
   where division_id = p_division_id and round = p_round and table_no <> p_table
     and coalesce(nullif(white_force, ''), white) in (p_new_black, p_new_white);
end; $function$;

CREATE OR REPLACE FUNCTION public.merge_institute(p_admin_secret text, p_source_id uuid, p_target_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_src public.go_institute; v_tgt public.go_institute;
  v_profiles uuid[]; v_players uuid[]; v_seats uuid[];
  v_added text[]; v_merge_id uuid;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_source_id = p_target_id then raise exception 'SAME_INSTITUTE'; end if;
  select * into v_src from public.go_institute where id = p_source_id;
  select * into v_tgt from public.go_institute where id = p_target_id;
  if v_src.id is null or v_tgt.id is null then raise exception 'INSTITUTE_NOT_FOUND'; end if;

  select coalesce(array_agg(id), '{}') into v_profiles from public.profile where institute_id = p_source_id;
  select coalesce(array_agg(id), '{}') into v_players from public.managed_player where institute_id = p_source_id;
  select coalesce(array_agg(id), '{}') into v_seats from public.registration_seat where institute_id = p_source_id;

  -- aliases this merge will add to the target (source name + source keywords,
  -- minus anything the target already had)
  select coalesce(array_agg(distinct kw), '{}') into v_added from (
    select v_src.name_th as kw union select unnest(v_src.keywords)
  ) s where btrim(s.kw) <> '' and not (s.kw = any(v_tgt.keywords));

  update public.profile          set institute_id = p_target_id, institute_name = v_tgt.name_th where institute_id = p_source_id;
  update public.managed_player   set institute_id = p_target_id, institute_name = v_tgt.name_th where institute_id = p_source_id;
  update public.registration_seat set institute_id = p_target_id, institute_name = v_tgt.name_th where institute_id = p_source_id;

  update public.go_institute
    set keywords = coalesce((
      select array_agg(distinct kw) from (
        select unnest(v_tgt.keywords) as kw
        union select v_src.name_th
        union select unnest(v_src.keywords)
      ) s where btrim(s.kw) <> ''
    ), '{}'::text[]),
    updated_at = now()
    where id = p_target_id;

  delete from public.go_institute where id = p_source_id;

  insert into public.institute_merge (
    source_id, source_name, source_normalized, source_keywords, source_active,
    target_id, target_name, added_keywords, moved_profiles, moved_players, moved_seats
  ) values (
    v_src.id, v_src.name_th, v_src.name_normalized, v_src.keywords, v_src.active,
    p_target_id, v_tgt.name_th, v_added, v_profiles, v_players, v_seats
  ) returning id into v_merge_id;

  return jsonb_build_object('merge_id', v_merge_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.my_registrations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;

  -- keep statuses/remaining fresh for the tournaments this user has batches in
  perform release_expired_holds(t.id)
  from (
    select distinct tournament_id as id
    from registration_batch
    where account_id = v_uid
  ) t;

  return coalesce((
    select jsonb_agg(_batch_json(b.id) order by b.created_at desc)
    from registration_batch b
    where b.account_id = v_uid
      and b.status <> 'cancelled'
  ), '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_thai_name(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select replace(
    translate(
      regexp_replace(trim(coalesce(input, '')), '\s+', ' ', 'g'),
      'ศษณญภฎฏฑใ',
      'สสนยพดตทไ'
    ),
    '์',
    ''
  );
$function$;

CREATE OR REPLACE FUNCTION public.purge_institute(p_admin_secret text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_refs int;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  select
    (select count(*) from profile where institute_id = p_id)
    + (select count(*) from managed_player where institute_id = p_id)
    + (select count(*) from registration_seat where institute_id = p_id)
  into v_refs;
  if v_refs > 0 then raise exception 'INSTITUTE_IN_USE'; end if;
  delete from public.go_institute where id = p_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.reject_registration(p_batch_id uuid, p_admin_secret text, p_note text, p_admin_id text DEFAULT 'admin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_hold seat_hold; v_exists uuid;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  select id into v_exists from registration_batch where id = p_batch_id;
  if v_exists is null then raise exception 'BATCH_NOT_FOUND'; end if;
  select h.* into v_hold from seat_hold h
    join registration_batch b on b.hold_id = h.id where b.id = p_batch_id for update;
  if v_hold.id is not null and v_hold.status in ('active', 'consumed') then
    update category c set seats_taken = greatest(0, c.seats_taken - l.seats), updated_at = now()
      from seat_hold_line l where l.hold_id = v_hold.id and c.id = l.category_id;
    update seat_hold set status = 'released', released_at = now() where id = v_hold.id;
  end if;
  update registration_batch set status = 'rejected', admin_note = p_note,
    reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now() where id = p_batch_id;
  return _batch_json(p_batch_id);
end; $function$;

CREATE OR REPLACE FUNCTION public.release_expired_holds(p_tournament_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count int := 0; r record;
begin
  for r in
    select h.id from seat_hold h
    where h.status = 'active' and h.expires_at <= now()
      and (p_tournament_id is null or h.tournament_id = p_tournament_id)
    for update skip locked
  loop
    update category c set seats_taken = greatest(0, c.seats_taken - l.seats), updated_at = now()
      from seat_hold_line l where l.hold_id = r.id and c.id = l.category_id;
    update seat_hold set status = 'expired', released_at = now() where id = r.id;
    update registration_batch set status = 'expired', updated_at = now()
      where hold_id = r.id and status = 'pending_payment';
    v_count := v_count + 1;
  end loop;
  return v_count;
end; $function$;

CREATE OR REPLACE FUNCTION public.replace_go_player_database_source(p_admin_secret text, p_source text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count integer;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_source not in ('dan','kyu','award') then raise exception 'INVALID_SOURCE'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'ROWS_NOT_ARRAY'; end if;

  delete from go_player_database where source = p_source;

  insert into go_player_database (
    source, seq, prefix_th, first_name_th, last_name_th,
    first_name_th_normalized, last_name_th_normalized, rank, power_level, rating,
    year_promoted, diamond, category, rank_in_category, rank_award,
    event_name, event_date, raw_data, uploaded_at)
  select p_source, r.seq, r.prefix_th, r.first_name_th, r.last_name_th,
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
    and r.first_name_th_normalized is not null and r.last_name_th_normalized is not null;

  get diagnostics v_count = row_count;
  return v_count;
end; $function$;

CREATE OR REPLACE FUNCTION public.set_tournament_status(p_admin_secret text, p_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_row tournament;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  update tournament set status = p_status::tournament_status, updated_at = now()
    where id = p_id returning * into v_row;
  return to_jsonb(v_row);
end; $function$;

CREATE OR REPLACE FUNCTION public.unmerge_institute(p_admin_secret text, p_merge_id uuid)
 RETURNS go_institute
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_m public.institute_merge; v_restored uuid; v_row public.go_institute;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  select * into v_m from public.institute_merge where id = p_merge_id;
  if v_m.id is null then raise exception 'MERGE_NOT_FOUND'; end if;
  if v_m.reversed_at is not null then raise exception 'ALREADY_REVERSED'; end if;

  select id into v_restored from public.go_institute where id = v_m.source_id;
  if v_restored is null then
    select id into v_restored from public.go_institute where name_normalized = v_m.source_normalized;
  end if;
  if v_restored is null then
    insert into public.go_institute (id, name_th, name_normalized, active, keywords)
      values (v_m.source_id, v_m.source_name, v_m.source_normalized, v_m.source_active, v_m.source_keywords)
      returning id into v_restored;
  end if;

  update public.profile p set institute_id = v_restored, institute_name = v_m.source_name
    from unnest(v_m.moved_profiles) as m(id) where p.id = m.id and p.institute_id = v_m.target_id;
  update public.managed_player mp set institute_id = v_restored, institute_name = v_m.source_name
    from unnest(v_m.moved_players) as m(id) where mp.id = m.id and mp.institute_id = v_m.target_id;
  update public.registration_seat s set institute_id = v_restored, institute_name = v_m.source_name
    from unnest(v_m.moved_seats) as m(id) where s.id = m.id and s.institute_id = v_m.target_id;

  update public.go_institute
    set keywords = coalesce((select array_agg(kw) from unnest(keywords) kw where not (kw = any(v_m.added_keywords))), '{}'::text[]),
        updated_at = now()
    where id = v_m.target_id;

  update public.institute_merge set reversed_at = now() where id = p_merge_id;

  select * into v_row from public.go_institute where id = v_restored;
  return v_row;
end; $function$;

CREATE OR REPLACE FUNCTION public.upsert_category(p_admin_secret text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_tid uuid; v_existing category; v_row category; v_cap int; v_code text;
  v_min int; v_max int; v_min_age int; v_max_age int; v_comb uuid[];
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  v_id := nullif(p_payload->>'id', '')::uuid;
  v_tid := (p_payload->>'tournamentId')::uuid;
  v_cap := (p_payload->>'capacity')::int;
  v_code := p_payload->>'code';
  v_min := nullif(p_payload->>'minPowerLevel', '')::int;
  v_max := nullif(p_payload->>'maxPowerLevel', '')::int;
  v_min_age := nullif(p_payload->>'minAge', '')::int;
  v_max_age := nullif(p_payload->>'maxAge', '')::int;
  v_comb := coalesce(
    (select array_agg(val::uuid)
       from jsonb_array_elements_text(coalesce(p_payload->'combinableCategoryIds', '[]'::jsonb)) as t(val)),
    '{}'::uuid[]);
  if exists(select 1 from category where tournament_id = v_tid
            and lower(trim(code)) = lower(trim(v_code)) and (v_id is null or id <> v_id)) then
    raise exception 'DUPLICATE_CODE';
  end if;
  if v_id is null then
    insert into category(tournament_id, code, name, skill_level, capacity, fee_thb, sort_order,
      min_power_level, max_power_level, min_age, max_age, combinable_category_ids)
    values (v_tid, v_code, p_payload->>'name', coalesce(p_payload->>'skillLevel', ''), v_cap,
      (p_payload->>'feeThb')::numeric, coalesce((p_payload->>'sortOrder')::int, 0), v_min, v_max,
      v_min_age, v_max_age, v_comb)
    returning * into v_row;
  else
    select * into v_existing from category where id = v_id;
    if v_cap < v_existing.seats_taken then raise exception 'CAPACITY_BELOW_TAKEN:%', v_existing.seats_taken; end if;
    update category set code = v_code, name = p_payload->>'name',
      skill_level = coalesce(p_payload->>'skillLevel', ''), capacity = v_cap,
      fee_thb = (p_payload->>'feeThb')::numeric,
      sort_order = coalesce((p_payload->>'sortOrder')::int, sort_order),
      min_power_level = v_min, max_power_level = v_max,
      min_age = v_min_age, max_age = v_max_age,
      combinable_category_ids = v_comb, updated_at = now()
    where id = v_id returning * into v_row;
  end if;
  return to_jsonb(v_row);
end; $function$;

CREATE OR REPLACE FUNCTION public.upsert_institute(p_admin_secret text, p_payload jsonb)
 RETURNS go_institute
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid; v_name text; v_norm text; v_active boolean; v_row public.go_institute;
  v_has_keywords boolean; v_keywords text[];
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  v_id := nullif(p_payload->>'id', '')::uuid;
  v_name := btrim(coalesce(p_payload->>'nameTh', ''));
  if v_name = '' then raise exception 'EMPTY_NAME'; end if;
  v_norm := lower(public.normalize_thai_name(v_name));
  v_active := coalesce((p_payload->>'active')::boolean, true);
  if exists (select 1 from public.go_institute g
             where g.name_normalized = v_norm and (v_id is null or g.id <> v_id)) then
    raise exception 'DUPLICATE_NAME';
  end if;

  v_has_keywords := p_payload ? 'keywords';
  if v_has_keywords then
    v_keywords := coalesce((
      select array_agg(distinct btrim(kw))
      from jsonb_array_elements_text(p_payload->'keywords') kw
      where btrim(kw) <> ''
    ), '{}'::text[]);
  end if;

  if v_id is null then
    insert into public.go_institute (name_th, name_normalized, active, keywords)
      values (v_name, v_norm, v_active, coalesce(v_keywords, '{}'::text[]))
      returning * into v_row;
  else
    update public.go_institute
      set name_th = v_name, name_normalized = v_norm, active = v_active,
          keywords = case when v_has_keywords then coalesce(v_keywords, '{}'::text[]) else keywords end,
          updated_at = now()
      where id = v_id returning * into v_row;
    if v_row.id is null then raise exception 'INSTITUTE_NOT_FOUND'; end if;
  end if;
  return v_row;
end; $function$;

-- ── Grants, as they stand in production ──────────────────────────────────────
revoke all on function public._batch_json(uuid) from public, anon, authenticated;
grant execute on function public._batch_json(uuid) to service_role;
grant execute on function public.admin_category_stats(text, uuid) to public, anon, authenticated, service_role;
grant execute on function public.admin_clear_categories(text, uuid, text) to public, anon, authenticated, service_role;
grant execute on function public.admin_clear_registrations(text, uuid, text) to public, anon, authenticated, service_role;
grant execute on function public.admin_delete_batch(text, uuid, text) to public, anon, authenticated, service_role;
grant execute on function public.admin_delete_tournament(text, uuid, text) to public, anon, authenticated, service_role;
grant execute on function public.admin_institute_counts(text) to public, anon, authenticated, service_role;
grant execute on function public.admin_list_institutes(text) to public, anon, authenticated, service_role;
grant execute on function public.admin_list_registrations(text, uuid, text) to public, anon, authenticated, service_role;
grant execute on function public.confirm_registration(uuid, text, text) to public, anon, authenticated, service_role;
grant execute on function public.delete_category(text, uuid) to public, anon, authenticated, service_role;
grant execute on function public.delete_institute(text, uuid) to public, anon, authenticated, service_role;
grant execute on function public.find_or_create_institute(text) to public, anon, authenticated, service_role;
grant execute on function public.list_institute_merges(text) to public, anon, authenticated, service_role;
grant execute on function public.live_force_pairing(text, text, text, text, text, text, text) to public, anon, authenticated, service_role;
grant execute on function public.merge_institute(text, uuid, uuid) to public, anon, authenticated, service_role;
grant execute on function public.my_registrations() to public, anon, authenticated, service_role;
grant execute on function public.normalize_thai_name(text) to public, anon, authenticated, service_role;
grant execute on function public.purge_institute(text, uuid) to public, anon, authenticated, service_role;
grant execute on function public.reject_registration(uuid, text, text, text) to public, anon, authenticated, service_role;
revoke all on function public.release_expired_holds(uuid) from public, anon, authenticated;
grant execute on function public.release_expired_holds(uuid) to service_role;
revoke all on function public.replace_go_player_database_source(text, text, jsonb) from public;
grant execute on function public.replace_go_player_database_source(text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.set_tournament_status(text, uuid, text) to public, anon, authenticated, service_role;
grant execute on function public.unmerge_institute(text, uuid) to public, anon, authenticated, service_role;
grant execute on function public.upsert_category(text, jsonb) to public, anon, authenticated, service_role;
grant execute on function public.upsert_institute(text, jsonb) to public, anon, authenticated, service_role;
