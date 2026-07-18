-- แผนผังงาน (venue floor plan): a public image URL on tournament, shown from the
-- /live board's "🗺️ แผนที่" button. Uploaded by the admin on the tournament form
-- into the public "tesuji" bucket under venue-maps/ (same flow as banner_url).

alter table public.tournament add column if not exists venue_map_url text;

-- upsert_tournament whitelists every column in both its INSERT and UPDATE
-- branches, so it must be re-declared to carry the new field — otherwise
-- 'venueMapUrl' in the payload is silently dropped on save.
create or replace function public.upsert_tournament(p_admin_secret text, p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_id uuid; v_row tournament;
begin
  if not _is_admin(p_admin_secret) then raise exception 'UNAUTHORIZED'; end if;
  v_id := nullif(p_payload->>'id', '')::uuid;
  if v_id is null then
    insert into tournament(name_th, banner_url, venue_map_url, competition_date, location_text, location_maps_url,
      registration_opens_at, registration_closes_at, schedule_text, rules_text,
      promptpay_target_type, promptpay_target_value, status)
    values (p_payload->>'nameTh', nullif(p_payload->>'bannerUrl', ''), nullif(p_payload->>'venueMapUrl', ''),
      coalesce(p_payload->>'competitionDate', ''),
      coalesce(p_payload->>'locationText', ''), coalesce(p_payload->>'locationMapsUrl', ''),
      (p_payload->>'registrationOpensAt')::timestamptz, (p_payload->>'registrationClosesAt')::timestamptz,
      coalesce(p_payload->>'scheduleText', ''), coalesce(p_payload->>'rulesText', ''),
      (coalesce(p_payload->>'promptpayTargetType', 'phone'))::promptpay_target_type,
      coalesce(p_payload->>'promptpayTargetValue', ''),
      (coalesce(p_payload->>'status', 'draft'))::tournament_status)
    returning * into v_row;
  else
    update tournament set name_th = p_payload->>'nameTh', banner_url = nullif(p_payload->>'bannerUrl', ''),
      venue_map_url = nullif(p_payload->>'venueMapUrl', ''),
      competition_date = coalesce(p_payload->>'competitionDate', ''),
      location_text = coalesce(p_payload->>'locationText', ''),
      location_maps_url = coalesce(p_payload->>'locationMapsUrl', ''),
      registration_opens_at = (p_payload->>'registrationOpensAt')::timestamptz,
      registration_closes_at = (p_payload->>'registrationClosesAt')::timestamptz,
      schedule_text = coalesce(p_payload->>'scheduleText', ''), rules_text = coalesce(p_payload->>'rulesText', ''),
      promptpay_target_type = (coalesce(p_payload->>'promptpayTargetType', 'phone'))::promptpay_target_type,
      promptpay_target_value = coalesce(p_payload->>'promptpayTargetValue', ''),
      status = coalesce((nullif(p_payload->>'status', ''))::tournament_status, status), updated_at = now()
    where id = v_id returning * into v_row;
  end if;
  return to_jsonb(v_row);
end; $function$;
