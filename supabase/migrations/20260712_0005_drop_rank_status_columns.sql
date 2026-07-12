-- Remove the pending-rank review system — part 2/2: drop the columns.
--
-- ⚠ APPLY ORDER: run this ONLY after the client that no longer sends
-- rank_status in its profile/managed_player upsert (personToRow) is deployed.
-- The previously-deployed client includes rank_status in the upsert payload;
-- dropping the column while it is still live makes every profile save fail with
-- "column rank_status does not exist". 20260712_0004 (which stops the DB side
-- from using these columns) is safe to apply anytime; THIS one is the gated step.
--
-- Nothing reads these columns after 0004: reserve_seats never used rank_status,
-- the review RPCs are dropped, and _propagate_person_ranks / admin_selective_reset
-- were rewritten to not reference them.

alter table public.profile
  drop column if exists rank_status,
  drop column if exists rank_reviewed_by,
  drop column if exists rank_reviewed_at,
  drop column if exists rank_review_note;

alter table public.managed_player
  drop column if exists rank_status,
  drop column if exists rank_reviewed_by,
  drop column if exists rank_reviewed_at,
  drop column if exists rank_review_note;
