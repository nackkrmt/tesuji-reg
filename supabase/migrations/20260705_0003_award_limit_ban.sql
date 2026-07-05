-- 1-kyu award ceiling — a player who has medalled (1st/2nd/3rd) in the 1-kyu
-- award division 3+ DISTINCT times, but is NOT yet in the DAN database, must pass
-- dan before entering ANY division of ANY tournament. Enforced server-side in
-- reserve_seats (the ONLY path that inserts a registration_seat).
--
-- Counting: rows in go_player_database with source='award' AND power_level=14
-- (=> rank_in_category resolved to 1 kyu, see lib/rank.ts / lib/go-database.ts).
-- One medal per person per event, so we count DISTINCT (event_name,event_date);
-- award rows with blank event metadata fall back to counting per-row (id) so the
-- ban can't be evaded by importing awards with empty event fields.
--
-- Name matching is EXACT or NORMALIZED Thai name only (no fuzzy) — the ban blocks
-- a player from the entire system, so we keep matching tight. normalize_thai_name
-- already exists on the DB (mirrors lib/go-database.ts) and is reused as-is.
--
-- Override: because name matching can false-positive (two people, same normalized
-- name), an admin can exempt a specific name via award_limit_exemption. The public
-- reserve_seats path has NO self-service bypass by design; contacting an admin
-- (who adds an exemption) is the only escape. Today NO player is affected — every
-- name already at 3+ 1-kyu awards is already in the dan database.

-- ── exemption table (admin override) ─────────────────────────────────────────
create table if not exists public.award_limit_exemption (
  id uuid primary key default gen_random_uuid(),
  first_name_th text not null,
  last_name_th  text not null,
  first_name_th_normalized text not null,
  last_name_th_normalized  text not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists award_limit_exemption_norm_idx
  on public.award_limit_exemption (first_name_th_normalized, last_name_th_normalized);
-- RLS on + no policies + no direct grants => reachable only via the SECURITY
-- DEFINER RPCs below (the postgres owner bypasses RLS; PostgREST clients cannot).
alter table public.award_limit_exemption enable row level security;
revoke all on public.award_limit_exemption from anon, authenticated;

-- Speed the ban lookups (per-seat, inside the reserve advisory lock).
create index if not exists go_player_database_award_1kyu_idx
  on public.go_player_database (first_name_th_normalized, last_name_th_normalized)
  where source = 'award' and power_level = 14;
create index if not exists go_player_database_dan_name_idx
  on public.go_player_database (first_name_th_normalized, last_name_th_normalized)
  where source = 'dan';

-- ── count of DISTINCT 1-kyu award events for a name (exact OR normalized) ─────
create or replace function public.award_1kyu_event_count(p_first text, p_last text)
returns int
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(count(distinct case
      when coalesce(g.event_name,'') = '' and coalesce(g.event_date,'') = '' then g.id::text
      else coalesce(g.event_name,'') || chr(31) || coalesce(g.event_date,'')
    end), 0)::int
  from public.go_player_database g
  where g.source = 'award' and g.power_level = 14
    and (
      (g.first_name_th = btrim(coalesce(p_first,'')) and g.last_name_th = btrim(coalesce(p_last,'')))
      or (g.first_name_th_normalized = public.normalize_thai_name(p_first)
          and g.last_name_th_normalized = public.normalize_thai_name(p_last))
    );
$function$;

-- ── is this name already in the DAN database? (exact OR normalized) ──────────
create or replace function public.has_dan_record(p_first text, p_last text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists(
    select 1 from public.go_player_database g
    where g.source = 'dan'
      and (
        (g.first_name_th = btrim(coalesce(p_first,'')) and g.last_name_th = btrim(coalesce(p_last,'')))
        or (g.first_name_th_normalized = public.normalize_thai_name(p_first)
            and g.last_name_th_normalized = public.normalize_thai_name(p_last))
      )
  );
$function$;

-- ── admin exemption match (exact OR normalized) ──────────────────────────────
create or replace function public.award_limit_is_exempt(p_first text, p_last text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists(
    select 1 from public.award_limit_exemption x
    where (x.first_name_th = btrim(coalesce(p_first,'')) and x.last_name_th = btrim(coalesce(p_last,'')))
       or (x.first_name_th_normalized = public.normalize_thai_name(p_first)
           and x.last_name_th_normalized = public.normalize_thai_name(p_last))
  );
$function$;

-- ── combined status — single source of truth for the gate AND the client hint ─
create or replace function public.award_limit_status(p_first_name_th text, p_last_name_th text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'count',  c,
    'inDan',  d,
    'exempt', e,
    'banned', (c >= 3 and not d and not e)
  )
  from (
    select public.award_1kyu_event_count(p_first_name_th, p_last_name_th) as c,
           public.has_dan_record(p_first_name_th, p_last_name_th)         as d,
           public.award_limit_is_exempt(p_first_name_th, p_last_name_th)  as e
  ) t;
$function$;

-- helpers are internal (called by the definer functions above / reserve_seats);
-- only the combined status is client-callable, and only by signed-in users.
revoke all on function public.award_1kyu_event_count(text,text) from public;
revoke all on function public.has_dan_record(text,text)         from public;
revoke all on function public.award_limit_is_exempt(text,text)  from public;
revoke all on function public.award_limit_status(text,text)     from public;
grant execute on function public.award_limit_status(text,text)  to authenticated;

-- ── admin exemption CRUD (role-gated via _is_admin) ──────────────────────────
create or replace function public.admin_add_award_exemption(
  p_admin_secret text, p_first_name_th text, p_last_name_th text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row public.award_limit_exemption;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if btrim(coalesce(p_first_name_th,'')) = '' or btrim(coalesce(p_last_name_th,'')) = '' then
    raise exception 'INVALID_NAME';
  end if;
  insert into public.award_limit_exemption(
    first_name_th, last_name_th, first_name_th_normalized, last_name_th_normalized, note, created_by)
  values (
    btrim(p_first_name_th), btrim(p_last_name_th),
    public.normalize_thai_name(p_first_name_th), public.normalize_thai_name(p_last_name_th),
    nullif(btrim(coalesce(p_note,'')), ''), auth.uid())
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'firstNameTh', v_row.first_name_th,
    'lastNameTh', v_row.last_name_th, 'note', v_row.note, 'createdAt', v_row.created_at);
end; $function$;

create or replace function public.admin_remove_award_exemption(p_admin_secret text, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  delete from public.award_limit_exemption where id = p_id;
end; $function$;

create or replace function public.admin_list_award_exemptions(p_admin_secret text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v jsonb;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', x.id, 'firstNameTh', x.first_name_th, 'lastNameTh', x.last_name_th,
      'note', x.note, 'createdAt', x.created_at) order by x.created_at desc), '[]'::jsonb)
    into v from public.award_limit_exemption x;
  return v;
end; $function$;

grant execute on function public.admin_add_award_exemption(text,text,text,text) to authenticated;
grant execute on function public.admin_remove_award_exemption(text,uuid)          to authenticated;
grant execute on function public.admin_list_award_exemptions(text)                to authenticated;

-- ── reserve_seats — verbatim current definition + the award-ceiling gate ─────
-- Copied from 20260701_0004 (live). The ONLY additions are: two DECLARE vars
-- (v_person, v_ban_status) and the award-ceiling loop inserted AFTER the
-- duplicate/combination loop and BEFORE the commit. Everything else is unchanged.
create or replace function public.reserve_seats(p_tournament_id uuid, p_kind text, p_submitter_phone text, p_seats jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_t tournament; v_item record; v_cat category; v_remaining int;
  v_count int; v_batch_id uuid; v_hold_id uuid;
  v_expires timestamptz := now() + interval '15 minutes';
  v_total numeric(10,2) := 0; v_ref text; s jsonb; v_uid uuid;
  v_pl int; v_src text; v_label text; v_dob date; v_age int;
  v_prov text; v_inst_id uuid; v_inst_name text; v_pdpa boolean; v_pdpa_at timestamptz;
  v_combchk record; v_cat2 category; v_a uuid; v_b uuid;
  v_existing uuid[]; v_combined uuid[]; v_dup_name text; v_dup_ref text;
  v_person record; v_ban_status jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(hashtext('reserve_seats:' || v_uid::text)::bigint);

  perform release_expired_holds(p_tournament_id);

  select * into v_t from tournament where id = p_tournament_id;
  if v_t.id is null or v_t.status <> 'published'
     or now() < v_t.registration_opens_at or now() >= v_t.registration_closes_at then
    return jsonb_build_object('ok', false, 'error', 'REGISTRATION_CLOSED');
  end if;

  v_count := jsonb_array_length(p_seats);
  if v_count = 0  then return jsonb_build_object('ok', false, 'error', 'EMPTY_BATCH'); end if;
  if v_count > 10 then return jsonb_build_object('ok', false, 'error', 'TOO_MANY', 'max', 10); end if;

  for s in select * from jsonb_array_elements(p_seats) loop
    v_label := btrim(coalesce(s->>'firstNameTh','') || ' ' || coalesce(s->>'lastNameTh',''));
    if char_length(coalesce(s->>'firstNameTh','')) not between 1 and 100
       or char_length(coalesce(s->>'lastNameTh',''))  not between 1 and 100
       or char_length(coalesce(s->>'firstNameEn','')) > 100
       or char_length(coalesce(s->>'lastNameEn',''))  > 100
       or char_length(coalesce(s->>'middleNameTh','')) > 100
       or char_length(coalesce(s->>'middleNameEn','')) > 100
       or char_length(coalesce(s->>'titleCustom',''))  > 50
       or coalesce(s->>'phone','') !~ '^0[689][0-9]{8}$'
    then
      return jsonb_build_object('ok', false, 'error', 'INVALID_FIELD', 'personLabel', v_label);
    end if;
    if nullif(s->>'dob','') is not null then
      begin
        v_dob := (s->>'dob')::date;
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'INVALID_FIELD', 'personLabel', v_label);
      end;
      if v_dob > current_date or v_dob < date '1900-01-01' then
        return jsonb_build_object('ok', false, 'error', 'INVALID_FIELD', 'personLabel', v_label);
      end if;
    end if;
  end loop;

  for v_item in
    select (e->>'categoryId')::uuid as category_id, count(*)::int as seats
    from jsonb_array_elements(p_seats) e
    group by (e->>'categoryId')::uuid
    order by (e->>'categoryId')::uuid
  loop
    select * into v_cat from category
      where id = v_item.category_id and tournament_id = p_tournament_id for update;
    if v_cat.id is null then
      return jsonb_build_object('ok', false, 'error', 'CATEGORY_NOT_FOUND', 'categoryId', v_item.category_id);
    end if;
    v_remaining := v_cat.capacity - v_cat.seats_taken;
    if v_item.seats > v_remaining then
      return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_SEATS',
        'categoryId', v_item.category_id, 'categoryName', v_cat.code || ' ' || v_cat.name,
        'remaining', greatest(0, v_remaining), 'requested', v_item.seats);
    end if;
  end loop;

  for s in select * from jsonb_array_elements(p_seats) loop
    select * into v_cat from category
      where id = (s->>'categoryId')::uuid and tournament_id = p_tournament_id;
    v_label := btrim(coalesce(s->>'firstNameTh','') || ' ' || coalesce(s->>'lastNameTh',''));
    v_src := nullif(s->>'sourceKind','');
    if v_src = 'self' then
      select power_level, date_of_birth into v_pl, v_dob from profile where id = v_uid;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'RANK_REQUIRED',
          'categoryId', v_cat.id, 'categoryName', v_cat.code || ' ' || v_cat.name, 'personLabel', v_label);
      end if;
    elsif v_src = 'managed_player' then
      select power_level, date_of_birth into v_pl, v_dob from managed_player
        where id = nullif(s->>'sourcePlayerId','')::uuid and owner_id = v_uid and archived_at is null;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
      end if;
    else
      return jsonb_build_object('ok', false, 'error', 'INVALID_SOURCE');
    end if;

    if v_pl is null then
      if v_cat.min_power_level is not null or v_cat.max_power_level is not null then
        return jsonb_build_object('ok', false, 'error', 'RANK_REQUIRED',
          'categoryId', v_cat.id, 'categoryName', v_cat.code || ' ' || v_cat.name, 'personLabel', v_label);
      end if;
    else
      if (v_cat.max_power_level is not null and v_pl > v_cat.max_power_level)
         or (v_cat.min_power_level is not null and v_pl < v_cat.min_power_level) then
        return jsonb_build_object('ok', false, 'error', 'RANK_NOT_ELIGIBLE',
          'categoryId', v_cat.id, 'categoryName', v_cat.code || ' ' || v_cat.name,
          'personLabel', v_label, 'powerLevel', v_pl,
          'minPowerLevel', v_cat.min_power_level, 'maxPowerLevel', v_cat.max_power_level);
      end if;
    end if;

    if v_cat.min_age is not null or v_cat.max_age is not null then
      v_age := case when v_dob is null then null else extract(year from age(v_dob))::int end;
      if v_age is null
         or (v_cat.max_age is not null and v_age > v_cat.max_age)
         or (v_cat.min_age is not null and v_age < v_cat.min_age) then
        return jsonb_build_object('ok', false, 'error', 'AGE_NOT_ELIGIBLE',
          'categoryId', v_cat.id, 'categoryName', v_cat.code || ' ' || v_cat.name,
          'personLabel', v_label, 'age', coalesce(v_age, 0),
          'minAge', v_cat.min_age, 'maxAge', v_cat.max_age);
      end if;
    end if;
  end loop;

  for v_combchk in
    select
      nullif(e->>'sourceKind','') as src_kind,
      nullif(e->>'sourcePlayerId','') as player_id,
      array_agg((e->>'categoryId')::uuid) as req_cats,
      (array_agg(e))[1] as sample
    from jsonb_array_elements(p_seats) e
    group by 1, 2
  loop
    v_label := btrim(coalesce(v_combchk.sample->>'firstNameTh','') || ' ' ||
                     coalesce(v_combchk.sample->>'lastNameTh',''));

    select coalesce(array_agg(distinct s.category_id), '{}'::uuid[]) into v_existing
    from registration_seat s
    join registration_batch b on b.id = s.batch_id
    where b.tournament_id = p_tournament_id
      and b.status in ('pending_payment','pending_review','confirmed')
      and (
        (v_combchk.src_kind = 'self' and b.account_id = v_uid and s.source_kind = 'self')
        or
        (v_combchk.src_kind = 'managed_player' and s.source_player_id = v_combchk.player_id::uuid)
      );

    select c.code || ' ' || c.name, b.reference_code into v_dup_name, v_dup_ref
    from registration_seat s
    join registration_batch b on b.id = s.batch_id
    join category c on c.id = s.category_id
    where b.tournament_id = p_tournament_id
      and b.status in ('pending_payment','pending_review','confirmed')
      and s.category_id = any(v_combchk.req_cats)
      and (
        (v_combchk.src_kind = 'self' and b.account_id = v_uid and s.source_kind = 'self')
        or
        (v_combchk.src_kind = 'managed_player' and s.source_player_id = v_combchk.player_id::uuid)
      )
    limit 1;
    if found then
      return jsonb_build_object('ok', false, 'error', 'DUPLICATE_REGISTRATION',
        'personLabel', v_label, 'categoryName', v_dup_name, 'referenceCode', v_dup_ref);
    end if;

    if array_length(v_combchk.req_cats, 1) <>
       (select count(distinct x) from unnest(v_combchk.req_cats) x) then
      select c.code || ' ' || c.name into v_dup_name
      from category c
      where c.id = (select x from unnest(v_combchk.req_cats) x
                    group by x having count(*) > 1 limit 1);
      return jsonb_build_object('ok', false, 'error', 'DUPLICATE_REGISTRATION',
        'personLabel', v_label, 'categoryName', coalesce(v_dup_name, ''), 'referenceCode', null);
    end if;

    select array(select distinct x from unnest(v_existing || v_combchk.req_cats) x)
      into v_combined;

    if array_length(v_combined, 1) >= 2 then
      v_a := v_combined[1]; v_b := v_combined[2];
      select * into v_cat  from category where id = v_a;
      select * into v_cat2 from category where id = v_b;
      if array_length(v_combined, 1) > 2
         or not (v_b = any(v_cat.combinable_category_ids) or v_a = any(v_cat2.combinable_category_ids)) then
        return jsonb_build_object('ok', false, 'error', 'COMBINATION_NOT_ALLOWED',
          'personLabel', v_label,
          'categoryName', v_cat.code || ' ' || v_cat.name,
          'otherCategoryName', v_cat2.code || ' ' || v_cat2.name);
      end if;
    end if;
  end loop;

  -- 1-kyu award ceiling — once per distinct person in the batch. A player at 3+
  -- distinct 1-kyu award events who is not in the dan database (and not exempt)
  -- is blocked from EVERY division until they pass dan. See award_limit_status.
  for v_person in
    select distinct coalesce(e->>'firstNameTh','') as fn, coalesce(e->>'lastNameTh','') as ln
    from jsonb_array_elements(p_seats) e
  loop
    v_ban_status := public.award_limit_status(v_person.fn, v_person.ln);
    if (v_ban_status->>'banned')::boolean then
      return jsonb_build_object('ok', false, 'error', 'AWARD_LIMIT_REACHED',
        'personLabel', btrim(v_person.fn || ' ' || v_person.ln),
        'awardCount', (v_ban_status->>'count')::int,
        'requiresAdminOverride', true);
    end if;
  end loop;

  v_ref := 'TSJ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
  insert into registration_batch(tournament_id, kind, submitter_phone, status, total_amount_thb, reference_code, account_id)
    values (p_tournament_id, p_kind::registration_kind, p_submitter_phone, 'pending_payment', 0, v_ref, v_uid)
    returning id into v_batch_id;
  insert into seat_hold(tournament_id, batch_id, status, expires_at)
    values (p_tournament_id, v_batch_id, 'active', v_expires) returning id into v_hold_id;

  for s in select * from jsonb_array_elements(p_seats) loop
    select * into v_cat from category where id = (s->>'categoryId')::uuid and tournament_id = p_tournament_id;
    v_total := v_total + coalesce(v_cat.fee_thb, 0);
    v_src := nullif(s->>'sourceKind','');
    if v_src = 'self' then
      select power_level, province, institute_id, institute_name, pdpa_consent, pdpa_consent_at
        into v_pl, v_prov, v_inst_id, v_inst_name, v_pdpa, v_pdpa_at
        from profile where id = v_uid;
    else
      select power_level, province, institute_id, institute_name, pdpa_consent, pdpa_consent_at
        into v_pl, v_prov, v_inst_id, v_inst_name, v_pdpa, v_pdpa_at
        from managed_player
        where id = nullif(s->>'sourcePlayerId','')::uuid and owner_id = v_uid;
    end if;
    insert into registration_seat(
      batch_id, category_id, fee_thb_snapshot, title_prefix, title_custom,
      first_name_th, last_name_th, first_name_en, last_name_en,
      has_middle_name, middle_name_th, middle_name_en, mobile_phone, date_of_birth,
      source_kind, source_player_id, power_level,
      province, institute_id, institute_name, pdpa_consent, pdpa_consent_at)
    values (
      v_batch_id, (s->>'categoryId')::uuid, coalesce(v_cat.fee_thb, 0),
      (s->>'titlePrefix')::title_prefix, nullif(s->>'titleCustom', ''),
      s->>'firstNameTh', s->>'lastNameTh', s->>'firstNameEn', s->>'lastNameEn',
      coalesce((s->>'hasMiddleName')::boolean, false),
      nullif(s->>'middleNameTh', ''), nullif(s->>'middleNameEn', ''),
      s->>'phone', (s->>'dob')::date,
      v_src, case when v_src = 'managed_player' then nullif(s->>'sourcePlayerId','')::uuid else null end,
      v_pl,
      v_prov, v_inst_id, v_inst_name, coalesce(v_pdpa, false), v_pdpa_at);
  end loop;

  for v_item in
    select (e->>'categoryId')::uuid as category_id, count(*)::int as seats
    from jsonb_array_elements(p_seats) e group by (e->>'categoryId')::uuid
  loop
    update category set seats_taken = seats_taken + v_item.seats, updated_at = now()
      where id = v_item.category_id;
    insert into seat_hold_line(hold_id, category_id, seats)
      values (v_hold_id, v_item.category_id, v_item.seats);
  end loop;

  update registration_batch set hold_id = v_hold_id, total_amount_thb = v_total, updated_at = now()
    where id = v_batch_id;

  return jsonb_build_object('ok', true, 'batchId', v_batch_id, 'holdId', v_hold_id,
    'expiresAt', v_expires, 'totalAmountThb', v_total, 'referenceCode', v_ref);
end; $function$;
