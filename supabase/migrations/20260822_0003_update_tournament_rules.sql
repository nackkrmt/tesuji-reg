-- ── update_tournament_rules: rules-only save ────────────────────────────────
-- /admin/rules used to re-send the WHOLE tournament row through
-- upsert_tournament just to change rules_text — with multiple tournaments
-- being edited concurrently that's a lost-update footgun (a stale rules form
-- silently reverts config fields saved by someone else in between). This RPC
-- updates only rules_text (+ updated_at). Auth mirrors upsert_tournament:
-- _is_admin() gates the caller.

create or replace function public.update_tournament_rules(
  p_admin_secret text,
  p_id uuid,
  p_rules_text text
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_row tournament;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  update tournament
     set rules_text = coalesce(p_rules_text, ''),
         updated_at = now()
   where id = p_id
   returning * into v_row;
  if not found then raise exception 'NOT_FOUND'; end if;
  return to_jsonb(v_row);
end;
$function$;

revoke all on function public.update_tournament_rules(text, uuid, text) from public;
grant execute on function public.update_tournament_rules(text, uuid, text) to anon, authenticated;
