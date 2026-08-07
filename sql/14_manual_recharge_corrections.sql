-- ============================================================
-- INDIVINO 2026 — STEP 10
-- CORREZIONE DELLE RICARICHE MANUALI
--
-- Prerequisiti:
--   12_database_controls.sql
--   13_operator_access_and_install.sql
--
-- Funzioni:
--   - corregge ricariche manuali contanti/POS;
--   - conserva sempre la ricarica originale;
--   - crea una rettifica positiva o negativa;
--   - collega ogni rettifica all'operazione originale;
--   - impedisce di sottrarre credito già consumato;
--   - aggiorna i lotti mantenendo l'origine contanti/POS;
--   - aggiorna dashboard, classifiche e registro movimenti.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Gruppo di origine del credito
-- Una ricarica originale e tutte le sue correzioni condividono
-- lo stesso root_transaction_id.
-- ------------------------------------------------------------
alter table public.wallet_credit_lots
  add column if not exists root_transaction_id uuid
  references public.transactions(id) on delete restrict;

update public.wallet_credit_lots
set root_transaction_id = source_transaction_id
where root_transaction_id is null
  and source_transaction_id is not null;

create index if not exists wallet_credit_lots_root_remaining_idx
  on public.wallet_credit_lots (
    wallet_id,
    root_transaction_id,
    created_at,
    id
  )
  where remaining_cents > 0;

-- ------------------------------------------------------------
-- Funzione standard aggiornata:
-- i crediti normali hanno come radice la propria transazione.
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
    root_transaction_id,
    payment_method,
    original_cents,
    remaining_cents,
    note,
    created_at
  )
  values (
    p_wallet_id,
    p_transaction_id,
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
      ),
      root_transaction_id = coalesce(
        public.wallet_credit_lots.root_transaction_id,
        excluded.root_transaction_id
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

-- ------------------------------------------------------------
-- Aggiunge credito a una ricarica originale già esistente.
-- ------------------------------------------------------------
create or replace function private.add_credit_lot_for_root(
  p_wallet_id uuid,
  p_transaction_id uuid,
  p_root_transaction_id uuid,
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

  if v_method not in ('contanti', 'pos') then
    raise exception 'Metodo correzione non valido.'
      using errcode = '22023';
  end if;

  if p_transaction_id is null or p_root_transaction_id is null then
    raise exception 'Riferimento correzione mancante.'
      using errcode = '22023';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Importo correzione non valido.'
      using errcode = '22023';
  end if;

  insert into public.wallet_credit_lots (
    wallet_id,
    source_transaction_id,
    root_transaction_id,
    payment_method,
    original_cents,
    remaining_cents,
    note,
    created_at
  )
  values (
    p_wallet_id,
    p_transaction_id,
    p_root_transaction_id,
    v_method,
    p_amount_cents,
    p_amount_cents,
    p_note,
    coalesce(p_created_at, now())
  )
  returning id
  into v_lot_id;

  return v_lot_id;
end;
$$;

revoke all on function private.add_credit_lot_for_root(
  uuid, uuid, uuid, text, bigint, timestamptz, text
) from public;
revoke all on function private.add_credit_lot_for_root(
  uuid, uuid, uuid, text, bigint, timestamptz, text
) from anon;
revoke all on function private.add_credit_lot_for_root(
  uuid, uuid, uuid, text, bigint, timestamptz, text
) from authenticated;

-- ------------------------------------------------------------
-- Riduce soltanto il credito ancora disponibile della ricarica
-- originale selezionata e delle sue precedenti correzioni.
-- Le aggiunte più recenti vengono annullate per prime.
-- ------------------------------------------------------------
create or replace function private.consume_credit_lots_for_root(
  p_wallet_id uuid,
  p_transaction_id uuid,
  p_root_transaction_id uuid,
  p_amount_cents bigint
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
  v_lot record;
begin
  if p_transaction_id is null
     or p_root_transaction_id is null
     or p_amount_cents is null
     or p_amount_cents <= 0 then
    raise exception 'Dati correzione credito non validi.'
      using errcode = '22023';
  end if;

  v_remaining := p_amount_cents;

  for v_lot in
    select
      l.id,
      l.remaining_cents
    from public.wallet_credit_lots l
    where l.wallet_id = p_wallet_id
      and l.root_transaction_id = p_root_transaction_id
      and l.remaining_cents > 0
    order by l.created_at desc, l.id desc
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
    raise exception
      'Una parte del credito della ricarica è già stata utilizzata. Riduzione massima disponibile: % €.',
      to_char(
        (p_amount_cents - v_remaining) / 100.0,
        'FM999999990.00'
      )
      using errcode = 'P0001';
  end if;

  return p_amount_cents;
end;
$$;

revoke all on function private.consume_credit_lots_for_root(
  uuid, uuid, uuid, bigint
) from public;
revoke all on function private.consume_credit_lots_for_root(
  uuid, uuid, uuid, bigint
) from anon;
revoke all on function private.consume_credit_lots_for_root(
  uuid, uuid, uuid, bigint
) from authenticated;

-- ------------------------------------------------------------
-- Trigger lotti aggiornato per riconoscere le correzioni.
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
  v_operation text;
  v_root_transaction_id uuid;
begin
  v_delta :=
    new.balance_after_cents -
    new.balance_before_cents;

  v_operation := coalesce(
    new.metadata ->> 'operation',
    ''
  );

  if v_operation = 'manual_recharge_correction' then
    v_root_transaction_id :=
      (new.metadata ->> 'correction_root_transaction_id')::uuid;

    if v_delta > 0 then
      perform private.add_credit_lot_for_root(
        new.wallet_id,
        new.id,
        v_root_transaction_id,
        new.payment_method,
        v_delta,
        new.created_at,
        coalesce(new.note, 'Correzione ricarica')
      );

    elsif v_delta < 0 then
      perform private.consume_credit_lots_for_root(
        new.wallet_id,
        new.id,
        v_root_transaction_id,
        abs(v_delta)
      );
    end if;

    return new;
  end if;

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

-- ------------------------------------------------------------
-- Elenco delle ricariche manuali correggibili di un cliente.
-- Non include Stripe, omaggi, rimborsi o pagamenti.
-- ------------------------------------------------------------
create or replace function public.admin_list_manual_recharges(
  p_user_id uuid,
  p_limit integer default 50
)
returns table (
  transaction_id uuid,
  created_at timestamptz,
  payment_method text,
  original_amount_cents bigint,
  current_recorded_amount_cents bigint,
  reducible_credit_cents bigint,
  correction_count bigint,
  operator_label text,
  position_code text,
  position_name text,
  note text
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

  v_limit := least(
    greatest(coalesce(p_limit, 50), 1),
    200
  );

  return query
  select
    t.id,
    t.created_at,
    t.payment_method,
    t.amount_cents,
    (
      t.amount_cents +
      coalesce(c.correction_delta_cents, 0)
    )::bigint,
    coalesce(l.remaining_cents, 0)::bigint,
    coalesce(c.correction_count, 0)::bigint,
    case
      when op.id is null then 'Operatore non disponibile'
      else op.first_name || ' ' || op.last_name
    end,
    cs.code,
    cs.name,
    t.note
  from public.transactions t
  join public.wallets w
    on w.id = t.wallet_id
  left join public.profiles op
    on op.id = t.operator_id
  left join public.cashier_stations cs
    on cs.id = t.cashier_station_id
  left join lateral (
    select
      coalesce(sum(
        rt.balance_after_cents -
        rt.balance_before_cents
      ), 0)::bigint as correction_delta_cents,
      count(*)::bigint as correction_count
    from public.transactions rt
    where rt.type = 'rettifica'::public.transaction_type
      and coalesce(
        rt.metadata ->> 'operation',
        ''
      ) = 'manual_recharge_correction'
      and rt.metadata ->> 'correction_root_transaction_id'
        = t.id::text
  ) c on true
  left join lateral (
    select
      coalesce(sum(cl.remaining_cents), 0)::bigint
        as remaining_cents
    from public.wallet_credit_lots cl
    where cl.wallet_id = t.wallet_id
      and cl.root_transaction_id = t.id
      and cl.remaining_cents > 0
  ) l on true
  where w.user_id = p_user_id
    and t.type = 'ricarica'::public.transaction_type
    and t.payment_method in ('contanti', 'pos')
    and coalesce(
      t.metadata ->> 'source',
      ''
    ) = 'cassa_web'
  order by t.created_at desc, t.id desc
  limit v_limit;
end;
$$;

revoke all on function public.admin_list_manual_recharges(
  uuid, integer
) from public;
revoke all on function public.admin_list_manual_recharges(
  uuid, integer
) from anon;
grant execute on function public.admin_list_manual_recharges(
  uuid, integer
) to authenticated;

-- ------------------------------------------------------------
-- Correzione amministrativa.
--
-- Esempio:
-- ricarica registrata 50 €, doveva essere 20 €.
-- p_corrected_total_cents = 2000
-- delta = -3000
--
-- La ricarica originale resta invariata.
-- Viene aggiunto un nuovo movimento RETTIFICA di -30 €.
-- ------------------------------------------------------------
create or replace function public.admin_correct_manual_recharge(
  p_original_transaction_id uuid,
  p_corrected_total_cents bigint,
  p_idempotency_key uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid;
  v_original public.transactions%rowtype;
  v_wallet public.wallets%rowtype;
  v_existing public.transactions%rowtype;
  v_correction public.transactions%rowtype;
  v_previous_correction_delta bigint;
  v_current_recorded_amount bigint;
  v_delta bigint;
  v_before bigint;
  v_after bigint;
  v_reducible_credit bigint;
begin
  v_admin_id := private.require_admin();

  if p_original_transaction_id is null
     or p_idempotency_key is null then
    raise exception 'Dati correzione mancanti.'
      using errcode = '22023';
  end if;

  if p_corrected_total_cents is null
     or p_corrected_total_cents < 0
     or p_corrected_total_cents > 50000
     or mod(p_corrected_total_cents, 200) <> 0 then
    raise exception
      'L’importo corretto deve essere un multiplo di 2 €, da 0 € a 500 €.'
      using errcode = '22023';
  end if;

  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'La motivazione della correzione è obbligatoria.'
      using errcode = '22023';
  end if;

  if char_length(trim(p_reason)) > 160 then
    raise exception 'La motivazione non può superare 160 caratteri.'
      using errcode = '22023';
  end if;

  select t.*
  into v_existing
  from public.transactions t
  where t.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.operator_id <> v_admin_id
       or v_existing.type <> 'rettifica'::public.transaction_type
       or coalesce(
         v_existing.metadata ->> 'operation',
         ''
       ) <> 'manual_recharge_correction' then
      raise exception 'Codice operazione già utilizzato.'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'transaction_id', v_existing.id,
      'amount_cents', v_existing.amount_cents,
      'signed_delta_cents',
        v_existing.balance_after_cents -
        v_existing.balance_before_cents,
      'balance_before_cents',
        v_existing.balance_before_cents,
      'balance_after_cents',
        v_existing.balance_after_cents,
      'duplicate_prevented', true
    );
  end if;

  select t.*
  into v_original
  from public.transactions t
  where t.id = p_original_transaction_id
  for update;

  if not found then
    raise exception 'Ricarica originale non trovata.'
      using errcode = 'P0002';
  end if;

  if v_original.type <> 'ricarica'::public.transaction_type
     or v_original.payment_method not in ('contanti', 'pos')
     or coalesce(
       v_original.metadata ->> 'source',
       ''
     ) <> 'cassa_web' then
    raise exception
      'È possibile correggere soltanto ricariche manuali contanti o POS.'
      using errcode = '42501';
  end if;

  select w.*
  into v_wallet
  from public.wallets w
  where w.id = v_original.wallet_id
  for update;

  if not found then
    raise exception 'Portafoglio non trovato.'
      using errcode = 'P0002';
  end if;

  if v_wallet.blocked then
    raise exception 'Portafoglio bloccato.'
      using errcode = '42501';
  end if;

  select coalesce(sum(
    t.balance_after_cents -
    t.balance_before_cents
  ), 0)
  into v_previous_correction_delta
  from public.transactions t
  where t.type = 'rettifica'::public.transaction_type
    and coalesce(
      t.metadata ->> 'operation',
      ''
    ) = 'manual_recharge_correction'
    and t.metadata ->> 'correction_root_transaction_id'
      = v_original.id::text;

  v_current_recorded_amount :=
    v_original.amount_cents +
    v_previous_correction_delta;

  v_delta :=
    p_corrected_total_cents -
    v_current_recorded_amount;

  if v_delta = 0 then
    raise exception
      'L’importo inserito coincide già con quello registrato.'
      using errcode = '22023';
  end if;

  if v_delta < 0 then
    select coalesce(sum(l.remaining_cents), 0)
    into v_reducible_credit
    from public.wallet_credit_lots l
    where l.wallet_id = v_wallet.id
      and l.root_transaction_id = v_original.id
      and l.remaining_cents > 0;

    if abs(v_delta) > v_reducible_credit then
      raise exception
        'Una parte del credito è già stata utilizzata. Da questa ricarica puoi sottrarre al massimo % €.',
        to_char(
          v_reducible_credit / 100.0,
          'FM999999990.00'
        )
        using errcode = 'P0001';
    end if;

    if abs(v_delta) > v_wallet.balance_cents then
      raise exception 'Saldo portafoglio insufficiente.'
        using errcode = 'P0001';
    end if;
  end if;

  v_before := v_wallet.balance_cents;
  v_after := v_before + v_delta;

  if v_after < 0 then
    raise exception 'La correzione produrrebbe un saldo negativo.'
      using errcode = 'P0001';
  end if;

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
    'rettifica'::public.transaction_type,
    abs(v_delta),
    v_admin_id,
    v_original.cashier_station_id,
    v_before,
    v_after,
    p_idempotency_key,
    v_original.payment_method,
    trim(p_reason),
    jsonb_build_object(
      'operation', 'manual_recharge_correction',
      'correction_root_transaction_id', v_original.id,
      'original_recharge_amount_cents',
        v_original.amount_cents,
      'previous_recorded_amount_cents',
        v_current_recorded_amount,
      'corrected_total_cents',
        p_corrected_total_cents,
      'signed_delta_cents', v_delta,
      'original_operator_id', v_original.operator_id,
      'original_cashier_station_id',
        v_original.cashier_station_id
    )
  )
  returning *
  into v_correction;

  return jsonb_build_object(
    'transaction_id', v_correction.id,
    'original_transaction_id', v_original.id,
    'payment_method', v_original.payment_method,
    'previous_recorded_amount_cents',
      v_current_recorded_amount,
    'corrected_total_cents',
      p_corrected_total_cents,
    'signed_delta_cents', v_delta,
    'amount_cents', abs(v_delta),
    'balance_before_cents', v_before,
    'balance_after_cents', v_after,
    'duplicate_prevented', false
  );
end;
$$;

revoke all on function public.admin_correct_manual_recharge(
  uuid, bigint, uuid, text
) from public;
revoke all on function public.admin_correct_manual_recharge(
  uuid, bigint, uuid, text
) from anon;
grant execute on function public.admin_correct_manual_recharge(
  uuid, bigint, uuid, text
) to authenticated;

-- ------------------------------------------------------------
-- Registro movimenti esteso con nota e metadati.
-- ------------------------------------------------------------
drop function if exists public.admin_recent_transactions(
  timestamptz,
  timestamptz,
  integer
);

create function public.admin_recent_transactions(
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
  balance_after_cents bigint,
  note text,
  metadata jsonb
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

  v_limit := least(
    greatest(coalesce(p_limit, 100), 1),
    10000
  );

  return query
  select
    t.id,
    t.created_at,
    t.type,
    t.amount_cents,
    cp.first_name || ' ' || cp.last_name,
    case
      when op.id is null then null
      else op.first_name || ' ' || op.last_name
    end,
    coalesce(cs.code, s.code),
    coalesce(cs.name, s.name),
    t.payment_method,
    t.balance_before_cents,
    t.balance_after_cents,
    t.note,
    t.metadata
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
  order by t.created_at desc, t.id desc
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
-- Dashboard: gli incassi e le classifiche vengono mostrati
-- al netto delle correzioni.
-- ------------------------------------------------------------
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
        select sum(
          case
            when t.type = 'ricarica'::public.transaction_type
              then t.amount_cents
            when t.type = 'rettifica'::public.transaction_type
              and coalesce(
                t.metadata ->> 'operation',
                ''
              ) = 'manual_recharge_correction'
              then t.balance_after_cents -
                   t.balance_before_cents
            else 0
          end
        )
        from public.transactions t
        where t.created_at between p_from and p_to
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
        select sum(
          case
            when t.type = 'ricarica'::public.transaction_type
              then t.amount_cents
            when t.type = 'rettifica'::public.transaction_type
              and coalesce(
                t.metadata ->> 'operation',
                ''
              ) = 'manual_recharge_correction'
              then t.balance_after_cents -
                   t.balance_before_cents
            else 0
          end
        )
        from public.transactions t
      ), 0),
    'spent_all_time_cents',
      coalesce((
        select sum(t.amount_cents)
        from public.transactions t
        where t.type = 'pagamento'::public.transaction_type
      ), 0),
    'cash_cents',
      coalesce((
        select sum(
          case
            when t.type = 'ricarica'::public.transaction_type
              then t.amount_cents
            when t.type = 'rettifica'::public.transaction_type
              and coalesce(
                t.metadata ->> 'operation',
                ''
              ) = 'manual_recharge_correction'
              then t.balance_after_cents -
                   t.balance_before_cents
            else 0
          end
        )
        from public.transactions t
        where t.payment_method = 'contanti'
          and t.created_at between p_from and p_to
      ), 0),
    'pos_cents',
      coalesce((
        select sum(
          case
            when t.type = 'ricarica'::public.transaction_type
              then t.amount_cents
            when t.type = 'rettifica'::public.transaction_type
              and coalesce(
                t.metadata ->> 'operation',
                ''
              ) = 'manual_recharge_correction'
              then t.balance_after_cents -
                   t.balance_before_cents
            else 0
          end
        )
        from public.transactions t
        where t.payment_method = 'pos'
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
  left join public.wallets w
    on w.user_id = p.id;

  select coalesce(
    jsonb_agg(
      to_jsonb(r)
      order by r.total_cents desc, r.code
    ),
    '[]'::jsonb
  )
  into v_cashiers
  from (
    select
      cs.code,
      cs.name,
      cs.responsible_name,
      count(t.id) filter (
        where t.type = 'ricarica'::public.transaction_type
      )::bigint as operations_count,
      coalesce(sum(
        case
          when t.type = 'ricarica'::public.transaction_type
            then t.amount_cents
          when t.type = 'rettifica'::public.transaction_type
            and coalesce(
              t.metadata ->> 'operation',
              ''
            ) = 'manual_recharge_correction'
            then t.balance_after_cents -
                 t.balance_before_cents
          else 0
        end
      ), 0)::bigint as total_cents,
      coalesce(sum(
        case
          when t.payment_method = 'contanti'
            and t.type = 'ricarica'::public.transaction_type
            then t.amount_cents
          when t.payment_method = 'contanti'
            and t.type = 'rettifica'::public.transaction_type
            and coalesce(
              t.metadata ->> 'operation',
              ''
            ) = 'manual_recharge_correction'
            then t.balance_after_cents -
                 t.balance_before_cents
          else 0
        end
      ), 0)::bigint as cash_cents,
      coalesce(sum(
        case
          when t.payment_method = 'pos'
            and t.type = 'ricarica'::public.transaction_type
            then t.amount_cents
          when t.payment_method = 'pos'
            and t.type = 'rettifica'::public.transaction_type
            and coalesce(
              t.metadata ->> 'operation',
              ''
            ) = 'manual_recharge_correction'
            then t.balance_after_cents -
                 t.balance_before_cents
          else 0
        end
      ), 0)::bigint as pos_cents,
      case
        when count(t.id) filter (
          where t.type = 'ricarica'::public.transaction_type
        ) = 0 then 0
        else round(
          sum(
            case
              when t.type = 'ricarica'::public.transaction_type
                then t.amount_cents
              when t.type = 'rettifica'::public.transaction_type
                and coalesce(
                  t.metadata ->> 'operation',
                  ''
                ) = 'manual_recharge_correction'
                then t.balance_after_cents -
                     t.balance_before_cents
              else 0
            end
          )::numeric /
          count(t.id) filter (
            where t.type = 'ricarica'::public.transaction_type
          )
        )::bigint
      end as average_cents
    from public.cashier_stations cs
    left join public.transactions t
      on t.cashier_station_id = cs.id
      and (
        t.type = 'ricarica'::public.transaction_type
        or (
          t.type = 'rettifica'::public.transaction_type
          and coalesce(
            t.metadata ->> 'operation',
            ''
          ) = 'manual_recharge_correction'
        )
      )
      and t.created_at between p_from and p_to
    where cs.active = true
    group by
      cs.id,
      cs.code,
      cs.name,
      cs.responsible_name
  ) r;

  select coalesce(
    jsonb_agg(
      to_jsonb(r)
      order by r.total_cents desc, r.code
    ),
    '[]'::jsonb
  )
  into v_stands
  from (
    select
      s.code,
      s.name,
      s.responsible_name,
      count(t.id)::bigint as operations_count,
      count(distinct t.wallet_id)::bigint
        as unique_customers,
      coalesce(sum(t.amount_cents), 0)::bigint
        as total_cents,
      coalesce(round(avg(t.amount_cents)), 0)::bigint
        as average_cents
    from public.stands s
    left join public.transactions t
      on t.stand_id = s.id
      and t.type = 'pagamento'::public.transaction_type
      and t.created_at between p_from and p_to
    where s.active = true
    group by
      s.id,
      s.code,
      s.name,
      s.responsible_name
  ) r;

  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.hour),
    '[]'::jsonb
  )
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
      on extract(
        hour from t.created_at at time zone 'Europe/Rome'
      )::integer = h.hour
      and t.created_at between p_from and p_to
    group by h.hour
  ) r;

  select jsonb_build_object(
    'cashier_positions_configured',
      (
        select count(*)
        from public.cashier_stations
        where active = true
      ),
    'stand_positions_configured',
      (
        select count(*)
        from public.stands
        where active = true
      ),
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
    'period',
      jsonb_build_object(
        'from', p_from,
        'to', p_to
      ),
    'totals', v_totals,
    'cashiers', v_cashiers,
    'stands', v_stands,
    'hourly', v_hourly,
    'staff', v_staff
  );
end;
$$;

revoke all on function public.admin_get_dashboard(
  timestamptz,
  timestamptz
) from public;
revoke all on function public.admin_get_dashboard(
  timestamptz,
  timestamptz
) from anon;
grant execute on function public.admin_get_dashboard(
  timestamptz,
  timestamptz
) to authenticated;

-- ------------------------------------------------------------
-- Riepilogo controlli esteso con correzioni.
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
      ), 0)::bigint,
    'manual_correction_count',
      count(*) filter (
        where t.type = 'rettifica'::public.transaction_type
          and coalesce(
            t.metadata ->> 'operation',
            ''
          ) = 'manual_recharge_correction'
          and t.created_at between p_from and p_to
      )::bigint,
    'manual_correction_net_cents',
      coalesce(sum(
        t.balance_after_cents -
        t.balance_before_cents
      ) filter (
        where t.type = 'rettifica'::public.transaction_type
          and coalesce(
            t.metadata ->> 'operation',
            ''
          ) = 'manual_recharge_correction'
          and t.created_at between p_from and p_to
      ), 0)::bigint,
    'manual_correction_decrease_cents',
      coalesce(sum(
        t.balance_before_cents -
        t.balance_after_cents
      ) filter (
        where t.type = 'rettifica'::public.transaction_type
          and coalesce(
            t.metadata ->> 'operation',
            ''
          ) = 'manual_recharge_correction'
          and t.balance_after_cents < t.balance_before_cents
          and t.created_at between p_from and p_to
      ), 0)::bigint,
    'manual_correction_increase_cents',
      coalesce(sum(
        t.balance_after_cents -
        t.balance_before_cents
      ) filter (
        where t.type = 'rettifica'::public.transaction_type
          and coalesce(
            t.metadata ->> 'operation',
            ''
          ) = 'manual_recharge_correction'
          and t.balance_after_cents > t.balance_before_cents
          and t.created_at between p_from and p_to
      ), 0)::bigint
  )
  into v_result
  from public.transactions t;

  return v_result;
end;
$$;

revoke all on function public.admin_control_summary(
  timestamptz,
  timestamptz
) from public;
revoke all on function public.admin_control_summary(
  timestamptz,
  timestamptz
) from anon;
grant execute on function public.admin_control_summary(
  timestamptz,
  timestamptz
) to authenticated;

commit;

-- ------------------------------------------------------------
-- Verifica finale
-- ------------------------------------------------------------
select
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wallet_credit_lots'
      and column_name = 'root_transaction_id'
  ) as root_transaction_column,
  (
    select count(*)
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_list_manual_recharges',
        'admin_correct_manual_recharge'
      )
  ) as correction_functions,
  (
    select coalesce(sum(w.balance_cents), 0)
    from public.wallets w
  ) as wallet_balances_cents,
  (
    select coalesce(sum(l.remaining_cents), 0)
    from public.wallet_credit_lots l
  ) as credit_lots_remaining_cents;
