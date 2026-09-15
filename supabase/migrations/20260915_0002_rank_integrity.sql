-- ── Rank integrity: make the anti-sandbagging guarantee real ────────────────
-- ARCHITECTURE.md says reserve_seats "resolves the authoritative power_level
-- server-side from the caller's profile", and it does — it ignores the rank
-- sent in p_seats. But everything that makes that rank authoritative was itself
-- client-writable, so the guarantee was hollow in four places:
--
--   1. profile.power_level / managed_player.power_level are set by a plain
--      PostgREST upsert (personToRow → .from('profile').upsert). A signed-in
--      player can PATCH any rank onto the row reserve_seats then reads.
--   2. rank_self_declared — the ONLY thing that puts a typed rank on the
--      organizer's worklist (admin_list_self_declared_ranks, 20260714_0001 §3)
--      — was part of that same payload, so a client that wants to hide can
--      simply send false. The flag was a client opinion, not a fact.
--   3. person_id was client-chosen too: _autolink_person_id only ever FILLS a
--      null link, so a caller could keep any go_person id search_go_person
--      returned — a weak namesake, say — and _propagate_person_ranks Pass B
--      (20260712_0006) would then push THAT person's rank onto the row on
--      every import, making a sandbagged rank look registry-verified. (DATA-11)
--   4. reserve_seats snapshots the registrant's NAME from p_seats while taking
--      only the rank from the DB. The cross-account duplicate check, the
--      combinable-division rule and the 1-kyu AWARD_LIMIT_REACHED ban all key
--      on that name, so a direct RPC caller could seat a strong player under a
--      weak managed_player's eligibility, or re-spell a name to walk past the
--      ban. swap_seat has copied every field from the DB person since
--      20260711_0001; reserve_seats never did. Prod: 8 of 228 seats already
--      carry a name whose normalized pair differs from their person row.
--
-- The fix, in the order the writes happen:
--
--   A. _autolink_person_id now DROPS a supplied person_id that is not this
--      row's own person before it fills. go_person is unique on
--      (first_name_th_normalized, last_name_th_normalized), so the only id that
--      can survive is the one ensure_go_person would have returned anyway —
--      the namesake link becomes unreachable, not merely discouraged. (0 rows
--      on prod are mismatched today, so this is a lock on the door, not a
--      repair.)
--
--   B. rank_self_declared becomes a DERIVED column: a BEFORE INSERT OR UPDATE
--      trigger recomputes it from the facts on every write, by every writer, so
--      no client can claim a rank is registry-backed when it is not. The rule:
--        flagged  ⇔  a rank is set, it is not the official rank of the person
--                    this row is linked to, AND (it is above the beginner
--                    default, OR that person HAS an official rank to contradict)
--      The second clause preserves 20260714_0001's deliberate reading of power
--      0: a bare 15-kyu with no registry backing is the app's not-found default,
--      not a claim, and flagging the 51 profiles that hold one would bury the
--      worklist under the people it exists to make visible. But a 15-kyu
--      claimed against a listed rank — the actual sandbag — is now flagged,
--      which it never was. Prod effect: profiles 6 → 11 flagged,
--      managed players 7 → 17; nothing that is flagged today becomes unflagged.
--
--   C. set_my_rank(p_kind, p_player_id, p_person_id, p_power_level) is the
--      sanctioned way to set a rank. Given a person it verifies the target
--      row's normalized Thai name pair against that go_person and copies the
--      official power; given none it records the declared one. The client calls
--      it instead of PATCHing rank columns.
--
--      NOT DONE, deliberately: revoking column-level INSERT/UPDATE on
--      power_level, person_id, matched_go_player_id and rank_self_declared.
--      Both tables grant those privileges at TABLE level to authenticated, so a
--      column revoke needs the table grant dropped and every remaining column
--      re-granted first — and the moment that lands, every personToRow upsert
--      fails 42501, because it NAMES all four columns on INSERT and on UPDATE,
--      for new profiles as well as edits. There is no order of "apply the SQL"
--      and "push main" that avoids a window where profile creation is broken.
--      It would also buy nothing here: set_my_rank must accept a self-declared
--      rank by product design, so a revoke cannot stop a player from choosing a
--      number — only from lying about where it came from, which (B) now
--      prevents for every write path, RPC or PATCH.
--
--   D. reserve_seats seats the RESOLVED person: title, names, phone and dob now
--      come from the profile/managed_player row (mirroring swap_seat 20260711_
--      0001:521-541), the per-person advisory lock and the duplicate /
--      combination / award checks all key on that row's name, and the
--      length/phone validation moved onto it too. p_seats keeps exactly the
--      choices that are the client's to make: which division, which person of
--      their own to seat.
--
--   E. DATA-12: the three division-change RPCs judged eligibility against
--      registration_seat.power_level — the value copied at reserve time — while
--      admin_import_rank_database rewrites ranks after registration. 13
--      confirmed prod seats already disagree with their occupant's current
--      rank, so a player corrected upward could still self-move into a lower
--      band. They now resolve the occupant like swap_seat does, falling back to
--      the snapshot only when there is no person row to read.
--
-- Deploy: safe to apply on its own, before or after the frontend. Nothing here
-- rejects a write the app makes today; the only behaviour a current client
-- loses is the ability to assert that an unverified rank is verified.

-- ============================================================================
-- 1. _autolink_person_id — a supplied person_id must BE this row's person
--    (DATA-11). Recreated from 20260714_0001 with only the mismatch check
--    added.
-- ============================================================================

create or replace function public._autolink_person_id()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_first text := btrim(coalesce(new.first_name_th, ''));
  v_last  text := btrim(coalesce(new.last_name_th,  ''));
begin
  -- A genuine name change drops the stale link so it re-resolves to the NEW
  -- name.
  if tg_op = 'UPDATE'
     and (new.first_name_th is distinct from old.first_name_th
       or new.last_name_th  is distinct from old.last_name_th) then
    new.person_id := null;
  end if;

  -- The original assumed "a deliberately-chosen link always has a name matching
  -- its person". It does not: the client sends person_id with the row, so the
  -- link could be any id search_go_person returned — including a stronger or
  -- weaker namesake whose rank Pass B would then push onto this row forever.
  -- Enforce the assumption instead of trusting it. Because go_person is unique
  -- per normalized name pair, a link that passes is necessarily the same id the
  -- fill below would have produced.
  if new.person_id is not null
     and not exists (
       select 1 from go_person gp
        where gp.id = new.person_id
          and gp.first_name_th_normalized = public.normalize_thai_name(v_first)
          and gp.last_name_th_normalized  = public.normalize_thai_name(v_last)) then
    new.person_id := null;
  end if;

  -- Fill a NULL link from the name. ensure_go_person returns the existing
  -- canonical row or reserves a new one (power NULL until the name is imported).
  if new.person_id is null
     and v_first <> '' and v_last <> ''
     and char_length(v_first) <= 100 and char_length(v_last) <= 100 then
    begin
      new.person_id := public.ensure_go_person(v_first, v_last);
    exception when others then
      -- Best-effort: a link failure must NEVER block a registration write.
      if tg_op = 'UPDATE' then new.person_id := old.person_id; else new.person_id := null; end if;
    end;
  end if;

  return new;
end; $$;

-- NOTE: intentionally NOT revoking execute here (20260714_0001's reasoning). A
-- trigger function errors if called directly ("can only be called as a
-- trigger"), so leaving the default grant is harmless — and it avoids any
-- chance of an EXECUTE-privilege check blocking a registration write.

-- ============================================================================
-- 2. rank_self_declared is derived, not declared (SECDB-3)
-- ============================================================================

create or replace function public._derive_rank_self_declared()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_official int;
begin
  -- The official rank of the person this row is linked to — but only when that
  -- person is the registry's single, currently-listed holder of the name. This
  -- is the exact predicate _propagate_person_ranks Pass B uses before it pushes
  -- a rank down onto this row, so the flag can never disagree with the sync.
  -- (An ambiguous name therefore counts as unverified, which is right: two
  -- people share it and the registry cannot say which rank is whose.)
  select gp.power_level into v_official
    from go_person gp
   where gp.id = new.person_id
     and gp.is_ambiguous = false
     and gp.missing_since is null
     and gp.power_level is not null;

  -- A rank that equals the official one is verified. A rank that differs is a
  -- claim — including a claim of 15-kyu against a listed rank, which is the
  -- sandbag this whole migration is about. A bare 15-kyu with nothing to
  -- contradict it stays unflagged: that is the not-found default the app writes
  -- for everyone it cannot match, and 20260714_0001 §4b deliberately kept it
  -- off the organizer's worklist.
  new.rank_self_declared :=
    new.power_level is not null
    and new.power_level is distinct from v_official
    and (new.power_level > 0 or v_official is not null);

  return new;
end; $$;

-- NOTE: execute deliberately left granted, same reasoning as §1.

-- No `update of` column list: a rename re-points person_id from inside the
-- autolink trigger, which a column list would not see (it is matched against
-- the columns the STATEMENT names). Both triggers sort after the autolink
-- trigger by name, so person_id is already final when this one runs.
drop trigger if exists trg_profile_rank_flag on public.profile;
create trigger trg_profile_rank_flag
  before insert or update
  on public.profile
  for each row execute function public._derive_rank_self_declared();

drop trigger if exists trg_mp_rank_flag on public.managed_player;
create trigger trg_mp_rank_flag
  before insert or update
  on public.managed_player
  for each row execute function public._derive_rank_self_declared();

-- Make the invariant true for rows already saved. Written out rather than
-- leaning on the trigger so the intent survives a future reader; the trigger
-- recomputes the identical value on top of it.
update public.profile p
   set rank_self_declared = (
     p.power_level is not null
     and p.power_level is distinct from (
       select gp.power_level from go_person gp
        where gp.id = p.person_id and gp.is_ambiguous = false
          and gp.missing_since is null and gp.power_level is not null)
     and (p.power_level > 0
          or exists (
            select 1 from go_person gp
             where gp.id = p.person_id and gp.is_ambiguous = false
               and gp.missing_since is null and gp.power_level is not null)));

update public.managed_player m
   set rank_self_declared = (
     m.power_level is not null
     and m.power_level is distinct from (
       select gp.power_level from go_person gp
        where gp.id = m.person_id and gp.is_ambiguous = false
          and gp.missing_since is null and gp.power_level is not null)
     and (m.power_level > 0
          or exists (
            select 1 from go_person gp
             where gp.id = m.person_id and gp.is_ambiguous = false
               and gp.missing_since is null and gp.power_level is not null)));

-- ============================================================================
-- 3. set_my_rank — the sanctioned rank writer
-- ============================================================================

create or replace function public.set_my_rank(
  p_kind text,
  p_player_id uuid,
  p_person_id uuid,
  p_power_level int
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_prof profile; v_mp managed_player;
  v_first text; v_last text;
  v_official int; v_power int; v_person uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind not in ('self', 'managed') then raise exception 'INVALID_SOURCE'; end if;
  if p_power_level is not null and p_power_level not between 0 and 25 then
    raise exception 'INVALID_FIELD';
  end if;

  -- Lock the row for the whole call: the name we verify the person against must
  -- be the name the rank lands next to.
  if p_kind = 'self' then
    select * into v_prof from profile where id = v_uid for update;
    if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
    v_first := v_prof.first_name_th; v_last := v_prof.last_name_th;
  else
    select * into v_mp from managed_player
      where id = p_player_id and owner_id = v_uid and archived_at is null for update;
    if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
    v_first := v_mp.first_name_th; v_last := v_mp.last_name_th;
  end if;

  v_power := p_power_level;

  if p_person_id is not null then
    -- A caller may only claim the registry entry carrying THIS row's name.
    -- go_person is unique per normalized pair, so the only id that passes is
    -- the row's own person; a namesake picked out of search_go_person is
    -- refused instead of quietly becoming this row's "verified" rank.
    select gp.power_level into v_official
      from go_person gp
     where gp.id = p_person_id
       and gp.first_name_th_normalized = public.normalize_thai_name(v_first)
       and gp.last_name_th_normalized  = public.normalize_thai_name(v_last)
       and gp.is_ambiguous = false
       and gp.missing_since is null;
    if not found then raise exception 'PERSON_NAME_MISMATCH'; end if;

    -- A reserved person has no official rank yet, so the declared one stands
    -- until an import gives that exact name a rank — the ensure_go_person
    -- contract 20260714_0001 relies on.
    if v_official is not null then v_power := v_official; end if;
    v_person := p_person_id;
  end if;

  -- rank_self_declared is not set here on purpose: _derive_rank_self_declared
  -- computes it from the link and the rank, so this RPC and a direct PATCH can
  -- never disagree about whether a rank is registry-backed.
  if p_kind = 'self' then
    update profile set
      power_level = v_power,
      person_id   = coalesce(v_person, person_id),
      updated_at  = now()
    where id = v_uid
    returning * into v_prof;
    return to_jsonb(v_prof);
  end if;

  update managed_player set
    power_level = v_power,
    person_id   = coalesce(v_person, person_id),
    updated_at  = now()
  where id = p_player_id and owner_id = v_uid
  returning * into v_mp;
  return to_jsonb(v_mp);
end; $function$;

revoke execute on function public.set_my_rank(text, uuid, uuid, int) from public, anon;
grant  execute on function public.set_my_rank(text, uuid, uuid, int) to authenticated;

-- ============================================================================
-- 4. reserve_seats — seat the resolved person, not the client's copy of them
--    (SECDB-4). Recreated from 20260711_0001 with only those deltas.
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
  v_combchk record; v_cat2 category; v_a uuid; v_b uuid;
  v_existing uuid[]; v_combined uuid[]; v_dup_name text; v_dup_ref text;
  v_person record; v_ban_status jsonb;
  v_nfn text; v_nln text;
  v_keys text[] := '{}'; v_key text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  end if;

  perform pg_advisory_xact_lock(hashtext('reserve_seats:' || v_uid::text)::bigint);

  -- Serialize per real person (normalized name) within the tournament: the
  -- per-uid lock above cannot stop two DIFFERENT accounts submitting the same
  -- person concurrently from both passing the cross-account duplicate check.
  -- The key is read off the DB row, never off p_seats — locking the name the
  -- CLIENT sent would leave the name actually checked below unguarded, which is
  -- the same hole this migration closes everywhere else. Keys are locked in
  -- sorted order so concurrent multi-person submissions cannot deadlock; a seat
  -- whose source does not resolve contributes no key and is rejected by the
  -- eligibility loop further down.
  for s in select * from jsonb_array_elements(p_seats) loop
    v_src := nullif(s->>'sourceKind','');
    if v_src = 'self' then
      select * into v_person from profile where id = v_uid;
    elsif v_src = 'managed_player' then
      select * into v_person from managed_player
        where id = nullif(s->>'sourcePlayerId','')::uuid and owner_id = v_uid and archived_at is null;
    else
      continue;
    end if;
    if found then
      v_keys := v_keys || (public.normalize_thai_name(v_person.first_name_th) || '|' ||
                           public.normalize_thai_name(v_person.last_name_th));
    end if;
  end loop;

  for v_key in select distinct k from unnest(v_keys) k order by 1 loop
    perform pg_advisory_xact_lock(
      hashtext('person:' || p_tournament_id::text || ':' || v_key)::bigint);
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

  -- Validate the person we will actually seat. Every field on the seat now
  -- comes from this row, so this row is what has to hold up; the client's copy
  -- of the name and phone is not stored and not checked. A source that does not
  -- resolve is skipped here so INVALID_SOURCE / PLAYER_NOT_FOUND keep their
  -- original place (and their category context) in the eligibility loop below.
  for s in select * from jsonb_array_elements(p_seats) loop
    v_src := nullif(s->>'sourceKind','');
    if v_src = 'self' then
      select * into v_person from profile where id = v_uid;
    elsif v_src = 'managed_player' then
      select * into v_person from managed_player
        where id = nullif(s->>'sourcePlayerId','')::uuid and owner_id = v_uid and archived_at is null;
    else
      continue;
    end if;
    if not found then continue; end if;

    v_label := btrim(coalesce(v_person.first_name_th,'') || ' ' || coalesce(v_person.last_name_th,''));
    if char_length(coalesce(v_person.first_name_th,'')) not between 1 and 100
       or char_length(coalesce(v_person.last_name_th,''))  not between 1 and 100
       or char_length(coalesce(v_person.first_name_en,'')) > 100
       or char_length(coalesce(v_person.last_name_en,''))  > 100
       or char_length(coalesce(v_person.middle_name_th,'')) > 100
       or char_length(coalesce(v_person.middle_name_en,'')) > 100
       or char_length(coalesce(v_person.title_custom,''))  > 50
       or coalesce(v_person.mobile_phone,'') !~ '^0[689][0-9]{8}$'
       or v_person.date_of_birth is null
       or v_person.date_of_birth > current_date
       or v_person.date_of_birth < date '1900-01-01'
    then
      return jsonb_build_object('ok', false, 'error', 'INVALID_FIELD', 'personLabel', v_label);
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
    -- the client's label only survives long enough to name the person in the
    -- "you have no such person" errors; after that it is the DB row's name
    v_label := btrim(coalesce(s->>'firstNameTh','') || ' ' || coalesce(s->>'lastNameTh',''));
    v_src := nullif(s->>'sourceKind','');
    if v_src = 'self' then
      select * into v_person from profile where id = v_uid;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'RANK_REQUIRED',
          'categoryId', v_cat.id, 'categoryName', v_cat.code || ' ' || v_cat.name, 'personLabel', v_label);
      end if;
    elsif v_src = 'managed_player' then
      select * into v_person from managed_player
        where id = nullif(s->>'sourcePlayerId','')::uuid and owner_id = v_uid and archived_at is null;
      if not found then
        return jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
      end if;
    else
      return jsonb_build_object('ok', false, 'error', 'INVALID_SOURCE');
    end if;

    v_label := btrim(coalesce(v_person.first_name_th,'') || ' ' || coalesce(v_person.last_name_th,''));
    v_pl  := v_person.power_level;
    v_dob := v_person.date_of_birth;

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
      array_agg((e->>'categoryId')::uuid) as req_cats
    from jsonb_array_elements(p_seats) e
    group by 1, 2
  loop
    -- one group = one person, so resolve them once; the duplicate, combination
    -- and (below) award rules all read the name off this row
    if v_combchk.src_kind = 'self' then
      select * into v_person from profile where id = v_uid;
    else
      select * into v_person from managed_player
        where id = v_combchk.player_id::uuid and owner_id = v_uid and archived_at is null;
    end if;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
    end if;

    v_label := btrim(coalesce(v_person.first_name_th,'') || ' ' || coalesce(v_person.last_name_th,''));
    v_nfn := public.normalize_thai_name(v_person.first_name_th);
    v_nln := public.normalize_thai_name(v_person.last_name_th);

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

  for v_combchk in
    select distinct
      nullif(e->>'sourceKind','') as src_kind,
      nullif(e->>'sourcePlayerId','') as player_id
    from jsonb_array_elements(p_seats) e
  loop
    if v_combchk.src_kind = 'self' then
      select * into v_person from profile where id = v_uid;
    else
      select * into v_person from managed_player
        where id = v_combchk.player_id::uuid and owner_id = v_uid and archived_at is null;
    end if;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'PLAYER_NOT_FOUND');
    end if;

    v_ban_status := public.award_limit_status(v_person.first_name_th, v_person.last_name_th);
    if (v_ban_status->>'banned')::boolean then
      return jsonb_build_object('ok', false, 'error', 'AWARD_LIMIT_REACHED',
        'personLabel', btrim(coalesce(v_person.first_name_th,'') || ' ' || coalesce(v_person.last_name_th,'')),
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
      select * into v_person from profile where id = v_uid;
    else
      select * into v_person from managed_player
        where id = nullif(s->>'sourcePlayerId','')::uuid and owner_id = v_uid and archived_at is null;
    end if;
    -- Every column below is the DB person's (swap_seat 20260711_0001:521-541),
    -- so the roster, the MacMahon export and the duplicate/award rules all
    -- describe the same validated human. Only the division is the client's
    -- choice. A person that vanished since the loops above fails the NOT NULLs
    -- here and aborts the whole reservation, which is the right outcome.
    insert into registration_seat(
      batch_id, category_id, fee_thb_snapshot, title_prefix, title_custom,
      first_name_th, last_name_th, first_name_en, last_name_en,
      has_middle_name, middle_name_th, middle_name_en, mobile_phone, date_of_birth,
      source_kind, source_player_id, power_level,
      province, institute_id, institute_name, pdpa_consent, pdpa_consent_at)
    values (
      v_batch_id, (s->>'categoryId')::uuid, coalesce(v_cat.fee_thb, 0),
      v_person.title_prefix, v_person.title_custom,
      v_person.first_name_th, v_person.last_name_th,
      v_person.first_name_en, v_person.last_name_en,
      coalesce(v_person.has_middle_name, false),
      v_person.middle_name_th, v_person.middle_name_en,
      v_person.mobile_phone, v_person.date_of_birth,
      v_src, case when v_src = 'managed_player' then nullif(s->>'sourcePlayerId','')::uuid else null end,
      v_person.power_level,
      v_person.province, v_person.institute_id, v_person.institute_name,
      coalesce(v_person.pdpa_consent, false), v_person.pdpa_consent_at);
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

  -- serverNow alongside expiresAt: the 15-minute countdown was compared against
  -- the device clock, so a phone running slow showed time remaining after the
  -- hold had already been swept and the registrant paid for seats that were
  -- gone. With both values from the same clock the client can carry a real
  -- offset. Additive — an older client ignores it. (get_batch_public returns it
  -- too, see 20260915_0006.)
  return jsonb_build_object('ok', true, 'batchId', v_batch_id, 'holdId', v_hold_id,
    'expiresAt', v_expires, 'totalAmountThb', v_total, 'referenceCode', v_ref,
    'serverNow', now());
end; $function$;

revoke execute on function public.reserve_seats(uuid, text, text, jsonb) from public, anon;
grant  execute on function public.reserve_seats(uuid, text, text, jsonb) to authenticated;

-- ============================================================================
-- 5. Division change: judge the occupant's CURRENT rank, not the snapshot
--    (DATA-12). The three RPCs are recreated from 20260720_0001 with only the
--    resolution below added.
-- ============================================================================

-- The occupant's live rank/dob, falling back to the seat's snapshot when there
-- is no person row to read (a legacy seat with no source_kind, or one whose
-- managed_player was deleted). Names stay off this helper on purpose: the
-- seat's name is the identity the roster, the export and the duplicate check
-- all use, and reserve_seats now guarantees it IS the person's name.
create or replace function public._seat_occupant_rank(
  p_seat registration_seat,
  p_account_id uuid,
  out o_power_level int,
  out o_date_of_birth date
)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  o_power_level   := p_seat.power_level;
  o_date_of_birth := p_seat.date_of_birth;

  if p_seat.source_kind = 'self' then
    select p.power_level, p.date_of_birth into o_power_level, o_date_of_birth
      from profile p where p.id = p_account_id;
  elsif p_seat.source_kind = 'managed_player' then
    select m.power_level, m.date_of_birth into o_power_level, o_date_of_birth
      from managed_player m where m.id = p_seat.source_player_id;
  end if;

  -- a missing person row nulls both targets, so put the snapshot back
  if not found then
    o_power_level   := p_seat.power_level;
    o_date_of_birth := p_seat.date_of_birth;
  end if;
end; $function$;

revoke execute on function public._seat_occupant_rank(registration_seat, uuid)
  from public, anon, authenticated;

create or replace function public.preview_division_change(
  p_seat_id uuid,
  p_category_id uuid
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_seat registration_seat; v_batch registration_batch; v_t tournament;
  v_new_cat category; v_hold seat_hold; v_occupies boolean;
  v_gross_now numeric(10,2); v_gross_new numeric(10,2);
  v_total_now numeric(10,2); v_total_new numeric(10,2); v_diff numeric(10,2);
  v_err jsonb; v_pl int; v_dob date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  end if;

  select * into v_seat from registration_seat where id = p_seat_id;
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

  if exists (select 1 from seat_division_change
             where seat_id = p_seat_id and status = 'pending') then
    return jsonb_build_object('ok', false, 'error', 'PENDING_EXISTS');
  end if;

  select * into v_new_cat from category
    where id = p_category_id and tournament_id = v_batch.tournament_id;
  if v_new_cat.id is null then
    return jsonb_build_object('ok', false, 'error', 'CATEGORY_NOT_FOUND');
  end if;
  if v_new_cat.id = v_seat.category_id then
    return jsonb_build_object('ok', false, 'error', 'NO_CHANGE');
  end if;

  -- promo-aware difference (see header)
  select coalesce(sum(fee_thb_snapshot), 0) into v_gross_now
    from registration_seat where batch_id = v_batch.id;
  v_gross_new := v_gross_now - v_seat.fee_thb_snapshot + v_new_cat.fee_thb;
  v_total_now := greatest(0, v_gross_now - _promo_discount(v_batch.promo_kind, v_batch.promo_value, v_gross_now));
  v_total_new := greatest(0, v_gross_new - _promo_discount(v_batch.promo_kind, v_batch.promo_value, v_gross_new));
  v_diff := round(v_total_new - v_total_now, 2);

  -- capacity: never let a player pay toward (or instantly enter) a full division
  select * into v_hold from seat_hold where id = v_batch.hold_id;
  v_occupies := v_hold.id is not null and v_hold.status in ('active', 'consumed');
  if v_occupies and (v_new_cat.capacity - v_new_cat.seats_taken) < 1 then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_SEATS',
      'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
      'remaining', 0, 'requested', 1);
  end if;

  -- The seat's power_level is the rank it was RESERVED with; the rank database
  -- is re-imported after registration opens, so it can be stale in either
  -- direction. Judge the occupant as they are now, exactly as swap_seat does.
  select * into v_pl, v_dob from public._seat_occupant_rank(v_seat, v_batch.account_id);

  v_err := public._division_move_eligibility(
    v_batch.tournament_id, p_seat_id,
    v_seat.first_name_th, v_seat.last_name_th,
    v_pl, v_dob, v_new_cat);
  if v_err is not null then return v_err; end if;

  return jsonb_build_object('ok', true,
    'direction', case when v_diff > 0 then 'upgrade'
                      when v_diff < 0 then 'downgrade'
                      else 'even' end,
    'amountThb', abs(v_diff),
    'categoryId', v_new_cat.id,
    'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
    'feeThb', v_new_cat.fee_thb,
    'currentTotalThb', v_total_now,
    'newTotalThb', v_total_new);
end; $function$;

create or replace function public.request_division_change(
  p_seat_id uuid,
  p_category_id uuid,
  p_slip_url text default null,
  p_bank_name text default null,
  p_bank_account_no text default null,
  p_bank_account_name text default null
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_seat registration_seat; v_batch registration_batch; v_t tournament;
  v_new_cat category; v_old_cat category; v_hold seat_hold; v_occupies boolean;
  v_gross_now numeric(10,2); v_gross_new numeric(10,2);
  v_total_now numeric(10,2); v_total_new numeric(10,2); v_diff numeric(10,2);
  v_err jsonb; v_person_name text; v_id uuid; v_pl int; v_dob date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'AUTH_REQUIRED');
  end if;

  -- serialize against this account's concurrent reserve_seats/swap/requests
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

  if exists (select 1 from seat_division_change
             where seat_id = p_seat_id and status = 'pending') then
    return jsonb_build_object('ok', false, 'error', 'PENDING_EXISTS');
  end if;

  -- serialize per real person within the tournament (mirrors swap_seat) so a
  -- concurrent reserve/swap of the same person cannot race past the dup check
  perform pg_advisory_xact_lock(
    hashtext('person:' || v_batch.tournament_id::text || ':'
      || public.normalize_thai_name(v_seat.first_name_th) || '|'
      || public.normalize_thai_name(v_seat.last_name_th))::bigint);

  select * into v_new_cat from category
    where id = p_category_id and tournament_id = v_batch.tournament_id for update;
  if v_new_cat.id is null then
    return jsonb_build_object('ok', false, 'error', 'CATEGORY_NOT_FOUND');
  end if;
  if v_new_cat.id = v_seat.category_id then
    return jsonb_build_object('ok', false, 'error', 'NO_CHANGE');
  end if;

  -- promo-aware difference (see header)
  select coalesce(sum(fee_thb_snapshot), 0) into v_gross_now
    from registration_seat where batch_id = v_batch.id;
  v_gross_new := v_gross_now - v_seat.fee_thb_snapshot + v_new_cat.fee_thb;
  v_total_now := greatest(0, v_gross_now - _promo_discount(v_batch.promo_kind, v_batch.promo_value, v_gross_now));
  v_total_new := greatest(0, v_gross_new - _promo_discount(v_batch.promo_kind, v_batch.promo_value, v_gross_new));
  v_diff := round(v_total_new - v_total_now, 2);

  select * into v_hold from seat_hold where id = v_batch.hold_id for update;
  v_occupies := v_hold.id is not null and v_hold.status in ('active', 'consumed');
  if v_occupies and (v_new_cat.capacity - v_new_cat.seats_taken) < 1 then
    return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_SEATS',
      'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
      'remaining', 0, 'requested', 1);
  end if;

  -- current rank, not the reserve-time snapshot (see preview_division_change)
  select * into v_pl, v_dob from public._seat_occupant_rank(v_seat, v_batch.account_id);

  v_err := public._division_move_eligibility(
    v_batch.tournament_id, p_seat_id,
    v_seat.first_name_th, v_seat.last_name_th,
    v_pl, v_dob, v_new_cat);
  if v_err is not null then return v_err; end if;

  -- ── even: no money moves → rebook immediately (swap_seat's moving branch) ──
  if v_diff = 0 then
    if v_occupies then
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

    -- snapshot follows the new division even when the promo makes the totals
    -- equal despite different fees; recompute keeps discount_thb coherent.
    update registration_seat
      set category_id = v_new_cat.id, fee_thb_snapshot = v_new_cat.fee_thb
      where id = p_seat_id;
    perform _recompute_batch_total(v_batch.id);

    return jsonb_build_object('ok', true, 'moved', true);
  end if;

  -- ── money moves → pending request; the seat stays put until admin approval ──
  if v_diff > 0 then
    -- player's transfer slip is required up-front (bare private-bucket path,
    -- same shape check as verify-slip's isPrivatePath)
    if p_slip_url is null or p_slip_url !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' then
      return jsonb_build_object('ok', false, 'error', 'SLIP_REQUIRED');
    end if;
  else
    -- refund destination required (same rules as withdraw_seat)
    if btrim(coalesce(p_bank_name, '')) = '' or char_length(p_bank_name) > 100
       or btrim(coalesce(p_bank_account_name, '')) = '' or char_length(p_bank_account_name) > 100
       or coalesce(p_bank_account_no, '') !~ '^[0-9][0-9 -]{4,29}$' then
      return jsonb_build_object('ok', false, 'error', 'INVALID_FIELD');
    end if;
  end if;

  select * into v_old_cat from category where id = v_seat.category_id;
  v_person_name :=
    (case when v_seat.title_prefix::text = 'อื่นๆ' then coalesce(v_seat.title_custom, '')
          else v_seat.title_prefix::text end)
    || v_seat.first_name_th
    || (case when v_seat.has_middle_name and v_seat.middle_name_th is not null
             then ' ' || v_seat.middle_name_th else '' end)
    || ' ' || v_seat.last_name_th;

  begin
    insert into seat_division_change(
      seat_id, batch_id, tournament_id, account_id, person_name, batch_reference,
      from_category_id, from_category_label, from_fee_thb,
      to_category_id, to_category_label, to_fee_thb,
      direction, amount_thb, payment_slip_url,
      bank_name, bank_account_no, bank_account_name)
    values (
      p_seat_id, v_batch.id, v_batch.tournament_id, v_uid, v_person_name,
      v_batch.reference_code,
      v_seat.category_id, coalesce(v_old_cat.code || ' · ' || v_old_cat.name, ''),
      v_seat.fee_thb_snapshot,
      v_new_cat.id, v_new_cat.code || ' · ' || v_new_cat.name, v_new_cat.fee_thb,
      case when v_diff > 0 then 'upgrade' else 'downgrade' end,
      abs(v_diff),
      case when v_diff > 0 then p_slip_url else null end,
      case when v_diff < 0 then btrim(p_bank_name) else null end,
      case when v_diff < 0 then btrim(p_bank_account_no) else null end,
      case when v_diff < 0 then btrim(p_bank_account_name) else null end)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'PENDING_EXISTS');
  end;

  return jsonb_build_object('ok', true, 'pending', true,
    'direction', case when v_diff > 0 then 'upgrade' else 'downgrade' end,
    'amountThb', abs(v_diff), 'changeId', v_id);
end; $function$;

create or replace function public.admin_resolve_division_change(
  p_admin_secret text,
  p_id uuid,
  p_action text,
  p_admin_id text default 'admin',
  p_refund_slip_url text default null,
  p_note text default null
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ch seat_division_change;
  v_seat registration_seat; v_batch registration_batch;
  v_new_cat category; v_hold seat_hold; v_occupies boolean;
  v_err jsonb; v_moving boolean; v_pl int; v_dob date;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'INVALID_ACTION'; end if;

  select * into v_ch from seat_division_change where id = p_id for update;
  if v_ch.id is null then
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;
  if v_ch.status = 'refunded' then
    return jsonb_build_object('ok', false, 'error', 'LOCKED');
  end if;
  if v_ch.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_RESOLVED');
  end if;

  if p_action = 'reject' then
    update seat_division_change set
      status = 'rejected',
      admin_note = nullif(btrim(coalesce(p_note, '')), ''),
      resolved_at = now(), resolved_by = p_admin_id
    where id = p_id
    returning * into v_ch;
    return _division_change_json(v_ch);
  end if;

  -- ── approve ──
  -- downgrade needs the refund proof before anything else happens
  if v_ch.direction = 'downgrade'
     and (p_refund_slip_url is null
          or p_refund_slip_url !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$') then
    return jsonb_build_object('ok', false, 'error', 'SLIP_REQUIRED');
  end if;

  select * into v_seat from registration_seat where id = v_ch.seat_id for update;
  if v_seat.id is null then
    return jsonb_build_object('ok', false, 'error', 'SEAT_NOT_FOUND');
  end if;
  if v_seat.withdrawn_at is not null then
    return jsonb_build_object('ok', false, 'error', 'ALREADY_WITHDRAWN');
  end if;

  select * into v_batch from registration_batch where id = v_seat.batch_id;
  if v_batch.status not in ('confirmed', 'pending_review') then
    return jsonb_build_object('ok', false, 'error', 'BATCH_NOT_ACTIVE');
  end if;

  -- an admin may have moved the seat into the target manually while pending —
  -- nothing left to move (admin_update_seat already settled the snapshot);
  -- just finalize the request status.
  v_moving := v_seat.category_id is distinct from v_ch.to_category_id;

  if v_moving then
    select * into v_new_cat from category
      where id = v_ch.to_category_id and tournament_id = v_ch.tournament_id for update;
    if v_new_cat.id is null then
      return jsonb_build_object('ok', false, 'error', 'CATEGORY_NOT_FOUND');
    end if;

    -- the settled amount was computed against the request-time fee; if the
    -- category's fee changed while pending, force reject + re-request instead
    -- of silently settling a different amount
    if v_new_cat.fee_thb <> v_ch.to_fee_thb then
      return jsonb_build_object('ok', false, 'error', 'FEE_CHANGED',
        'currentFeeThb', v_new_cat.fee_thb, 'requestedFeeThb', v_ch.to_fee_thb);
    end if;

    -- serialize per person (current occupant) as swap/reserve do
    perform pg_advisory_xact_lock(
      hashtext('person:' || v_ch.tournament_id::text || ':'
        || public.normalize_thai_name(v_seat.first_name_th) || '|'
        || public.normalize_thai_name(v_seat.last_name_th))::bigint);

    select * into v_hold from seat_hold where id = v_batch.hold_id for update;
    v_occupies := v_hold.id is not null and v_hold.status in ('active', 'consumed');
    if v_occupies and (v_new_cat.capacity - v_new_cat.seats_taken) < 1 then
      return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_SEATS',
        'categoryId', v_new_cat.id, 'categoryName', v_new_cat.code || ' ' || v_new_cat.name,
        'remaining', 0, 'requested', 1);
    end if;

    -- re-validate against the CURRENT occupant (may differ from request time)
    -- AND their current rank: a request can sit here across a rank import.
    select * into v_pl, v_dob from public._seat_occupant_rank(v_seat, v_batch.account_id);

    v_err := public._division_move_eligibility(
      v_ch.tournament_id, v_seat.id,
      v_seat.first_name_th, v_seat.last_name_th,
      v_pl, v_dob, v_new_cat);
    if v_err is not null then return v_err; end if;

    -- rebook (swap_seat's moving branch)
    if v_occupies then
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

    -- settle: snapshot follows the target division, batch total recomputed
    -- with the batch's promo — this is the moment revenue actually changes
    update registration_seat
      set category_id = v_new_cat.id, fee_thb_snapshot = v_ch.to_fee_thb
      where id = v_seat.id;
    perform _recompute_batch_total(v_batch.id);
  end if;

  update seat_division_change set
    status = case when v_ch.direction = 'downgrade' then 'refunded' else 'approved' end,
    refund_slip_url = case when v_ch.direction = 'downgrade' then p_refund_slip_url
                           else refund_slip_url end,
    admin_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), admin_note),
    resolved_at = now(), resolved_by = p_admin_id
  where id = p_id
  returning * into v_ch;

  return _division_change_json(v_ch);
end; $function$;

-- ============================================================================
-- 6. Grants — restated for every function recreated above (CREATE OR REPLACE
--    keeps the old ACL, so this is hygiene, not repair: naming `public` in the
--    revoke is the part 20260904_0001 had to go back and fix everywhere).
-- ============================================================================

revoke execute on function public.preview_division_change(uuid, uuid) from public, anon;
grant  execute on function public.preview_division_change(uuid, uuid) to authenticated;

revoke execute on function public.request_division_change(uuid, uuid, text, text, text, text)
  from public, anon;
grant  execute on function public.request_division_change(uuid, uuid, text, text, text, text)
  to authenticated;

-- admin fns follow the house convention: callable by anon+authenticated,
-- _is_admin inside is the real gate
revoke execute on function public.admin_resolve_division_change(text, uuid, text, text, text, text)
  from public;
grant  execute on function public.admin_resolve_division_change(text, uuid, text, text, text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
