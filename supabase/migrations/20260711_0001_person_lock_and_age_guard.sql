-- Person-scoped locking for the cross-account duplicate check + admin age guard.
--
-- Problem 1 (race): reserve_seats/swap_seat serialize only on a PER-ACCOUNT
-- advisory lock ('reserve_seats:<uid>'). The cross-account duplicate check
-- introduced in 20260708_0001 matches people by normalized Thai name, but two
-- DIFFERENT accounts submitting the same person concurrently take different
-- uid locks, both read "no existing seat", and both commit — defeating the
-- check under concurrency.
-- Fix: additionally take an advisory lock per (tournament, normalized person
-- name) before the duplicate lookups, in both reserve_seats and swap_seat.
-- Person keys are locked in sorted order to avoid deadlocks between two
-- multi-seat submissions.
--
-- Problem 2 (age bypass): admin_update_seat computes
--   v_age := extract(year from age(v_dob))
-- and only checks v_age > max / v_age < min. With a null dob both comparisons
-- are null → not true, so a seat with no birthdate silently moves into an
-- age-restricted division. reserve_seats and swap_seat already reject a null
-- age ('AGE_NOT_ELIGIBLE'); admin_update_seat now does the same.
--
-- All three functions are recreated verbatim from 20260708_0002 with only the
-- deltas above.

-- ============================================================================
-- 1. reserve_seats — + per-person advisory locks (sorted) before dup checks
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reserve_seats(p_tournament_id uuid, p_kind text, p_submitter_phone text, p_seats jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_nfn text; v_nln text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(hashtext('reserve_seats:' || v_uid::text)::bigint);

  -- Serialize per real person (normalized name) within the tournament: the
  -- per-uid lock above cannot stop two DIFFERENT accounts submitting the same
  -- person concurrently from both passing the cross-account duplicate check.
  -- Keys are locked in sorted order so concurrent multi-person submissions
  -- cannot deadlock.
  for v_person in
    select distinct
      public.normalize_thai_name(e->>'firstNameTh') as nfn,
      public.normalize_thai_name(e->>'lastNameTh')  as nln
    from jsonb_array_elements(p_seats) e
    order by 1, 2
  loop
    perform pg_advisory_xact_lock(
      hashtext('person:' || p_tournament_id::text || ':' || v_person.nfn || '|' || v_person.nln)::bigint);
  end loop;

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

    v_nfn := public.normalize_thai_name(v_combchk.sample->>'firstNameTh');
    v_nln := public.normalize_thai_name(v_combchk.sample->>'lastNameTh');

    select coalesce(array_agg(distinct s.category_id), '{}'::uuid[]) into v_existing
    from registration_seat s
    join registration_batch b on b.id = s.batch_id
    where b.tournament_id = p_tournament_id
      and b.status in ('pending_payment','pending_review','confirmed')
      and s.withdrawn_at is null
      and public.normalize_thai_name(s.first_name_th) = v_nfn
      and public.normalize_thai_name(s.last_name_th)  = v_nln;

    select c.code || ' ' || c.name, b.reference_code into v_dup_name, v_dup_ref
    from registration_seat s
    join registration_batch b on b.id = s.batch_id
    join category c on c.id = s.category_id
    where b.tournament_id = p_tournament_id
      and b.status in ('pending_payment','pending_review','confirmed')
      and s.withdrawn_at is null
      and s.category_id = any(v_combchk.req_cats)
      and public.normalize_thai_name(s.first_name_th) = v_nfn
      and public.normalize_thai_name(s.last_name_th)  = v_nln
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

-- ============================================================================
-- 2. swap_seat — + per-person advisory lock before the dup/combinable checks
-- ============================================================================

create or replace function public.swap_seat(
  p_seat_id uuid,
  p_source_kind text,
  p_source_player_id uuid,
  p_category_id uuid
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_seat registration_seat; v_batch registration_batch; v_t tournament;
  v_new_cat category; v_hold seat_hold; v_occupies boolean; v_moving boolean;
  v_person record; v_pl int; v_dob date; v_age int; v_label text;
  v_nfn text; v_nln text;
  v_existing uuid[]; v_combined uuid[]; v_dup_ref text; v_dup_name text;
  v_a uuid; v_b uuid; v_cat category; v_cat2 category;
  v_ban_status jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  end if;

  -- serialize against this account's concurrent reserve_seats/swap (same key)
  perform pg_advisory_xact_lock(hashtext('reserve_seats:' || v_uid::text)::bigint);

  select * into v_seat from registration_seat where id = p_seat_id for update;
  if v_seat.id is null then
    return jsonb_build_object('ok', false, 'error', 'SEAT_NOT_FOUND');
  end if;

  select * into v_batch from registration_batch where id = v_seat.batch_id;
  if v_batch.account_id is distinct from v_uid then
    return jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  end if;
  if v_batch.status not in ('confirmed', 'pending_review') then
    return jsonb_build_object('ok', false, 'error', 'BATCH_NOT_ACTIVE');
  end if;
  if v_seat.withdrawn_at is not null then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_WITHDRAWN');
  end if;

  select * into v_t from tournament where id = v_batch.tournament_id;
  if v_t.id is null or now() >= v_t.registration_closes_at then
    return jsonb_build_object('ok', false, 'error', 'SWAP_CLOSED');
  end if;

  -- resolve the NEW person from the DB (never trust client-sent rank/age/name)
  if p_source_kind = 'self' then
    select * into v_person from profile where id = v_uid;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
    end if;
  elsif p_source_kind = 'managed_player' then
    select * into v_person from managed_player
      where id = p_source_player_id and owner_id = v_uid and archived_at is null;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
    end if;
  else
    return jsonb_build_object('ok', false, 'error', 'INVALID_SOURCE');
  end if;

  v_pl := v_person.power_level;
  v_dob := v_person.date_of_birth;
  v_label := btrim(coalesce(v_person.first_name_th, '') || ' ' || coalesce(v_person.last_name_th, ''));
  v_nfn := public.normalize_thai_name(v_person.first_name_th);
  v_nln := public.normalize_thai_name(v_person.last_name_th);

  -- Serialize per real person within the tournament (mirrors reserve_seats) so
  -- a concurrent reserve/swap of the same person from another account cannot
  -- race past the cross-account duplicate check below.
  perform pg_advisory_xact_lock(
    hashtext('person:' || v_batch.tournament_id::text || ':' || v_nfn || '|' || v_nln)::bigint);

  select * into v_new_cat from category
    where id = p_category_id and tournament_id = v_batch.tournament_id for update;
  if v_new_cat.id is null then
    return jsonb_build_object('ok', false, 'error', 'CATEGORY_NOT_FOUND');
  end if;
  v_moving := p_category_id <> v_seat.category_id;

  -- same occupant AND same division = nothing to do
  if not v_moving
     and public.normalize_thai_name(v_seat.first_name_th) = v_nfn
     and public.normalize_thai_name(v_seat.last_name_th) = v_nln then
    return jsonb_build_object('ok', false, 'error', 'SAME_PERSON');
  end if;

  -- a swap must not change the amount owed
  if v_moving and v_new_cat.fee_thb <> v_seat.fee_thb_snapshot then
    return jsonb_build_object('ok', false, 'error', 'FEE_MISMATCH',
      'categoryName', v_new_cat.code || ' ' || v_new_cat.name);
  end if;

  select * into v_hold from seat_hold where id = v_batch.hold_id for update;
  v_occupies := v_hold.id is not null and v_hold.status in ('active', 'consumed');

  if v_moving and v_occupies and (v_new_cat.capacity - v_new_cat.seats_taken) < 1 then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_SEATS',
      'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
      'remaining', 0, 'requested', 1);
  end if;

  -- rank eligibility on the DB-read power level (reserve_seats semantics)
  if v_pl is null then
    if v_new_cat.min_power_level is not null or v_new_cat.max_power_level is not null then
      return jsonb_build_object('ok', false, 'error', 'RANK_REQUIRED',
        'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
        'personLabel', v_label);
    end if;
  else
    if (v_new_cat.max_power_level is not null and v_pl > v_new_cat.max_power_level)
       or (v_new_cat.min_power_level is not null and v_pl < v_new_cat.min_power_level) then
      return jsonb_build_object('ok', false, 'error', 'RANK_NOT_ELIGIBLE',
        'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
        'personLabel', v_label, 'powerLevel', v_pl,
        'minPowerLevel', v_new_cat.min_power_level, 'maxPowerLevel', v_new_cat.max_power_level);
    end if;
  end if;

  -- age eligibility on the DB-read dob
  if v_new_cat.min_age is not null or v_new_cat.max_age is not null then
    v_age := case when v_dob is null then null else extract(year from age(v_dob))::int end;
    if v_age is null
       or (v_new_cat.max_age is not null and v_age > v_new_cat.max_age)
       or (v_new_cat.min_age is not null and v_age < v_new_cat.min_age) then
      return jsonb_build_object('ok', false, 'error', 'AGE_NOT_ELIGIBLE',
        'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
        'personLabel', v_label, 'age', coalesce(v_age, 0),
        'minAge', v_new_cat.min_age, 'maxAge', v_new_cat.max_age);
    end if;
  end if;

  -- cross-account duplicate / combinable by normalized name, EXCLUDING the seat
  -- we're vacating and any withdrawn seats. Models the post-swap state: the new
  -- person will hold (their other live categories) ∪ {target}.
  select coalesce(array_agg(distinct s.category_id), '{}'::uuid[]) into v_existing
  from registration_seat s
  join registration_batch b on b.id = s.batch_id
  where b.tournament_id = v_batch.tournament_id
    and b.status in ('pending_payment','pending_review','confirmed')
    and s.id <> p_seat_id
    and s.withdrawn_at is null
    and public.normalize_thai_name(s.first_name_th) = v_nfn
    and public.normalize_thai_name(s.last_name_th)  = v_nln;

  select c.code || ' ' || c.name, b.reference_code into v_dup_name, v_dup_ref
  from registration_seat s
  join registration_batch b on b.id = s.batch_id
  join category c on c.id = s.category_id
  where b.tournament_id = v_batch.tournament_id
    and b.status in ('pending_payment','pending_review','confirmed')
    and s.id <> p_seat_id
    and s.withdrawn_at is null
    and s.category_id = p_category_id
    and public.normalize_thai_name(s.first_name_th) = v_nfn
    and public.normalize_thai_name(s.last_name_th)  = v_nln
  limit 1;
  if found then
    return jsonb_build_object('ok', false, 'error', 'DUPLICATE_REGISTRATION',
      'personLabel', v_label, 'categoryName', v_dup_name, 'referenceCode', v_dup_ref);
  end if;

  select array(select distinct x from unnest(v_existing || array[p_category_id]) x)
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

  -- 1-kyu award ceiling on the new person
  v_ban_status := public.award_limit_status(v_person.first_name_th, v_person.last_name_th);
  if (v_ban_status->>'banned')::boolean then
    return jsonb_build_object('ok', false, 'error', 'AWARD_LIMIT_REACHED',
      'personLabel', v_label, 'awardCount', (v_ban_status->>'count')::int,
      'requiresAdminOverride', true);
  end if;

  -- rebook the seat (mirror admin_update_seat) — capacity moves only when the
  -- division changes and the hold still occupies seats
  if v_moving and v_occupies then
    update category set seats_taken = greatest(0, seats_taken - 1), updated_at = now()
      where id = v_seat.category_id;
    update category set seats_taken = seats_taken + 1, updated_at = now()
      where id = v_new_cat.id;
    delete from seat_hold_line
      where hold_id = v_hold.id and category_id = v_seat.category_id and seats <= 1;
    update seat_hold_line set seats = seats - 1
      where hold_id = v_hold.id and category_id = v_seat.category_id;
    if exists (select 1 from seat_hold_line where hold_id = v_hold.id and category_id = v_new_cat.id) then
      update seat_hold_line set seats = seats + 1
        where hold_id = v_hold.id and category_id = v_new_cat.id;
    else
      insert into seat_hold_line(hold_id, category_id, seats) values (v_hold.id, v_new_cat.id, 1);
    end if;
  end if;

  update registration_seat set
    title_prefix     = v_person.title_prefix,
    title_custom     = v_person.title_custom,
    first_name_th    = v_person.first_name_th,
    last_name_th     = v_person.last_name_th,
    first_name_en    = v_person.first_name_en,
    last_name_en     = v_person.last_name_en,
    has_middle_name  = coalesce(v_person.has_middle_name, false),
    middle_name_th   = v_person.middle_name_th,
    middle_name_en   = v_person.middle_name_en,
    mobile_phone     = v_person.mobile_phone,
    date_of_birth    = v_person.date_of_birth,
    power_level      = v_person.power_level,
    province         = v_person.province,
    institute_id     = v_person.institute_id,
    institute_name   = v_person.institute_name,
    pdpa_consent     = coalesce(v_person.pdpa_consent, false),
    pdpa_consent_at  = v_person.pdpa_consent_at,
    source_kind      = p_source_kind,
    source_player_id = case when p_source_kind = 'managed_player' then p_source_player_id else null end,
    category_id      = v_new_cat.id
    -- fee_thb_snapshot intentionally unchanged: no money moves in a swap, so the
    -- batch total stays correct without calling _recompute_batch_total.
  where id = p_seat_id;

  return jsonb_build_object('ok', true);
end; $function$;

-- ============================================================================
-- 3. admin_update_seat — reject a null dob for age-restricted divisions
--    (previously: null age made both comparisons null → check silently passed)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_update_seat(p_admin_secret text, p_batch_id uuid, p_seat_id uuid, p_payload jsonb, p_admin_id text DEFAULT 'admin'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_batch registration_batch; v_seat registration_seat; v_new_cat category;
  v_hold seat_hold; v_occupies boolean; v_moving boolean;
  v_old_cat uuid; v_pl int; v_dob date; v_age int; v_fee numeric;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;

  select * into v_batch from registration_batch where id = p_batch_id;
  if v_batch.id is null then raise exception 'BATCH_NOT_FOUND'; end if;

  select * into v_seat from registration_seat
    where id = p_seat_id and batch_id = p_batch_id for update;
  if v_seat.id is null then raise exception 'SEAT_NOT_FOUND'; end if;
  if v_seat.withdrawn_at is not null then raise exception 'ALREADY_WITHDRAWN'; end if;

  select * into v_new_cat from category
    where id = (p_payload->>'categoryId')::uuid and tournament_id = v_batch.tournament_id for update;
  if v_new_cat.id is null then raise exception 'CATEGORY_NOT_FOUND'; end if;

  v_old_cat := v_seat.category_id;
  v_moving := v_old_cat <> v_new_cat.id;
  v_pl := nullif(p_payload->>'powerLevel', '')::int;
  v_dob := (p_payload->>'dob')::date;

  select h.* into v_hold from seat_hold h
    join registration_batch b on b.hold_id = h.id where b.id = p_batch_id for update;
  v_occupies := v_hold.id is not null and v_hold.status in ('active', 'consumed');

  if v_moving and v_occupies and (v_new_cat.capacity - v_new_cat.seats_taken) < 1 then
    raise exception 'CATEGORY_FULL';
  end if;

  if v_new_cat.min_power_level is not null or v_new_cat.max_power_level is not null then
    if v_pl is null then raise exception 'RANK_REQUIRED'; end if;
    if (v_new_cat.max_power_level is not null and v_pl > v_new_cat.max_power_level)
       or (v_new_cat.min_power_level is not null and v_pl < v_new_cat.min_power_level) then
      raise exception 'RANK_NOT_ELIGIBLE';
    end if;
  end if;

  if v_new_cat.min_age is not null or v_new_cat.max_age is not null then
    if v_dob is null then raise exception 'AGE_NOT_ELIGIBLE'; end if;
    v_age := extract(year from age(v_dob))::int;
    if (v_new_cat.max_age is not null and v_age > v_new_cat.max_age)
       or (v_new_cat.min_age is not null and v_age < v_new_cat.min_age) then
      raise exception 'AGE_NOT_ELIGIBLE';
    end if;
  end if;

  if v_moving and v_occupies then
    update category set seats_taken = greatest(0, seats_taken - 1), updated_at = now()
      where id = v_old_cat;
    update category set seats_taken = seats_taken + 1, updated_at = now()
      where id = v_new_cat.id;
    delete from seat_hold_line
      where hold_id = v_hold.id and category_id = v_old_cat and seats <= 1;
    update seat_hold_line set seats = seats - 1
      where hold_id = v_hold.id and category_id = v_old_cat;
    if exists (select 1 from seat_hold_line where hold_id = v_hold.id and category_id = v_new_cat.id) then
      update seat_hold_line set seats = seats + 1
        where hold_id = v_hold.id and category_id = v_new_cat.id;
    else
      insert into seat_hold_line(hold_id, category_id, seats) values (v_hold.id, v_new_cat.id, 1);
    end if;
  end if;

  v_fee := case when v_moving then v_new_cat.fee_thb else v_seat.fee_thb_snapshot end;

  update registration_seat set
    title_prefix    = (p_payload->>'titlePrefix')::title_prefix,
    title_custom    = nullif(p_payload->>'titleCustom', ''),
    first_name_th   = p_payload->>'firstNameTh',
    last_name_th    = p_payload->>'lastNameTh',
    first_name_en   = p_payload->>'firstNameEn',
    last_name_en    = p_payload->>'lastNameEn',
    has_middle_name = coalesce((p_payload->>'hasMiddleName')::boolean, false),
    middle_name_th  = nullif(p_payload->>'middleNameTh', ''),
    middle_name_en  = nullif(p_payload->>'middleNameEn', ''),
    mobile_phone    = p_payload->>'phone',
    date_of_birth   = v_dob,
    power_level     = v_pl,
    category_id     = v_new_cat.id,
    fee_thb_snapshot = v_fee
  where id = p_seat_id;

  perform _recompute_batch_total(p_batch_id);

  return _batch_json(p_batch_id);
end; $function$;
