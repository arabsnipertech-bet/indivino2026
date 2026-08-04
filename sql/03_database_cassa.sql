-- ============================================================
-- INDIVINO 2026 — STEP 3: AREA CASSA
--
-- Eseguire UNA SOLA VOLTA dopo 01_database_step2.sql.
-- Aggiunge:
--   - ricerca protetta dei clienti;
--   - ricarica atomica del portafoglio;
--   - metodo di pagamento contanti/POS;
--   - idempotenza contro doppio clic;
--   - riepilogo giornaliero;
--   - ultime ricariche dell'operatore.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Metodo di pagamento nelle transazioni
-- ------------------------------------------------------------
alter table public.transactions
  add column if not exists payment_method text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_payment_method_check'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_payment_method_check
      check (
        payment_method is null
        or payment_method in ('contanti', 'pos', 'omaggio')
      );
  end if;
end
$$;

create index if not exists transactions_type_created_idx
  on public.transactions (type, created_at desc);

-- ------------------------------------------------------------
-- Schema interno non esposto direttamente alla Data API
-- ------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

-- Restituisce il ruolo corrente leggendo profiles con privilegi del creatore.
create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active = true
  limit 1;
$$;

revoke all on function private.current_app_role() from public;
revoke all on function private.current_app_role() from anon;
revoke all on function private.current_app_role() from authenticated;

-- Interrompe la funzione se l'utente non ha un ruolo ammesso.
create or replace function private.require_app_role(
  p_allowed public.app_role[]
)
returns public.app_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  v_role := private.current_app_role();

  if v_role is null or not (v_role = any(p_allowed)) then
    raise exception 'Permesso negato: ruolo non autorizzato.'
      using errcode = '42501';
  end if;

  return v_role;
end;
$$;

revoke all on function private.require_app_role(public.app_role[]) from public;
revoke all on function private.require_app_role(public.app_role[]) from anon;
revoke all on function private.require_app_role(public.app_role[]) from authenticated;

-- ------------------------------------------------------------
-- Ricerca clienti
-- ------------------------------------------------------------
create or replace function public.cassa_search_customers(
  p_query text
)
returns table (
  wallet_id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  balance_cents bigint,
  blocked boolean,
  qr_token uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text;
  v_normalized text;
  v_token uuid;
begin
  perform private.require_app_role(
    array['cassa', 'admin']::public.app_role[]
  );

  v_query := trim(coalesce(p_query, ''));

  if char_length(v_query) < 2 then
    raise exception 'Inserire almeno due caratteri.'
      using errcode = '22023';
  end if;

  if upper(v_query) like 'INDIVINO:%' then
    v_query := trim(substring(v_query from position(':' in v_query) + 1));
  end if;

  begin
    v_token := v_query::uuid;
  exception
    when invalid_text_representation then
      v_token := null;
  end;

  v_normalized := lower(v_query);

  return query
  select
    w.id as wallet_id,
    p.id as user_id,
    p.first_name,
    p.last_name,
    p.email,
    w.balance_cents,
    w.blocked,
    w.qr_token
  from public.profiles p
  join public.wallets w on w.user_id = p.id
  where p.role = 'cliente'::public.app_role
    and p.active = true
    and (
      (v_token is not null and w.qr_token = v_token)
      or lower(p.email) like '%' || v_normalized || '%'
      or lower(p.first_name) like '%' || v_normalized || '%'
      or lower(p.last_name) like '%' || v_normalized || '%'
      or lower(p.first_name || ' ' || p.last_name) like '%' || v_normalized || '%'
      or lower(p.last_name || ' ' || p.first_name) like '%' || v_normalized || '%'
    )
  order by
    case when v_token is not null and w.qr_token = v_token then 0 else 1 end,
    p.last_name,
    p.first_name
  limit 20;
end;
$$;

revoke all on function public.cassa_search_customers(text) from public;
revoke all on function public.cassa_search_customers(text) from anon;
grant execute on function public.cassa_search_customers(text) to authenticated;

-- ------------------------------------------------------------
-- Ricarica atomica
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

  -- Primo controllo idempotenza.
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
      'amount_cents', v_existing.amount_cents,
      'payment_method', v_existing.payment_method,
      'balance_before_cents', v_existing.balance_before_cents,
      'balance_after_cents', v_existing.balance_after_cents,
      'created_at', v_existing.created_at,
      'duplicate_prevented', true
    );
  end if;

  -- Blocca la riga del portafoglio fino al termine dell'operazione.
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

  -- Ricontrollo dopo il lock: protegge da due richieste simultanee.
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
-- Riepilogo giornaliero dell'operatore corrente
-- ------------------------------------------------------------
create or replace function public.cassa_daily_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_operator_id uuid;
  v_result jsonb;
begin
  perform private.require_app_role(
    array['cassa', 'admin']::public.app_role[]
  );

  v_operator_id := (select auth.uid());

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
    and t.operator_id = v_operator_id
    and (t.created_at at time zone 'Europe/Rome')::date
      = (now() at time zone 'Europe/Rome')::date;

  return v_result;
end;
$$;

revoke all on function public.cassa_daily_summary() from public;
revoke all on function public.cassa_daily_summary() from anon;
grant execute on function public.cassa_daily_summary() to authenticated;

-- ------------------------------------------------------------
-- Ultime ricariche dell'operatore corrente
-- ------------------------------------------------------------
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
  v_operator_id uuid;
  v_limit integer;
begin
  perform private.require_app_role(
    array['cassa', 'admin']::public.app_role[]
  );

  v_operator_id := (select auth.uid());
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
    and t.operator_id = v_operator_id
  order by t.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.cassa_recent_recharges(integer) from public;
revoke all on function public.cassa_recent_recharges(integer) from anon;
grant execute on function public.cassa_recent_recharges(integer) to authenticated;

commit;

-- Verifica: devono comparire quattro funzioni pubbliche della cassa.
select
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'cassa_search_customers',
    'cassa_recharge_wallet',
    'cassa_daily_summary',
    'cassa_recent_recharges'
  )
order by p.proname;
