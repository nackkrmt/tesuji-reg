-- Pre-deploy hardening #4 — server-side seat validation + public-roster privacy.
-- (a) reserve_seats inserted name/phone/title/dob verbatim from client JSON; the zod
--     schema runs only in the React form and is bypassable via a direct RPC call.
--     Add parity validation (lengths + Thai-mobile phone + plausible DOB) and DB-level
--     length caps so garbage/unbounded input can't be stored or pollute exports.
-- (b) list_participants published names of pending_review (submitted-but-unpaid)
--     registrants to anyone. Restrict the public roster to confirmed only.

-- ── reserve_seats: same body as live + a validation pass over p_seats ─────────
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

  -- server-side field validation (zod parity — the client form is bypassable).
  -- Caps unbounded/garbage input at the source; TH names required, EN optional.
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

  -- lock + validate seat availability per category
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

  -- rank + age eligibility — power_level / date_of_birth resolved from DB (client values ignored)
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

  -- duplicate / multi-division rule, ACROSS batches
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

  -- commit
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

-- ── list_participants: publish confirmed registrants only ────────────────────
create or replace function public.list_participants(p_tournament_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'fullNameTh',
      (case when s.title_prefix = 'อื่นๆ' then coalesce(s.title_custom, '') else s.title_prefix::text end)
      || s.first_name_th
      || (case when s.has_middle_name and s.middle_name_th is not null then ' ' || s.middle_name_th else '' end)
      || ' ' || s.last_name_th,
    'categoryCode', c.code, 'categoryName', c.name, 'skillLevel', c.skill_level,
    'status', b.status)
    order by c.code, s.first_name_th), '[]'::jsonb)
  from registration_seat s
  join registration_batch b on b.id = s.batch_id
  join category c on c.id = s.category_id
  where b.tournament_id = p_tournament_id
    and b.status = 'confirmed';
$function$;

-- ── DB-level length caps on stored seat fields (defense in depth) ─────────────
alter table public.registration_seat
  add constraint seat_field_lengths check (
    char_length(coalesce(first_name_th,''))  <= 100
    and char_length(coalesce(last_name_th,''))   <= 100
    and char_length(coalesce(first_name_en,''))  <= 100
    and char_length(coalesce(last_name_en,''))   <= 100
    and char_length(coalesce(middle_name_th,'')) <= 100
    and char_length(coalesce(middle_name_en,'')) <= 100
    and char_length(coalesce(title_custom,''))   <= 50
    and char_length(coalesce(mobile_phone,''))   <= 20
  );
