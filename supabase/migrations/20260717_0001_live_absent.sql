-- Per-side "ไม่มา" (absent / no-show) marking for the judge console. Encoded
-- exactly like check_in ('' | 'B' | 'W' | 'BOTH') and mutually exclusive with
-- it per side: live_toggle_absent clears the same side's check-in bit when
-- marking absent, and live_toggle_checkin (replaced below) clears the same
-- side's absent bit when checking in. Absent never touches result — the judge
-- console offers a quick action that submits a normal 1-0/0-1 via
-- live_submit_result with remark 'ขาดแข่ง' instead, so the MacMahon .jar and
-- /live keep seeing only the three known result codes.
--
-- live_replace_round (delete + re-insert) wipes absent on re-upload, the same
-- way it already wipes check_in — intentionally left untouched. Like check_in,
-- absent sticks to the seat/side, not the person: a Force swap after marking
-- absent keeps the mark and the judge un-toggles it manually.

alter table public.live_match add column if not exists absent text not null default '';

create or replace function public.live_toggle_absent(
  p_secret text,
  p_division_id text,
  p_round text,
  p_table text,
  p_side text,
  p_absent boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_abs text;
  v_chk text;
begin
  if not _is_live_writer(p_secret) then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_side not in ('B', 'W') then
    raise exception 'INVALID_SIDE';
  end if;

  -- Row lock so concurrent B/W toggles on one table can't clobber each
  -- other's read-modify-write.
  select absent, check_in into v_abs, v_chk
    from live_match
   where division_id = p_division_id and round = p_round and table_no = p_table
     for update;
  if not found then
    return;
  end if;
  v_abs := coalesce(v_abs, '');
  v_chk := coalesce(v_chk, '');

  if p_side = 'B' then
    v_abs := case
      when p_absent then (case when v_abs in ('W', 'BOTH') then 'BOTH' else 'B' end)
      else (case when v_abs = 'BOTH' then 'W' when v_abs = 'B' then '' else v_abs end)
    end;
    if p_absent then
      v_chk := case when v_chk = 'BOTH' then 'W' when v_chk = 'B' then '' else v_chk end;
    end if;
  else
    v_abs := case
      when p_absent then (case when v_abs in ('B', 'BOTH') then 'BOTH' else 'W' end)
      else (case when v_abs = 'BOTH' then 'B' when v_abs = 'W' then '' else v_abs end)
    end;
    if p_absent then
      v_chk := case when v_chk = 'BOTH' then 'B' when v_chk = 'W' then '' else v_chk end;
    end if;
  end if;

  update live_match
     set absent = v_abs, check_in = v_chk, updated_at = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
end;
$$;

-- Replace live_toggle_checkin (same signature → existing ACL is preserved):
-- now clears the same side's absent bit when checking in, takes a row lock,
-- and fixes a latent lost-bit edge (setting a side that was already part of
-- 'BOTH' used to drop the other side's bit).
create or replace function public.live_toggle_checkin(
  p_secret text,
  p_division_id text,
  p_round text,
  p_table text,
  p_side text,
  p_checked boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chk text;
  v_abs text;
begin
  if not _is_live_writer(p_secret) then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_side not in ('B', 'W') then
    raise exception 'INVALID_SIDE';
  end if;

  select check_in, absent into v_chk, v_abs
    from live_match
   where division_id = p_division_id and round = p_round and table_no = p_table
     for update;
  if not found then
    return;
  end if;
  v_chk := coalesce(v_chk, '');
  v_abs := coalesce(v_abs, '');

  if p_side = 'B' then
    v_chk := case
      when p_checked then (case when v_chk in ('W', 'BOTH') then 'BOTH' else 'B' end)
      else (case when v_chk = 'BOTH' then 'W' when v_chk = 'B' then '' else v_chk end)
    end;
    if p_checked then
      v_abs := case when v_abs = 'BOTH' then 'W' when v_abs = 'B' then '' else v_abs end;
    end if;
  else
    v_chk := case
      when p_checked then (case when v_chk in ('B', 'BOTH') then 'BOTH' else 'W' end)
      else (case when v_chk = 'BOTH' then 'B' when v_chk = 'W' then '' else v_chk end)
    end;
    if p_checked then
      v_abs := case when v_abs = 'BOTH' then 'B' when v_abs = 'W' then '' else v_abs end;
    end if;
  end if;

  update live_match
     set check_in = v_chk, absent = v_abs, updated_at = now()
   where division_id = p_division_id and round = p_round and table_no = p_table;
end;
$$;

grant execute on function
  public.live_toggle_absent(text, text, text, text, text, boolean)
to anon, authenticated;
