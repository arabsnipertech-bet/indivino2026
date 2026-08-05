-- ============================================================
-- INDIVINO 2026 — STEP 5: AMMINISTRAZIONE CENTRALE
--
-- Prerequisiti:
--   01_database_step2.sql
--   03_database_cassa.sql
--   05_database_stand.sql
--
-- Questo script:
--   - crea CASSA01–CASSA20;
--   - porta gli stand a STAND01–STAND15;
--   - associa arabsnipertech@gmail.com a CASSA01;
--   - promuove lo stesso account ad amministratore;
--   - attribuisce ogni nuova ricarica alla postazione cassa;
--   - crea statistiche e registri protetti per l'amministratore.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Postazioni cassa
-- ------------------------------------------------------------
create table if not exists public.cashier_stations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cashier_operators (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  cashier_station_id uuid not null references public.cashier_stations(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists cashier_operators_station_idx
  on public.cashier_operators (cashier_station_id);

alter table public.transactions
  add column if not exists cashier_station_id uuid
  references public.cashier_stations(id) on delete restrict;

create index if not exists transactions_cashier_created_idx
  on public.transactions (cashier_station_id, created_at desc);

-- La voce Stripe viene predisposta per il passaggio successivo.
alter table public.transactions
  drop constraint if exists transactions_payment_method_check;

alter table public.transactions
  add constraint transactions_payment_method_check
  check (
    payment_method is null
    or payment_method in ('contanti', 'pos', 'stripe', 'omaggio')
  );

insert into public.cashier_stations (code, name, active)
select
  'CASSA' || lpad(n::text, 2, '0'),
  'Cassa ' || lpad(n::text, 2, '0'),
  true
from generate_series(1, 20) as n
on conflict (code) do update
set active = true;

insert into public.stands (code, name, active)
select
  'STAND' || lpad(n::text, 2, '0'),
  'Stand ' || lpad(n::text, 2, '0'),
  true
from generate_series(1, 15) as n
on conflict (code) do update
set active = true;

-- ------------------------------------------------------------
-- RLS delle nuove tabelle
-- ------------------------------------------------------------
alter table public.cashier_stations enable row level security;
alter table public.cashier_operators enable row level security;

revoke all on table public.cashier_stations from anon;
revoke all on table public.cashier_operators from anon;
revoke all on table public.cashier_stations from authenticated;
revoke all on table public.cashier_operators from authenticated;

grant select on table public.cashier_stations to authenticated;
grant select on table public.cashier_operators to authenticated;

drop policy if exists "cashier_stations_select_active"
  on public.cashier_stations;

create policy "cashier_stations_select_active"
on public.cashier_stations
for select
to authenticated
using (active = true);

drop policy if exists "cashier_operators_select_own"
  on public.cashier_operators;

create policy "cashier_operators_select_own"
on public.cashier_operators
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

-- ------------------------------------------------------------
-- Contesto cassa corrente
-- ------------------------------------------------------------
create or replace function private.current_cashier_station_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select co.cashier_station_id
  from public.cashier_operators co
  join public.profiles p
    on p.id = co.user_id
  join public.cashier_stations cs
    on cs.id = co.cashier_station_id
  where co.user_id = (select auth.uid())
    and co.active = true
    and p.active = true
    and p.role in (
      'cassa'::public.app_role,
      'admin'::public.app_role
    )
    and cs.active = true
  limit 1;
$$;

revoke all on function private.current_cashier_station_id() from public;
revoke all on function private.current_cashier_station_id() from anon;
revoke all on function private.current_cashier_station_id() from authenticated;

create or replace function private.require_cashier_station_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
begin
  perform private.require_app_role(
    array['cassa', 'admin']::public.app_role[]
  );

  v_station_id := private.current_cashier_station_id();

  if v_station_id is null then
    raise exception 'Permesso negato: account non associato a una cassa attiva.'
      using errcode = '42501';
  end if;

  return v_station_id;
end;
$$;

revoke all on function private.require_cashier_station_id() from public;
revoke all on function private.require_cashier_station_id() from anon;
revoke all on function private.require_cashier_station_id() from authenticated;

create or replace function public.cassa_get_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
  v_result jsonb;
begin
  v_station_id := private.require_cashier_station_id();

  select jsonb_build_object(
    'cashier_station_id', cs.id,
    'cashier_code', cs.code,
    'cashier_name', cs.name
  )
  into v_result
  from public.cashier_stations cs
  where cs.id = v_station_id
    and cs.active = true;

  return v_result;
end;
$$;

revoke all on function public.cassa_get_context() from public;
revoke all on function public.cassa_get_context() from anon;
grant execute on function public.cassa_get_context() to authenticated;

-- ------------------------------------------------------------
-- Nuova versione della ricarica: registra la postazione cassa
-- ------------------------------------------------------------
create or replace function public.cassa_recharge_wallet(
  p_wallet_id uuid,
  p_amount_cents bigint,
  p_payment_method text,
  p_idempotency_key uuid,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_operator_id uuid;
  v_cashier_station_id uuid;
  v_wallet public.wallets%rowtype;
  v_customer public.profiles%rowtype;
  v_existing public.transactions%rowtype;
  v_transaction public.transactions%rowtype;
  v_before bigint;
  v_after bigint;
  v_method text;
begin
  v_role := private.require_app_role(
    array['cassa', 'admin']::public.app_role[]
  );
  v_cashier_station_id := private.require_cashier_station_id();
  v_operator_id := (select auth.uid());
  v_method := lower(trim(coalesce(p_payment_method, '')));

  if p_wallet_id is null then
    raise exception 'Portafoglio non valido.'
      using errcode = '22023';
  end if;

  if p_idempotency_key is null then
    raise exception 'Codice operazione mancante.'
      using errcode = '22023';
  end if;

  if p_amount_cents is null
     or p_amount_cents < 200
     or p_amount_cents > 50000
     or mod(p_amount_cents, 200) <> 0 then
    raise exception 'Importo non valido: usare un multiplo di 2 €, da 2 € a 500 €.'
      using errcode = '22023';
  end if;

  if v_method not in ('contanti', 'pos', 'omaggio') then
    raise exception 'Metodo di pagamento non valido.'
      using errcode = '22023';
  end if;

  if v_method = 'omaggio' and v_role <> 'admin'::public.app_role then
    raise exception 'Solo un amministratore può effettuare una ricarica omaggio.'
      using errcode = '42501';
  end if;

  if p_note is not null and char_length(p_note) > 160 then
    raise exception 'La nota non può superare 160 caratteri.'
      using errcode = '22023';
  end if;

  select t.*
  into v_existing
  from public.transactions t
  where t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.operator_id <> v_operator_id
       or v_existing.wallet_id <> p_wallet_id
       or v_existing.type <> 'ricarica'::public.transaction_type then
      raise exception 'Codice operazione già utilizzato.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'transaction_id', v_existing.id,
      'wallet_id', v_existing.wallet_id,
      'cashier_station_id', v_existing.cashier_station_id,
      'amount_cents', v_existing.amount_cents,
      'payment_method', v_existing.payment_method,
      'balance_before_cents', v_existing.balance_before_cents,
      'balance_after_cents', v_existing.balance_after_cents,
      'created_at', v_existing.created_at,
      'duplicate_prevented', true
    );
  end if;

  select w.*
  into v_wallet
  from public.wallets w
  where w.id = p_wallet_id
  for update;

  if not found then
    raise exception 'Portafoglio non trovato.'
      using errcode = 'P0002';
  end if;

  select p.*
  into v_customer
  from public.profiles p
  where p.id = v_wallet.user_id;

  if not found
     or v_customer.active = false
     or v_customer.role <> 'cliente'::public.app_role then
    raise exception 'Cliente non disponibile.'
      using errcode = 'P0002';
  end if;

  if v_wallet.blocked then
    raise exception 'Portafoglio bloccato.'
      using errcode = '42501';
  end if;

  select t.*
  into v_existing
  from public.transactions t
  where t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.operator_id <> v_operator_id
       or v_existing.wallet_id <> p_wallet_id
       or v_existing.type <> 'ricarica'::public.transaction_type then
      raise exception 'Codice operazione già utilizzato.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'transaction_id', v_existing.id,
      'wallet_id', v_existing.wallet_id,
      'cashier_station_id', v_existing.cashier_station_id,
      'amount_cents', v_existing.amount_cents,
      'payment_method', v_existing.payment_method,
      'balance_before_cents', v_existing.balance_before_cents,
      'balance_after_cents', v_existing.balance_after_cents,
      'created_at', v_existing.created_at,
      'duplicate_prevented', true
    );
  end if;

  v_before := v_wallet.balance_cents;
  v_after := v_before + p_amount_cents;

  update public.wallets
  set balance_cents = v_after,
      updated_at = now()
  where id = v_wallet.id;

  insert into public.transactions (
    wallet_id,
    type,
    amount_cents,
    cashier_station_id,
    operator_id,
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
    p_amount_cents,
    v_cashier_station_id,
    v_operator_id,
    v_before,
    v_after,
    p_idempotency_key,
    v_method,
    nullif(trim(p_note), ''),
    jsonb_build_object(
      'source', 'cassa_web',
      'customer_user_id', v_customer.id
    )
  )
  returning *
  into v_transaction;

  return jsonb_build_object(
    'transaction_id', v_transaction.id,
    'wallet_id', v_transaction.wallet_id,
    'cashier_station_id', v_transaction.cashier_station_id,
    'amount_cents', v_transaction.amount_cents,
    'payment_method', v_transaction.payment_method,
    'balance_before_cents', v_transaction.balance_before_cents,
    'balance_after_cents', v_transaction.balance_after_cents,
    'created_at', v_transaction.created_at,
    'duplicate_prevented', false
  );
end;
$$;

revoke all on function public.cassa_recharge_wallet(
  uuid, bigint, text, uuid, text
) from public;
revoke all on function public.cassa_recharge_wallet(
  uuid, bigint, text, uuid, text
) from anon;
grant execute on function public.cassa_recharge_wallet(
  uuid, bigint, text, uuid, text
) to authenticated;

-- ------------------------------------------------------------
-- Riepilogo cassa basato sulla postazione, non solo sull'operatore
-- ------------------------------------------------------------
create or replace function public.cassa_daily_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
  v_result jsonb;
begin
  v_station_id := private.require_cashier_station_id();

  select jsonb_build_object(
    'operations_count', count(*)::bigint,
    'total_cents', coalesce(sum(t.amount_cents), 0)::bigint,
    'cash_cents', coalesce(sum(t.amount_cents) filter (
      where t.payment_method = 'contanti'
    ), 0)::bigint,
    'pos_cents', coalesce(sum(t.amount_cents) filter (
      where t.payment_method = 'pos'
    ), 0)::bigint
  )
  into v_result
  from public.transactions t
  where t.type = 'ricarica'::public.transaction_type
    and t.cashier_station_id = v_station_id
    and (t.created_at at time zone 'Europe/Rome')::date
      = (now() at time zone 'Europe/Rome')::date;

  return v_result;
end;
$$;

revoke all on function public.cassa_daily_summary() from public;
revoke all on function public.cassa_daily_summary() from anon;
grant execute on function public.cassa_daily_summary() to authenticated;

create or replace function public.cassa_recent_recharges(
  p_limit integer default 20
)
returns table (
  transaction_id uuid,
  first_name text,
  last_name text,
  amount_cents bigint,
  payment_method text,
  balance_after_cents bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_station_id uuid;
  v_limit integer;
begin
  v_station_id := private.require_cashier_station_id();
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 100);

  return query
  select
    t.id,
    p.first_name,
    p.last_name,
    t.amount_cents,
    t.payment_method,
    t.balance_after_cents,
    t.created_at
  from public.transactions t
  join public.wallets w on w.id = t.wallet_id
  join public.profiles p on p.id = w.user_id
  where t.type = 'ricarica'::public.transaction_type
    and t.cashier_station_id = v_station_id
  order by t.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.cassa_recent_recharges(integer) from public;
revoke all on function public.cassa_recent_recharges(integer) from anon;
grant execute on function public.cassa_recent_recharges(integer) to authenticated;

-- ------------------------------------------------------------
-- Amministrazione
-- ------------------------------------------------------------
create or replace function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  perform private.require_app_role(
    array['admin']::public.app_role[]
  );

  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'Permesso negato: amministratore non autenticato.'
      using errcode = '42501';
  end if;

  return v_user_id;
end;
$$;

revoke all on function private.require_admin() from public;
revoke all on function private.require_admin() from anon;
revoke all on function private.require_admin() from authenticated;

create or replace function public.admin_get_dashboard(
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
  v_totals jsonb;
  v_cashiers jsonb;
  v_stands jsonb;
  v_hourly jsonb;
  v_staff jsonb;
begin
  perform private.require_admin();

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Periodo non valido.'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    'customers_count',
      count(*) filter (
        where p.role = 'cliente'::public.app_role
          and p.active = true
      ),
    'remaining_cents',
      coalesce(sum(w.balance_cents) filter (
        where p.role = 'cliente'::public.app_role
          and p.active = true
      ), 0),
    'loaded_cents',
      coalesce((
        select sum(t.amount_cents)
        from public.transactions t
        where t.type = 'ricarica'::public.transaction_type
          and t.created_at between p_from and p_to
      ), 0),
    'spent_cents',
      coalesce((
        select sum(t.amount_cents)
        from public.transactions t
        where t.type = 'pagamento'::public.transaction_type
          and t.created_at between p_from and p_to
      ), 0),
    'loaded_all_time_cents',
      coalesce((
        select sum(t.amount_cents)
        from public.transactions t
        where t.type = 'ricarica'::public.transaction_type
      ), 0),
    'spent_all_time_cents',
      coalesce((
        select sum(t.amount_cents)
        from public.transactions t
        where t.type = 'pagamento'::public.transaction_type
      ), 0),
    'cash_cents',
      coalesce((
        select sum(t.amount_cents)
        from public.transactions t
        where t.type = 'ricarica'::public.transaction_type
          and t.payment_method = 'contanti'
          and t.created_at between p_from and p_to
      ), 0),
    'pos_cents',
      coalesce((
        select sum(t.amount_cents)
        from public.transactions t
        where t.type = 'ricarica'::public.transaction_type
          and t.payment_method = 'pos'
          and t.created_at between p_from and p_to
      ), 0),
    'recharge_count',
      (
        select count(*)
        from public.transactions t
        where t.type = 'ricarica'::public.transaction_type
          and t.created_at between p_from and p_to
      ),
    'payment_count',
      (
        select count(*)
        from public.transactions t
        where t.type = 'pagamento'::public.transaction_type
          and t.created_at between p_from and p_to
      )
  )
  into v_totals
  from public.profiles p
  left join public.wallets w on w.user_id = p.id;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.total_cents desc, r.code), '[]'::jsonb)
  into v_cashiers
  from (
    select
      cs.code,
      cs.name,
      count(t.id)::bigint as operations_count,
      coalesce(sum(t.amount_cents), 0)::bigint as total_cents,
      coalesce(sum(t.amount_cents) filter (
        where t.payment_method = 'contanti'
      ), 0)::bigint as cash_cents,
      coalesce(sum(t.amount_cents) filter (
        where t.payment_method = 'pos'
      ), 0)::bigint as pos_cents,
      coalesce(round(avg(t.amount_cents)), 0)::bigint as average_cents
    from public.cashier_stations cs
    left join public.transactions t
      on t.cashier_station_id = cs.id
      and t.type = 'ricarica'::public.transaction_type
      and t.created_at between p_from and p_to
    where cs.active = true
    group by cs.id, cs.code, cs.name
  ) r;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.total_cents desc, r.code), '[]'::jsonb)
  into v_stands
  from (
    select
      s.code,
      s.name,
      count(t.id)::bigint as operations_count,
      count(distinct t.wallet_id)::bigint as unique_customers,
      coalesce(sum(t.amount_cents), 0)::bigint as total_cents,
      coalesce(round(avg(t.amount_cents)), 0)::bigint as average_cents
    from public.stands s
    left join public.transactions t
      on t.stand_id = s.id
      and t.type = 'pagamento'::public.transaction_type
      and t.created_at between p_from and p_to
    where s.active = true
    group by s.id, s.code, s.name
  ) r;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.hour), '[]'::jsonb)
  into v_hourly
  from (
    select
      h.hour,
      coalesce(sum(t.amount_cents) filter (
        where t.type = 'ricarica'::public.transaction_type
      ), 0)::bigint as loaded_cents,
      coalesce(sum(t.amount_cents) filter (
        where t.type = 'pagamento'::public.transaction_type
      ), 0)::bigint as spent_cents
    from generate_series(0, 23) as h(hour)
    left join public.transactions t
      on extract(hour from t.created_at at time zone 'Europe/Rome')::integer = h.hour
      and t.created_at between p_from and p_to
    group by h.hour
  ) r;

  select jsonb_build_object(
    'cashier_positions_configured',
      (select count(*) from public.cashier_stations where active = true),
    'stand_positions_configured',
      (select count(*) from public.stands where active = true),
    'active_staff',
      (
        select count(*)
        from public.profiles p
        where p.active = true
          and p.role in (
            'cassa'::public.app_role,
            'stand'::public.app_role,
            'admin'::public.app_role
          )
      ),
    'active_admins',
      (
        select count(*)
        from public.profiles p
        where p.active = true
          and p.role = 'admin'::public.app_role
      )
  )
  into v_staff;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'totals', v_totals,
    'cashiers', v_cashiers,
    'stands', v_stands,
    'hourly', v_hourly,
    'staff', v_staff
  );
end;
$$;

revoke all on function public.admin_get_dashboard(timestamptz, timestamptz)
  from public;
revoke all on function public.admin_get_dashboard(timestamptz, timestamptz)
  from anon;
grant execute on function public.admin_get_dashboard(timestamptz, timestamptz)
  to authenticated;

create or replace function public.admin_list_staff()
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  role public.app_role,
  active boolean,
  position_code text,
  position_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  return query
  select
    p.id,
    p.first_name,
    p.last_name,
    p.email,
    p.role,
    p.active,
    coalesce(cs.code, s.code) as position_code,
    coalesce(cs.name, s.name) as position_name
  from public.profiles p
  left join public.cashier_operators co
    on co.user_id = p.id
  left join public.cashier_stations cs
    on cs.id = co.cashier_station_id
  left join public.stand_operators so
    on so.user_id = p.id
  left join public.stands s
    on s.id = so.stand_id
  where p.role in (
    'cassa'::public.app_role,
    'stand'::public.app_role,
    'admin'::public.app_role
  )
  order by
    case p.role
      when 'admin'::public.app_role then 0
      when 'cassa'::public.app_role then 1
      else 2
    end,
    coalesce(cs.code, s.code),
    p.last_name,
    p.first_name;
end;
$$;

revoke all on function public.admin_list_staff() from public;
revoke all on function public.admin_list_staff() from anon;
grant execute on function public.admin_list_staff() to authenticated;

create or replace function public.admin_set_staff_active(
  p_user_id uuid,
  p_active boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  perform private.require_admin();

  select p.role
  into v_role
  from public.profiles p
  where p.id = p_user_id;

  if not found then
    raise exception 'Operatore non trovato.'
      using errcode = 'P0002';
  end if;

  if v_role = 'admin'::public.app_role then
    raise exception 'L’amministratore principale non può essere disattivato da questa funzione.'
      using errcode = '42501';
  end if;

  update public.profiles
  set active = p_active,
      updated_at = now()
  where id = p_user_id;

  update public.cashier_operators
  set active = p_active
  where user_id = p_user_id;

  update public.stand_operators
  set active = p_active
  where user_id = p_user_id;

  return true;
end;
$$;

revoke all on function public.admin_set_staff_active(uuid, boolean)
  from public;
revoke all on function public.admin_set_staff_active(uuid, boolean)
  from anon;
grant execute on function public.admin_set_staff_active(uuid, boolean)
  to authenticated;

create or replace function public.admin_recent_transactions(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 100
)
returns table (
  transaction_id uuid,
  created_at timestamptz,
  type public.transaction_type,
  amount_cents bigint,
  customer_label text,
  operator_label text,
  position_code text,
  position_name text,
  payment_method text,
  balance_before_cents bigint,
  balance_after_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer;
begin
  perform private.require_admin();

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Periodo non valido.'
      using errcode = '22023';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 100), 1), 10000);

  return query
  select
    t.id,
    t.created_at,
    t.type,
    t.amount_cents,
    cp.first_name || ' ' || cp.last_name as customer_label,
    case
      when op.id is null then null
      else op.first_name || ' ' || op.last_name
    end as operator_label,
    coalesce(cs.code, s.code) as position_code,
    coalesce(cs.name, s.name) as position_name,
    t.payment_method,
    t.balance_before_cents,
    t.balance_after_cents
  from public.transactions t
  join public.wallets w
    on w.id = t.wallet_id
  join public.profiles cp
    on cp.id = w.user_id
  left join public.profiles op
    on op.id = t.operator_id
  left join public.cashier_stations cs
    on cs.id = t.cashier_station_id
  left join public.stands s
    on s.id = t.stand_id
  where t.created_at between p_from and p_to
  order by t.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.admin_recent_transactions(
  timestamptz, timestamptz, integer
) from public;
revoke all on function public.admin_recent_transactions(
  timestamptz, timestamptz, integer
) from anon;
grant execute on function public.admin_recent_transactions(
  timestamptz, timestamptz, integer
) to authenticated;

-- ------------------------------------------------------------
-- Associazione amministratore principale a CASSA01
-- ------------------------------------------------------------
do $$
declare
  v_admin_id uuid;
  v_cassa01_id uuid;
begin
  select p.id
  into v_admin_id
  from public.profiles p
  where lower(p.email) = lower('arabsnipertech@gmail.com')
  limit 1;

  if v_admin_id is null then
    raise exception 'Account arabsnipertech@gmail.com non trovato.';
  end if;

  select cs.id
  into v_cassa01_id
  from public.cashier_stations cs
  where cs.code = 'CASSA01'
  limit 1;

  update public.profiles
  set role = 'admin'::public.app_role,
      active = true,
      updated_at = now()
  where id = v_admin_id;

  insert into public.cashier_operators (
    user_id,
    cashier_station_id,
    active
  )
  values (
    v_admin_id,
    v_cassa01_id,
    true
  )
  on conflict (user_id) do update
  set cashier_station_id = excluded.cashier_station_id,
      active = true;

  -- Attribuisce a CASSA01 le ricariche di prova già effettuate
  -- dallo stesso account prima dell'introduzione delle postazioni.
  update public.transactions
  set cashier_station_id = v_cassa01_id
  where type = 'ricarica'::public.transaction_type
    and operator_id = v_admin_id
    and cashier_station_id is null;
end
$$;

commit;

-- Verifica finale
select
  p.email,
  p.role,
  cs.code as cashier_code,
  cs.name as cashier_name,
  p.active
from public.profiles p
left join public.cashier_operators co on co.user_id = p.id
left join public.cashier_stations cs on cs.id = co.cashier_station_id
where lower(p.email) = lower('arabsnipertech@gmail.com');

select
  (select count(*) from public.cashier_stations where active = true) as cashiers,
  (select count(*) from public.stands where active = true) as stands;
