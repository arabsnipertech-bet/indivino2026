-- ============================================================
-- INDIVINO 2026 — STEP 7: RICARICA ONLINE STRIPE
--
-- Prerequisiti:
--   08_database_admin.sql
--   09_positions_customers_badges.sql
--
-- Aggiunge:
--   - registro Checkout Stripe;
--   - RLS: il cliente vede soltanto i propri pagamenti;
--   - registrazione idempotente delle sessioni;
--   - accredito atomico dopo webhook firmato;
--   - riepilogo Stripe nell'amministrazione.
-- ============================================================

begin;

do $$
begin
  create type public.stripe_payment_status as enum (
    'pending',
    'paid',
    'cancelled',
    'expired',
    'failed',
    'refunded'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.stripe_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  checkout_session_id text not null unique,
  checkout_url text,
  payment_intent_id text,
  stripe_event_id text,
  idempotency_key uuid not null unique,
  amount_cents bigint not null
    check (
      amount_cents in (1000, 2000, 3000, 5000)
    ),
  currency text not null default 'eur'
    check (lower(currency) = 'eur'),
  status public.stripe_payment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index if not exists stripe_payments_payment_intent_unique_idx
  on public.stripe_payments (payment_intent_id)
  where payment_intent_id is not null;

create unique index if not exists stripe_payments_event_unique_idx
  on public.stripe_payments (stripe_event_id)
  where stripe_event_id is not null;

create index if not exists stripe_payments_user_created_idx
  on public.stripe_payments (user_id, created_at desc);

create index if not exists stripe_payments_status_created_idx
  on public.stripe_payments (status, created_at desc);

drop trigger if exists stripe_payments_set_updated_at
  on public.stripe_payments;

create trigger stripe_payments_set_updated_at
before update on public.stripe_payments
for each row execute function public.set_updated_at();

alter table public.stripe_payments enable row level security;

revoke all on table public.stripe_payments from anon;
revoke all on table public.stripe_payments from authenticated;

grant select on table public.stripe_payments to authenticated;
grant select, insert, update on table public.stripe_payments to service_role;

drop policy if exists "stripe_payments_select_own"
  on public.stripe_payments;

create policy "stripe_payments_select_own"
on public.stripe_payments
for select
to authenticated
using (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
);

-- ------------------------------------------------------------
-- Registra una sessione Checkout creata dalla Edge Function
-- ------------------------------------------------------------
create or replace function public.stripe_register_checkout(
  p_user_id uuid,
  p_wallet_id uuid,
  p_checkout_session_id text,
  p_checkout_url text,
  p_amount_cents bigint,
  p_currency text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_wallet public.wallets%rowtype;
  v_payment public.stripe_payments%rowtype;
begin
  if p_amount_cents not in (1000, 2000, 3000, 5000) then
    raise exception 'Importo Stripe non consentito.'
      using errcode = '22023';
  end if;

  if lower(coalesce(p_currency, '')) <> 'eur' then
    raise exception 'Valuta Stripe non consentita.'
      using errcode = '22023';
  end if;

  select p.*
  into v_profile
  from public.profiles p
  where p.id = p_user_id
    and p.role = 'cliente'::public.app_role
    and p.active = true;

  if not found then
    raise exception 'Cliente non disponibile.'
      using errcode = 'P0002';
  end if;

  select w.*
  into v_wallet
  from public.wallets w
  where w.id = p_wallet_id
    and w.user_id = p_user_id;

  if not found then
    raise exception 'Portafoglio non disponibile.'
      using errcode = 'P0002';
  end if;

  if v_wallet.blocked then
    raise exception 'Portafoglio bloccato.'
      using errcode = '42501';
  end if;

  insert into public.stripe_payments (
    user_id,
    wallet_id,
    checkout_session_id,
    checkout_url,
    idempotency_key,
    amount_cents,
    currency,
    status
  )
  values (
    p_user_id,
    p_wallet_id,
    trim(p_checkout_session_id),
    p_checkout_url,
    p_idempotency_key,
    p_amount_cents,
    'eur',
    'pending'::public.stripe_payment_status
  )
  on conflict (idempotency_key) do update
  set checkout_session_id = excluded.checkout_session_id,
      checkout_url = excluded.checkout_url,
      updated_at = now()
  where public.stripe_payments.user_id = excluded.user_id
    and public.stripe_payments.wallet_id = excluded.wallet_id
  returning *
  into v_payment;

  if v_payment.id is null then
    raise exception 'Codice richiesta già utilizzato da un altro portafoglio.'
      using errcode = '23505';
  end if;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'checkout_session_id', v_payment.checkout_session_id,
    'status', v_payment.status
  );
end;
$$;

revoke all on function public.stripe_register_checkout(
  uuid, uuid, text, text, bigint, text, uuid
) from public;
revoke all on function public.stripe_register_checkout(
  uuid, uuid, text, text, bigint, text, uuid
) from anon;
revoke all on function public.stripe_register_checkout(
  uuid, uuid, text, text, bigint, text, uuid
) from authenticated;
grant execute on function public.stripe_register_checkout(
  uuid, uuid, text, text, bigint, text, uuid
) to service_role;

-- ------------------------------------------------------------
-- Accredita il portafoglio dopo verifica firma Stripe
-- Tutta l'operazione è atomica.
-- ------------------------------------------------------------
create or replace function public.stripe_apply_paid_checkout(
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_stripe_event_id text,
  p_amount_cents bigint,
  p_currency text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_payment public.stripe_payments%rowtype;
  v_wallet public.wallets%rowtype;
  v_transaction public.transactions%rowtype;
  v_before bigint;
  v_after bigint;
begin
  select sp.*
  into v_payment
  from public.stripe_payments sp
  where sp.checkout_session_id = trim(p_checkout_session_id)
  for update;

  if not found then
    raise exception 'Sessione Stripe non registrata.'
      using errcode = 'P0002';
  end if;

  if v_payment.status = 'paid'::public.stripe_payment_status then
    return jsonb_build_object(
      'payment_id', v_payment.id,
      'status', 'paid',
      'duplicate_prevented', true
    );
  end if;

  if v_payment.amount_cents <> p_amount_cents then
    raise exception 'Importo Stripe non corrispondente.'
      using errcode = '22023';
  end if;

  if lower(v_payment.currency) <> lower(coalesce(p_currency, '')) then
    raise exception 'Valuta Stripe non corrispondente.'
      using errcode = '22023';
  end if;

  if trim(coalesce(p_payment_intent_id, '')) = '' then
    raise exception 'PaymentIntent Stripe mancante.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.stripe_payments sp
    where sp.stripe_event_id = p_stripe_event_id
      and sp.id <> v_payment.id
  ) then
    raise exception 'Evento Stripe già utilizzato.'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.stripe_payments sp
    where sp.payment_intent_id = p_payment_intent_id
      and sp.id <> v_payment.id
  ) then
    raise exception 'PaymentIntent Stripe già utilizzato.'
      using errcode = '23505';
  end if;

  select w.*
  into v_wallet
  from public.wallets w
  where w.id = v_payment.wallet_id
    and w.user_id = v_payment.user_id
  for update;

  if not found then
    raise exception 'Portafoglio Stripe non disponibile.'
      using errcode = 'P0002';
  end if;

  v_before := v_wallet.balance_cents;
  v_after := v_before + v_payment.amount_cents;

  update public.wallets
  set balance_cents = v_after,
      updated_at = now()
  where id = v_wallet.id;

  insert into public.transactions (
    wallet_id,
    type,
    amount_cents,
    operator_id,
    cashier_station_id,
    balance_before_cents,
    balance_after_cents,
    idempotency_key,
    payment_method,
    note,
    metadata
  )
  values (
    v_wallet.id,
    'ricarica'::public.transaction_type,
    v_payment.amount_cents,
    null,
    null,
    v_before,
    v_after,
    v_payment.idempotency_key,
    'stripe',
    'Ricarica online Stripe',
    jsonb_build_object(
      'source', 'stripe_checkout',
      'stripe_checkout_session_id', v_payment.checkout_session_id,
      'stripe_payment_intent_id', p_payment_intent_id,
      'stripe_event_id', p_stripe_event_id
    )
  )
  returning *
  into v_transaction;

  update public.stripe_payments
  set status = 'paid'::public.stripe_payment_status,
      payment_intent_id = p_payment_intent_id,
      stripe_event_id = p_stripe_event_id,
      paid_at = now(),
      updated_at = now()
  where id = v_payment.id;

  return jsonb_build_object(
    'payment_id', v_payment.id,
    'transaction_id', v_transaction.id,
    'amount_cents', v_payment.amount_cents,
    'balance_before_cents', v_before,
    'balance_after_cents', v_after,
    'status', 'paid',
    'duplicate_prevented', false
  );
end;
$$;

revoke all on function public.stripe_apply_paid_checkout(
  text, text, text, bigint, text
) from public;
revoke all on function public.stripe_apply_paid_checkout(
  text, text, text, bigint, text
) from anon;
revoke all on function public.stripe_apply_paid_checkout(
  text, text, text, bigint, text
) from authenticated;
grant execute on function public.stripe_apply_paid_checkout(
  text, text, text, bigint, text
) to service_role;

-- ------------------------------------------------------------
-- Aggiorna gli stati non pagati
-- ------------------------------------------------------------
create or replace function public.stripe_mark_checkout_status(
  p_checkout_session_id text,
  p_status public.stripe_payment_status,
  p_stripe_event_id text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_status not in (
    'cancelled'::public.stripe_payment_status,
    'expired'::public.stripe_payment_status,
    'failed'::public.stripe_payment_status
  ) then
    raise exception 'Stato Stripe non consentito.'
      using errcode = '22023';
  end if;

  update public.stripe_payments
  set status = p_status,
      stripe_event_id = coalesce(p_stripe_event_id, stripe_event_id),
      updated_at = now()
  where checkout_session_id = trim(p_checkout_session_id)
    and status <> 'paid'::public.stripe_payment_status;

  return found;
end;
$$;

revoke all on function public.stripe_mark_checkout_status(
  text, public.stripe_payment_status, text
) from public;
revoke all on function public.stripe_mark_checkout_status(
  text, public.stripe_payment_status, text
) from anon;
revoke all on function public.stripe_mark_checkout_status(
  text, public.stripe_payment_status, text
) from authenticated;
grant execute on function public.stripe_mark_checkout_status(
  text, public.stripe_payment_status, text
) to service_role;

-- ------------------------------------------------------------
-- Riepilogo Stripe per amministratore
-- ------------------------------------------------------------
create or replace function public.admin_stripe_summary(
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_admin();

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Periodo non valido.'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'stripe_cents',
      coalesce(sum(sp.amount_cents) filter (
        where sp.status = 'paid'::public.stripe_payment_status
      ), 0)::bigint,
    'stripe_count',
      count(*) filter (
        where sp.status = 'paid'::public.stripe_payment_status
      )::bigint,
    'pending_count',
      count(*) filter (
        where sp.status = 'pending'::public.stripe_payment_status
      )::bigint
  )
  into v_result
  from public.stripe_payments sp
  where sp.created_at between p_from and p_to;

  return v_result;
end;
$$;

revoke all on function public.admin_stripe_summary(timestamptz, timestamptz)
  from public;
revoke all on function public.admin_stripe_summary(timestamptz, timestamptz)
  from anon;
grant execute on function public.admin_stripe_summary(timestamptz, timestamptz)
  to authenticated;

commit;

-- Verifica finale
select
  to_regclass('public.stripe_payments') as stripe_table,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'stripe_register_checkout',
        'stripe_apply_paid_checkout',
        'stripe_mark_checkout_status',
        'admin_stripe_summary'
      )
  ) as stripe_functions;
