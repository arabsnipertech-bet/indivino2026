-- ============================================================
-- INDIVINO 2026 — STEP 4: AREA STAND
--
-- Eseguire UNA SOLA VOLTA dopo:
--   01_database_step2.sql
--   03_database_cassa.sql
--
-- Aggiunge:
--   - riconoscimento dello stand associato all'operatore;
--   - lettura protetta del QR cliente;
--   - pagamento atomico con controllo saldo;
--   - protezione dal doppio addebito;
--   - riepilogo e ultime operazioni dello stand.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Funzioni private di contesto stand
-- ------------------------------------------------------------
create or replace function private.current_stand_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select so.stand_id
  from public.stand_operators so
  join public.profiles p
    on p.id = so.user_id
  join public.stands s
    on s.id = so.stand_id
  where so.user_id = (select auth.uid())
    and so.active = true
    and p.active = true
    and p.role = 'stand'::public.app_role
    and s.active = true
  limit 1;
$$;

revoke all on function private.current_stand_id() from public;
revoke all on function private.current_stand_id() from anon;
revoke all on function private.current_stand_id() from authenticated;

create or replace function private.require_stand_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stand_id uuid;
begin
  v_stand_id := private.current_stand_id();

  if v_stand_id is null then
    raise exception 'Permesso negato: account non associato a uno stand attivo.'
      using errcode = '42501';
  end if;

  return v_stand_id;
end;
$$;

revoke all on function private.require_stand_id() from public;
revoke all on function private.require_stand_id() from anon;
revoke all on function private.require_stand_id() from authenticated;

-- ------------------------------------------------------------
-- Contesto dello stand corrente
-- ------------------------------------------------------------
create or replace function public.stand_get_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stand_id uuid;
  v_result jsonb;
begin
  v_stand_id := private.require_stand_id();

  select jsonb_build_object(
    'stand_id', s.id,
    'stand_code', s.code,
    'stand_name', s.name,
    'stand_description', s.description
  )
  into v_result
  from public.stands s
  where s.id = v_stand_id
    and s.active = true;

  return v_result;
end;
$$;

revoke all on function public.stand_get_context() from public;
revoke all on function public.stand_get_context() from anon;
grant execute on function public.stand_get_context() to authenticated;

-- ------------------------------------------------------------
-- Lettura QR cliente
-- Restituisce solo informazioni minime:
-- nome abbreviato, iniziali, saldo e stato.
-- ------------------------------------------------------------
create or replace function public.stand_lookup_wallet(
  p_qr_token text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stand_id uuid;
  v_token uuid;
  v_result jsonb;
begin
  v_stand_id := private.require_stand_id();

  begin
    v_token := trim(
      case
        when upper(coalesce(p_qr_token, '')) like 'INDIVINO:%'
          then substring(
            trim(p_qr_token)
            from position(':' in trim(p_qr_token)) + 1
          )
        else trim(p_qr_token)
      end
    )::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Codice QR non valido.'
        using errcode = '22023';
  end;

  select jsonb_build_object(
    'wallet_id', w.id,
    'customer_label',
      p.first_name || ' ' || left(p.last_name, 1) || '.',
    'initials',
      upper(left(p.first_name, 1) || left(p.last_name, 1)),
    'balance_cents', w.balance_cents,
    'blocked', w.blocked
  )
  into v_result
  from public.wallets w
  join public.profiles p
    on p.id = w.user_id
  where w.qr_token = v_token
    and p.role = 'cliente'::public.app_role
    and p.active = true;

  if v_result is null then
    raise exception 'QR non riconosciuto o portafoglio non disponibile.'
      using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

revoke all on function public.stand_lookup_wallet(text) from public;
revoke all on function public.stand_lookup_wallet(text) from anon;
grant execute on function public.stand_lookup_wallet(text) to authenticated;

-- ------------------------------------------------------------
-- Pagamento atomico allo stand
-- ------------------------------------------------------------
create or replace function public.stand_charge_wallet(
  p_wallet_id uuid,
  p_amount_cents bigint,
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
  v_stand_id uuid;
  v_operator_id uuid;
  v_wallet public.wallets%rowtype;
  v_customer public.profiles%rowtype;
  v_existing public.transactions%rowtype;
  v_transaction public.transactions%rowtype;
  v_before bigint;
  v_after bigint;
begin
  v_stand_id := private.require_stand_id();
  v_operator_id := (select auth.uid());

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
     or p_amount_cents > 10000
     or mod(p_amount_cents, 200) <> 0 then
    raise exception 'Importo non valido: usare da 1 a 50 Divini.'
      using errcode = '22023';
  end if;

  if p_note is not null and char_length(p_note) > 120 then
    raise exception 'La nota non può superare 120 caratteri.'
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
       or v_existing.stand_id <> v_stand_id
       or v_existing.type <> 'pagamento'::public.transaction_type
       or v_existing.amount_cents <> p_amount_cents then
      raise exception 'Codice operazione già utilizzato.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'transaction_id', v_existing.id,
      'wallet_id', v_existing.wallet_id,
      'stand_id', v_existing.stand_id,
      'amount_cents', v_existing.amount_cents,
      'balance_before_cents', v_existing.balance_before_cents,
      'balance_after_cents', v_existing.balance_after_cents,
      'created_at', v_existing.created_at,
      'duplicate_prevented', true
    );
  end if;

  -- Blocca il portafoglio per serializzare ricariche e pagamenti.
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

  if v_wallet.balance_cents < p_amount_cents then
    raise exception 'Saldo insufficiente.'
      using errcode = 'P0001';
  end if;

  -- Ricontrollo dopo il lock.
  select t.*
  into v_existing
  from public.transactions t
  where t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.operator_id <> v_operator_id
       or v_existing.wallet_id <> p_wallet_id
       or v_existing.stand_id <> v_stand_id
       or v_existing.type <> 'pagamento'::public.transaction_type
       or v_existing.amount_cents <> p_amount_cents then
      raise exception 'Codice operazione già utilizzato.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'transaction_id', v_existing.id,
      'wallet_id', v_existing.wallet_id,
      'stand_id', v_existing.stand_id,
      'amount_cents', v_existing.amount_cents,
      'balance_before_cents', v_existing.balance_before_cents,
      'balance_after_cents', v_existing.balance_after_cents,
      'created_at', v_existing.created_at,
      'duplicate_prevented', true
    );
  end if;

  v_before := v_wallet.balance_cents;
  v_after := v_before - p_amount_cents;

  update public.wallets
  set balance_cents = v_after,
      updated_at = now()
  where id = v_wallet.id;

  insert into public.transactions (
    wallet_id,
    type,
    amount_cents,
    stand_id,
    operator_id,
    balance_before_cents,
    balance_after_cents,
    idempotency_key,
    note,
    metadata
  )
  values (
    v_wallet.id,
    'pagamento'::public.transaction_type,
    p_amount_cents,
    v_stand_id,
    v_operator_id,
    v_before,
    v_after,
    p_idempotency_key,
    nullif(trim(p_note), ''),
    jsonb_build_object(
      'source', 'stand_web',
      'divini', p_amount_cents / 200,
      'customer_user_id', v_customer.id
    )
  )
  returning *
  into v_transaction;

  return jsonb_build_object(
    'transaction_id', v_transaction.id,
    'wallet_id', v_transaction.wallet_id,
    'stand_id', v_transaction.stand_id,
    'amount_cents', v_transaction.amount_cents,
    'balance_before_cents', v_transaction.balance_before_cents,
    'balance_after_cents', v_transaction.balance_after_cents,
    'created_at', v_transaction.created_at,
    'duplicate_prevented', false
  );
end;
$$;

revoke all on function public.stand_charge_wallet(
  uuid, bigint, uuid, text
) from public;
revoke all on function public.stand_charge_wallet(
  uuid, bigint, uuid, text
) from anon;
grant execute on function public.stand_charge_wallet(
  uuid, bigint, uuid, text
) to authenticated;

-- ------------------------------------------------------------
-- Riepilogo giornaliero dell'intero stand
-- ------------------------------------------------------------
create or replace function public.stand_daily_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stand_id uuid;
  v_result jsonb;
begin
  v_stand_id := private.require_stand_id();

  select jsonb_build_object(
    'operations_count', count(*)::bigint,
    'total_cents', coalesce(sum(t.amount_cents), 0)::bigint,
    'unique_customers', count(distinct t.wallet_id)::bigint,
    'average_cents',
      coalesce(round(avg(t.amount_cents)), 0)::bigint
  )
  into v_result
  from public.transactions t
  where t.type = 'pagamento'::public.transaction_type
    and t.stand_id = v_stand_id
    and (t.created_at at time zone 'Europe/Rome')::date
      = (now() at time zone 'Europe/Rome')::date;

  return v_result;
end;
$$;

revoke all on function public.stand_daily_summary() from public;
revoke all on function public.stand_daily_summary() from anon;
grant execute on function public.stand_daily_summary() to authenticated;

-- ------------------------------------------------------------
-- Ultimi pagamenti dell'intero stand
-- ------------------------------------------------------------
create or replace function public.stand_recent_payments(
  p_limit integer default 20
)
returns table (
  transaction_id uuid,
  customer_label text,
  amount_cents bigint,
  balance_after_cents bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stand_id uuid;
  v_limit integer;
begin
  v_stand_id := private.require_stand_id();
  v_limit := least(greatest(coalesce(p_limit, 20), 1), 100);

  return query
  select
    t.id,
    p.first_name || ' ' || left(p.last_name, 1) || '.',
    t.amount_cents,
    t.balance_after_cents,
    t.created_at
  from public.transactions t
  join public.wallets w
    on w.id = t.wallet_id
  join public.profiles p
    on p.id = w.user_id
  where t.type = 'pagamento'::public.transaction_type
    and t.stand_id = v_stand_id
  order by t.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.stand_recent_payments(integer) from public;
revoke all on function public.stand_recent_payments(integer) from anon;
grant execute on function public.stand_recent_payments(integer) to authenticated;

commit;

-- Verifica: devono apparire cinque funzioni pubbliche dello stand.
select
  p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'stand_get_context',
    'stand_lookup_wallet',
    'stand_charge_wallet',
    'stand_daily_summary',
    'stand_recent_payments'
  )
order by p.proname;
