-- Promo / discount / free-registration codes — additive schema + helpers.
-- Money stays server-authoritative: discount is applied to registration_batch.total_amount_thb
-- (the single source the QR amount + slip-check both read), never on the client.
-- Codes are scoped per-tournament. Tables are RLS-on with NO client policies — touched only
-- through SECURITY DEFINER RPCs, consistent with the rest of the schema.

-- ── promo_code ──────────────────────────────────────────────────────────────
create table if not exists public.promo_code (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournament(id) on delete cascade,
  code          text not null,
  kind          text not null check (kind in ('free', 'percent', 'fixed')),
  value         numeric(10, 2) not null default 0,   -- percent: 0–100 · fixed: THB · free: ignored
  max_uses      int,                                  -- null = unlimited
  used_count    int not null default 0,
  valid_from    timestamptz,
  valid_until   timestamptz,
  active        boolean not null default true,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- one code string per tournament (case-insensitive)
create unique index if not exists promo_code_tournament_code_uniq
  on public.promo_code (tournament_id, upper(code));

alter table public.promo_code enable row level security;  -- no policies: RPC-only access

-- ── promo_redemption ────────────────────────────────────────────────────────
create table if not exists public.promo_redemption (
  id           uuid primary key default gen_random_uuid(),
  promo_id     uuid not null references public.promo_code(id) on delete cascade,
  batch_id     uuid not null references public.registration_batch(id) on delete cascade,
  account_id   uuid references auth.users(id),
  discount_thb numeric(10, 2) not null default 0,
  redeemed_at  timestamptz not null default now()
);

-- one redemption per batch (used_count is incremented exactly once, at submit)
create unique index if not exists promo_redemption_batch_uniq
  on public.promo_redemption (batch_id);

alter table public.promo_redemption enable row level security;  -- no policies: RPC-only access

-- ── registration_batch: carry the applied promo + discount on the batch ──────
alter table public.registration_batch
  add column if not exists promo_code   text,
  add column if not exists promo_kind   text,
  add column if not exists promo_value  numeric(10, 2),
  add column if not exists discount_thb numeric(10, 2) not null default 0;

-- ── helpers ─────────────────────────────────────────────────────────────────
-- Discount amount for a (kind, value) against a gross subtotal. Pure.
create or replace function public._promo_discount(p_kind text, p_value numeric, p_gross numeric)
returns numeric
language sql immutable
set search_path to 'public'
as $$
  select case p_kind
    when 'free'    then coalesce(p_gross, 0)
    when 'percent' then round(coalesce(p_gross, 0) * least(greatest(coalesce(p_value, 0), 0), 100) / 100.0, 2)
    when 'fixed'   then least(coalesce(p_gross, 0), greatest(coalesce(p_value, 0), 0))
    else 0
  end;
$$;

-- Recompute a batch's total from its seat fees + its stored promo (kind/value).
-- Degrades to plain sum(fee_thb_snapshot) when no promo is set, so it is a drop-in
-- replacement for the old recompute used by admin_update_seat / admin_delete_seat.
create or replace function public._recompute_batch_total(p_batch_id uuid)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_b     registration_batch;
  v_gross numeric(10, 2);
  v_disc  numeric(10, 2);
begin
  select * into v_b from registration_batch where id = p_batch_id;
  select coalesce(sum(fee_thb_snapshot), 0) into v_gross
    from registration_seat where batch_id = p_batch_id;
  v_disc := _promo_discount(v_b.promo_kind, v_b.promo_value, v_gross);
  update registration_batch
    set discount_thb = v_disc,
        total_amount_thb = greatest(0, v_gross - v_disc),
        updated_at = now()
  where id = p_batch_id;
end;
$$;
