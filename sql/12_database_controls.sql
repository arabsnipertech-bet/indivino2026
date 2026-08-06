-- ============================================================
-- INDIVINO 2026 — STEP 8
-- RIMBORSI CONTANTI, TICKET GRATUITI, CANCELLAZIONE UTENTI
--
-- Prerequisiti:
--   08_database_admin.sql
--   09_positions_customers_badges.sql
--   10_database_stripe.sql
--
-- Funzioni:
--   - separa il credito per origine: contanti/POS/Stripe/omaggio;
--   - consumo FIFO dei lotti di credito;
--   - rimborso amministrativo soltanto del credito contante residuo;
--   - ticket gratuito amministrativo con importi prestabiliti;
--   - informazioni necessarie alla cancellazione/anonimizzazione;
--   - riepilogo economico corretto.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Dati di eliminazione/anomizzazione cliente
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists deleted_at timestamptz;

-- ------------------------------------------------------------
-- Lotti di credito
-- Ogni incremento del portafoglio crea un lotto con la sua origine.
-- Ogni pagamento consuma i lotti in ordine FIFO.
-- ------------------------------------------------------------
create table if not exists public.wallet_credit_lots (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  source_transaction_id uuid unique
    references public.transactions(id) on delete restrict,
  payment_method text not null
    check (payment_method in ('contanti', 'pos', 'stripe', 'omaggio')),
  original_cents bigint not null check (original_cents > 0),
  remaining_cents bigint not null
    check (remaining_cents >= 0 and remaining_cents <= original_cents),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists wallet_credit_lots_wallet_remaining_idx
  on public.wallet_credit_lots (
    wallet_id,
    payment_method,
    created_at,
    id
  )
  where remaining_cents > 0;

create table if not exists public.wallet_credit_consumptions (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid
    references public.transactions(id) on delete restrict,
  credit_lot_id uuid not null
    references public.wallet_credit_lots(id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists wallet_credit_consumptions_unique_idx
  on public.wallet_credit_consumptions (transaction_id, credit_lot_id)
  where transaction_id is not null;

create index if not exists wallet_credit_consumptions_lot_idx
  on public.wallet_credit_consumptions (credit_lot_id);

alter table public.wallet_credit_lots enable row level security;
alter table public.wallet_credit_consumptions enable row level security;

revoke all on table public.wallet_credit_lots from anon;
revoke all on table public.wallet_credit_lots from authenticated;
revoke all on table public.wallet_credit_consumptions from anon;
revoke all on table public.wallet_credit_consumptions from authenticated;

-- Soltanto funzioni server/security definer modificano i lotti.
grant select, insert, update, delete
on table public.wallet_credit_lots
to service_role;

grant select, insert, update, delete
on table public.wallet_credit_consumptions
to service_role;

-- ------------------------------------------------------------
-- Importi ticket gratuito
-- 1, 2, 3, 5 e 10 Divini.
-- ------------------------------------------------------------
create table if not exists public.free_ticket_presets (
  id uuid primary key default gen_random_uuid(),
  amount_cents bigint not null unique
    check (amount_cents > 0 and mod(amount_cents, 200) = 0),
  label text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.free_ticket_presets (
  amount_cents,
  label,
  active,
  sort_order
)
values
  (200,  '1 Divino',  true, 10),
  (400,  '2 Divini', true, 20),
  (600,  '3 Divini', true, 30),
  (1000, '5 Divini', true, 40),
  (2000, '10 Divini', true, 50)
on conflict (amount_cents) do update
set label = excluded.label,
    active = true,
    sort_order = excluded.sort_order;

alter table public.free_ticket_presets enable row level security;
revoke all on table public.free_ticket_presets from anon;
revoke all on table public.free_ticket_presets from authenticated;
grant select on table public.free_ticket_presets to service_role;

-- ------------------------------------------------------------
-- Funzioni private per lotti
-- ------------------------------------------------------------
create or replace function private.add_credit_lot(
  p_wallet_id uuid,
  p_transaction_id uuid,
  p_payment_method text,
  p_amount_cents bigint,
  p_created_at timestamptz default now(),
  p_note text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_method text;
  v_lot_id uuid;
begin
  v_method := lower(trim(coalesce(p_payment_method, '')));

  if v_method not in ('contanti', 'pos', 'stripe', 'omaggio') then
    v_method := 'omaggio';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Importo lotto credito non valido.'
      using errcode = '22023';
  end if;

  insert into public.wallet_credit_lots (
    wallet_id,
    source_transaction_id,
    payment_method,
    original_cents,
    remaining_cents,
    note,
    created_at
  )
  values (
    p_wallet_id,
    p_transaction_id,
    v_method,
    p_amount_cents,
    p_amount_cents,
    p_note,
    coalesce(p_created_at, now())
  )
  on conflict (source_transaction_id) do update
  set note = coalesce(
    public.wallet_credit_lots.note,
    excluded.note
  )
  returning id
  into v_lot_id;

  return v_lot_id;
end;
$$;

revoke all on function private.add_credit_lot(
  uuid, uuid, text, bigint, timestamptz, text
) from public;
revoke all on function private.add_credit_lot(
  uuid, uuid, text, bigint, timestamptz, text
) from anon;
revoke all on function private.add_credit_lot(
  uuid, uuid, text, bigint, timestamptz, text
) from authenticated;

create or replace function private.consume_credit_lots(
  p_wallet_id uuid,
  p_transaction_id uuid,
  p_amount_cents bigint,
  p_only_payment_method text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_remaining bigint;
  v_take bigint;
  v_method text;
  v_lot record;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Importo consumo credito non valido.'
      using errcode = '22023';
  end if;

  v_method := nullif(
    lower(trim(coalesce(p_only_payment_method, ''))),
    ''
  );

  if v_method is not null
     and v_method not in ('contanti', 'pos', 'stripe', 'omaggio') then
    raise exception 'Origine credito non valida.'
      using errcode = '22023';
  end if;

  v_remaining := p_amount_cents;

  for v_lot in
    select
      l.id,
      l.remaining_cents
    from public.wallet_credit_lots l
    where l.wallet_id = p_wallet_id
      and l.remaining_cents > 0
      and (
        v_method is null
        or l.payment_method = v_method
      )
    order by l.created_at, l.id
    for update
  loop
    exit when v_remaining = 0;

    v_take := least(v_lot.remaining_cents, v_remaining);

    update public.wallet_credit_lots
    set remaining_cents = remaining_cents - v_take
    where id = v_lot.id;

    insert into public.wallet_credit_consumptions (
      transaction_id,
      credit_lot_id,
      amount_cents
    )
    values (
      p_transaction_id,
      v_lot.id,
      v_take
    )
    on conflict (transaction_id, credit_lot_id)
      where transaction_id is not null
    do update
    set amount_cents = excluded.amount_cents;

    v_remaining := v_remaining - v_take;
  end loop;

  if v_remaining > 0 then
    if v_method = 'contanti' then
      raise exception 'Credito contante rimborsabile insufficiente.'
        using errcode = 'P0001';
    end if;

    raise exception 'Lotti di credito insufficienti rispetto al saldo.'
      using errcode = 'P0001';
  end if;

  return p_amount_cents;
end;
$$;

revoke all on function private.consume_credit_lots(
  uuid, uuid, bigint, text
) from public;
revoke all on function private.consume_credit_lots(
  uuid, uuid, bigint, text
) from anon;
revoke all on function private.consume_credit_lots(
  uuid, uuid, bigint, text
) from authenticated;

-- ------------------------------------------------------------
-- Ricostruzione una tantum dei lotti storici
-- Usa i saldi prima/dopo già presenti nelle transazioni.
-- ------------------------------------------------------------
do $$
declare
  v_wallet record;
  v_tx record;
  v_delta bigint;
  v_method text;
  v_available bigint;
  v_lot_total bigint;
  v_difference bigint;
begin
  if not exists (
    select 1
    from public.wallet_credit_lots
  ) then
    for v_wallet in
      select w.id, w.balance_cents
      from public.wallets w
      order by w.created_at, w.id
    loop
      for v_tx in
        select t.*
        from public.transactions t
        where t.wallet_id = v_wallet.id
        order by t.created_at, t.id
      loop
        v_delta :=
          v_tx.balance_after_cents -
          v_tx.balance_before_cents;

        if v_delta > 0 then
          v_method := lower(coalesce(v_tx.payment_method, ''));

          if v_method not in (
            'contanti',
            'pos',
            'stripe',
            'omaggio'
          ) then
            v_method := case
              when v_tx.type = 'ricarica'::public.transaction_type
                then 'omaggio'
              else 'omaggio'
            end;
          end if;

          perform private.add_credit_lot(
            v_tx.wallet_id,
            v_tx.id,
            v_method,
            v_delta,
            v_tx.created_at,
            'Ricostruzione storico'
          );

        elsif v_delta < 0 then
          select coalesce(sum(l.remaining_cents), 0)
          into v_available
          from public.wallet_credit_lots l
          where l.wallet_id = v_tx.wallet_id
            and l.remaining_cents > 0;

          if v_available < abs(v_delta) then
            perform private.add_credit_lot(
              v_tx.wallet_id,
              null,
              'omaggio',
              abs(v_delta) - v_available,
              v_tx.created_at - interval '1 microsecond',
              'Rettifica tecnica migrazione'
            );
          end if;

          perform private.consume_credit_lots(
            v_tx.wallet_id,
            v_tx.id,
            abs(v_delta),
            case
              when v_tx.type = 'storno'::public.transaction_type
                and v_tx.payment_method = 'contanti'
                and coalesce(
                  v_tx.metadata ->> 'operation',
                  ''
                ) = 'cash_refund'
              then 'contanti'
              else null
            end
          );
        end if;
      end loop;

      select coalesce(sum(l.remaining_cents), 0)
      into v_lot_total
      from public.wallet_credit_lots l
      where l.wallet_id = v_wallet.id;

      v_difference := v_wallet.balance_cents - v_lot_total;

      if v_difference > 0 then
        perform private.add_credit_lot(
          v_wallet.id,
          null,
          'omaggio',
          v_difference,
          now(),
          'Rettifica saldo iniziale'
        );
      elsif v_difference < 0 then
        perform private.consume_credit_lots(
          v_wallet.id,
          null,
          abs(v_difference),
          null
        );
      end if;
    end loop;
  end if;
end
$$;

-- ------------------------------------------------------------
-- Trigger automatico:
-- ogni futura transazione aggiorna anche i lotti.
-- ------------------------------------------------------------
create or replace function private.sync_credit_lots_from_transaction()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delta bigint;
  v_method text;
begin
  v_delta :=
    new.balance_after_cents -
    new.balance_before_cents;

  if v_delta > 0 then
    v_method := lower(coalesce(new.payment_method, ''));

    if v_method not in (
      'contanti',
      'pos',
      'stripe',
      'omaggio'
    ) then
      v_method := 'omaggio';
    end if;

    perform private.add_credit_lot(
      new.wallet_id,
      new.id,
      v_method,
      v_delta,
      new.created_at,
      coalesce(new.note, 'Credito portafoglio')
    );

  elsif v_delta < 0 then
    perform private.consume_credit_lots(
      new.wallet_id,
      new.id,
      abs(v_delta),
      case
        when new.type = 'storno'::public.transaction_type
          and new.payment_method = 'contanti'
          and coalesce(
            new.metadata ->> 'operation',
            ''
          ) = 'cash_refund'
        then 'contanti'
        else null
      end
    );
  end if;

  return new;
end;
$$;

revoke all on function private.sync_credit_lots_from_transaction()
  from public;
revoke all on function private.sync_credit_lots_from_transaction()
  from anon;
revoke all on function private.sync_credit_lots_from_transaction()
  from authenticated;

drop trigger if exists transactions_sync_credit_lots
  on public.transactions;

create trigger transactions_sync_credit_lots
after insert on public.transactions
for each row
execute function private.sync_credit_lots_from_transaction();

-- ------------------------------------------------------------
-- Ticket gratuiti disponibili
-- ------------------------------------------------------------
create or replace function public.admin_list_free_ticket_presets()
returns table (
  preset_id uuid,
  amount_cents bigint,
  label text
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
    p.amount_cents,
    p.label
  from public.free_ticket_presets p
  where p.active = true
  order by p.sort_order, p.amount_cents;
end;
$$;

revoke all on function public.admin_list_free_ticket_presets()
  from public;
revoke all on function public.admin_list_free_ticket_presets()
  from anon;
grant execute on function public.admin_list_free_ticket_presets()
  to authenticated;

-- ------------------------------------------------------------
-- Ticket gratuito: soltanto amministratore
-- ------------------------------------------------------------
create or replace function public.admin_grant_free_ticket(
  p_user_id uuid,
  p_preset_id uuid,
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
  v_admin_id uuid;
  v_wallet public.wallets%rowtype;
  v_profile public.profiles%rowtype;
  v_preset public.free_ticket_presets%rowtype;
  v_existing public.transactions%rowtype;
  v_transaction public.transactions%rowtype;
  v_before bigint;
  v_after bigint;
begin
  v_admin_id := private.require_admin();

  if p_idempotency_key is null then
    raise exception 'Codice operazione mancante.'
      using errcode = '22023';
  end if;

  select t.*
  into v_existing
  from public.transactions t
  where t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.operator_id <> v_admin_id
       or v_existing.type <> 'ricarica'::public.transaction_type
       or v_existing.payment_method <> 'omaggio' then
      raise exception 'Codice operazione già utilizzato.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'transaction_id', v_existing.id,
      'amount_cents', v_existing.amount_cents,
      'balance_before_cents', v_existing.balance_before_cents,
      'balance_after_cents', v_existing.balance_after_cents,
      'duplicate_prevented', true
    );
  end if;

  select p.*
  into v_preset
  from public.free_ticket_presets p
  where p.id = p_preset_id
    and p.active = true;

  if not found then
    raise exception 'Importo ticket gratuito non disponibile.'
      using errcode = 'P0002';
  end if;

  select p.*
  into v_profile
  from public.profiles p
  where p.id = p_user_id
    and p.role = 'cliente'::public.app_role
    and p.active = true
    and p.deleted_at is null;

  if not found then
    raise exception 'Cliente non disponibile.'
      using errcode = 'P0002';
  end if;

  select w.*
  into v_wallet
  from public.wallets w
  where w.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Portafoglio non disponibile.'
      using errcode = 'P0002';
  end if;

  if v_wallet.blocked then
    raise exception 'Portafoglio bloccato.'
      using errcode = '42501';
  end if;

  v_before := v_wallet.balance_cents;
  v_after := v_before + v_preset.amount_cents;

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
    v_preset.amount_cents,
    v_admin_id,
    v_before,
    v_after,
    p_idempotency_key,
    'omaggio',
    nullif(trim(p_note), ''),
    jsonb_build_object(
      'operation', 'free_ticket',
      'preset_id', v_preset.id,
      'preset_label', v_preset.label
    )
  )
  returning *
  into v_transaction;

  return jsonb_build_object(
    'transaction_id', v_transaction.id,
    'amount_cents', v_transaction.amount_cents,
    'balance_before_cents', v_transaction.balance_before_cents,
    'balance_after_cents', v_transaction.balance_after_cents,
    'duplicate_prevented', false
  );
end;
$$;

revoke all on function public.admin_grant_free_ticket(
  uuid, uuid, uuid, text
) from public;
revoke all on function public.admin_grant_free_ticket(
  uuid, uuid, uuid, text
) from anon;
grant execute on function public.admin_grant_free_ticket(
  uuid, uuid, uuid, text
) to authenticated;

-- ------------------------------------------------------------
-- Rimborso contanti: soltanto amministratore
-- Il credito POS, Stripe e omaggio non è rimborsabile.
-- ------------------------------------------------------------
create or replace function public.admin_cash_refund(
  p_user_id uuid,
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
  v_admin_id uuid;
  v_wallet public.wallets%rowtype;
  v_profile public.profiles%rowtype;
  v_existing public.transactions%rowtype;
  v_transaction public.transactions%rowtype;
  v_refundable_cash bigint;
  v_before bigint;
  v_after bigint;
begin
  v_admin_id := private.require_admin();

  if p_idempotency_key is null then
    raise exception 'Codice operazione mancante.'
      using errcode = '22023';
  end if;

  if p_amount_cents is null
     or p_amount_cents < 200
     or mod(p_amount_cents, 200) <> 0 then
    raise exception 'Il rimborso deve essere un multiplo di 2 €.'
      using errcode = '22023';
  end if;

  if p_note is not null and char_length(trim(p_note)) > 160 then
    raise exception 'La motivazione non può superare 160 caratteri.'
      using errcode = '22023';
  end if;

  select t.*
  into v_existing
  from public.transactions t
  where t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.operator_id <> v_admin_id
       or v_existing.type <> 'storno'::public.transaction_type
       or v_existing.payment_method <> 'contanti' then
      raise exception 'Codice operazione già utilizzato.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'transaction_id', v_existing.id,
      'amount_cents', v_existing.amount_cents,
      'balance_before_cents', v_existing.balance_before_cents,
      'balance_after_cents', v_existing.balance_after_cents,
      'duplicate_prevented', true
    );
  end if;

  select p.*
  into v_profile
  from public.profiles p
  where p.id = p_user_id
    and p.role = 'cliente'::public.app_role
    and p.deleted_at is null;

  if not found then
    raise exception 'Cliente non disponibile.'
      using errcode = 'P0002';
  end if;

  select w.*
  into v_wallet
  from public.wallets w
  where w.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Portafoglio non disponibile.'
      using errcode = 'P0002';
  end if;

  select coalesce(sum(l.remaining_cents), 0)
  into v_refundable_cash
  from public.wallet_credit_lots l
  where l.wallet_id = v_wallet.id
    and l.payment_method = 'contanti'
    and l.remaining_cents > 0;

  if p_amount_cents > v_refundable_cash then
    raise exception
      'Importo superiore al credito contante rimborsabile: % €.',
      to_char(v_refundable_cash / 100.0, 'FM999999990.00')
      using errcode = 'P0001';
  end if;

  if p_amount_cents > v_wallet.balance_cents then
    raise exception 'Saldo portafoglio insufficiente.'
      using errcode = 'P0001';
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
    'storno'::public.transaction_type,
    p_amount_cents,
    v_admin_id,
    v_before,
    v_after,
    p_idempotency_key,
    'contanti',
    nullif(trim(p_note), ''),
    jsonb_build_object(
      'operation', 'cash_refund',
      'cash_returned_to_customer', true
    )
  )
  returning *
  into v_transaction;

  return jsonb_build_object(
    'transaction_id', v_transaction.id,
    'amount_cents', v_transaction.amount_cents,
    'balance_before_cents', v_transaction.balance_before_cents,
    'balance_after_cents', v_transaction.balance_after_cents,
    'refundable_cash_after_cents',
      v_refundable_cash - p_amount_cents,
    'duplicate_prevented', false
  );
end;
$$;

revoke all on function public.admin_cash_refund(
  uuid, bigint, uuid, text
) from public;
revoke all on function public.admin_cash_refund(
  uuid, bigint, uuid, text
) from anon;
grant execute on function public.admin_cash_refund(
  uuid, bigint, uuid, text
) to authenticated;

-- ------------------------------------------------------------
-- Elenco clienti esteso
-- ------------------------------------------------------------
drop function if exists public.admin_list_customers(text, integer);

create function public.admin_list_customers(
  p_query text default null,
  p_limit integer default 200
)
returns table (
  user_id uuid,
  first_name text,
  last_name text,
  auth_email text,
  contact_email text,
  customer_source text,
  badge_code text,
  wallet_id uuid,
  qr_token uuid,
  balance_cents bigint,
  refundable_cash_cents bigint,
  blocked boolean,
  active boolean,
  deleted_at timestamptz,
  transaction_count bigint,
  stripe_payment_count bigint,
  can_hard_delete boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text;
  v_limit integer;
begin
  perform private.require_admin();

  v_query := lower(trim(coalesce(p_query, '')));
  v_limit := least(greatest(coalesce(p_limit, 200), 1), 1000);

  return query
  select
    p.id,
    p.first_name,
    p.last_name,
    p.email,
    p.contact_email,
    p.customer_source,
    p.badge_code,
    w.id,
    w.qr_token,
    w.balance_cents,
    coalesce((
      select sum(l.remaining_cents)
      from public.wallet_credit_lots l
      where l.wallet_id = w.id
        and l.payment_method = 'contanti'
        and l.remaining_cents > 0
    ), 0)::bigint,
    w.blocked,
    p.active,
    p.deleted_at,
    (
      select count(*)
      from public.transactions t
      where t.wallet_id = w.id
    )::bigint,
    (
      select count(*)
      from public.stripe_payments sp
      where sp.wallet_id = w.id
    )::bigint,
    (
      w.balance_cents = 0
      and not exists (
        select 1
        from public.transactions t
        where t.wallet_id = w.id
      )
      and not exists (
        select 1
        from public.stripe_payments sp
        where sp.wallet_id = w.id
      )
    )::boolean,
    p.created_at
  from public.profiles p
  join public.wallets w
    on w.user_id = p.id
  where p.role = 'cliente'::public.app_role
    and (
      v_query = ''
      or lower(p.first_name) like '%' || v_query || '%'
      or lower(p.last_name) like '%' || v_query || '%'
      or lower(p.first_name || ' ' || p.last_name)
        like '%' || v_query || '%'
      or lower(coalesce(p.contact_email, ''))
        like '%' || v_query || '%'
      or lower(p.email) like '%' || v_query || '%'
      or lower(coalesce(p.badge_code, ''))
        like '%' || v_query || '%'
      or lower(w.qr_token::text) like '%' || v_query || '%'
    )
  order by
    case when p.deleted_at is null then 0 else 1 end,
    p.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.admin_list_customers(text, integer)
  from public;
revoke all on function public.admin_list_customers(text, integer)
  from anon;
grant execute on function public.admin_list_customers(text, integer)
  to authenticated;

-- ------------------------------------------------------------
-- Anonimizzazione contabile
-- Usata dall'Edge Function quando esistono movimenti.
-- ------------------------------------------------------------
create or replace function public.admin_anonymize_customer(
  p_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets%rowtype;
  v_suffix text;
begin
  perform private.require_admin();

  select w.*
  into v_wallet
  from public.wallets w
  join public.profiles p on p.id = w.user_id
  where p.id = p_user_id
    and p.role = 'cliente'::public.app_role
  for update;

  if not found then
    raise exception 'Cliente non trovato.'
      using errcode = 'P0002';
  end if;

  if v_wallet.balance_cents <> 0 then
    raise exception
      'Il cliente non può essere cancellato finché il saldo non è zero.'
      using errcode = 'P0001';
  end if;

  v_suffix := substr(replace(p_user_id::text, '-', ''), 1, 10);

  update public.profiles
  set first_name = 'Cliente',
      last_name = 'eliminato ' || v_suffix,
      email = 'deleted.' || v_suffix || '@deleted.indivino.local',
      contact_email = null,
      badge_code = null,
      active = false,
      deleted_at = now(),
      updated_at = now()
  where id = p_user_id;

  update public.wallets
  set blocked = true,
      updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'user_id', p_user_id,
    'mode', 'anonymized'
  );
end;
$$;

revoke all on function public.admin_anonymize_customer(uuid)
  from public;
revoke all on function public.admin_anonymize_customer(uuid)
  from anon;
grant execute on function public.admin_anonymize_customer(uuid)
  to authenticated;

-- ------------------------------------------------------------
-- Riepilogo controlli economici
-- ------------------------------------------------------------
create or replace function public.admin_control_summary(
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
    'free_ticket_cents',
      coalesce(sum(t.amount_cents) filter (
        where t.type = 'ricarica'::public.transaction_type
          and t.payment_method = 'omaggio'
          and coalesce(
            t.metadata ->> 'operation',
            ''
          ) = 'free_ticket'
          and t.created_at between p_from and p_to
      ), 0)::bigint,
    'free_ticket_count',
      count(*) filter (
        where t.type = 'ricarica'::public.transaction_type
          and t.payment_method = 'omaggio'
          and coalesce(
            t.metadata ->> 'operation',
            ''
          ) = 'free_ticket'
          and t.created_at between p_from and p_to
      )::bigint,
    'cash_refund_cents',
      coalesce(sum(t.amount_cents) filter (
        where t.type = 'storno'::public.transaction_type
          and t.payment_method = 'contanti'
          and coalesce(
            t.metadata ->> 'operation',
            ''
          ) = 'cash_refund'
          and t.created_at between p_from and p_to
      ), 0)::bigint,
    'cash_refund_count',
      count(*) filter (
        where t.type = 'storno'::public.transaction_type
          and t.payment_method = 'contanti'
          and coalesce(
            t.metadata ->> 'operation',
            ''
          ) = 'cash_refund'
          and t.created_at between p_from and p_to
      )::bigint,
    'cash_refund_all_time_cents',
      coalesce(sum(t.amount_cents) filter (
        where t.type = 'storno'::public.transaction_type
          and t.payment_method = 'contanti'
          and coalesce(
            t.metadata ->> 'operation',
            ''
          ) = 'cash_refund'
      ), 0)::bigint,
    'refundable_cash_total_cents',
      coalesce((
        select sum(l.remaining_cents)
        from public.wallet_credit_lots l
        where l.payment_method = 'contanti'
          and l.remaining_cents > 0
      ), 0)::bigint
  )
  into v_result
  from public.transactions t;

  return v_result;
end;
$$;

revoke all on function public.admin_control_summary(
  timestamptz, timestamptz
) from public;
revoke all on function public.admin_control_summary(
  timestamptz, timestamptz
) from anon;
grant execute on function public.admin_control_summary(
  timestamptz, timestamptz
) to authenticated;

-- ------------------------------------------------------------
-- Permessi server necessari all'Edge Function
-- ------------------------------------------------------------
grant usage on schema public to service_role;

grant select, update
on table public.profiles
to service_role;

grant select, update
on table public.wallets
to service_role;

grant select
on table public.transactions
to service_role;

grant select
on table public.stripe_payments
to service_role;

commit;

-- ------------------------------------------------------------
-- Verifica finale
-- ------------------------------------------------------------
select
  to_regclass('public.wallet_credit_lots') as credit_lots,
  to_regclass('public.wallet_credit_consumptions') as credit_consumptions,
  to_regclass('public.free_ticket_presets') as free_ticket_presets,
  (
    select count(*)
    from public.free_ticket_presets
    where active = true
  ) as active_presets,
  (
    select coalesce(sum(w.balance_cents), 0)
    from public.wallets w
  ) as wallet_balances_cents,
  (
    select coalesce(sum(l.remaining_cents), 0)
    from public.wallet_credit_lots l
  ) as credit_lots_remaining_cents;
