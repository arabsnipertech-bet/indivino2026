-- ============================================================
-- INDIVINO 2026 — STEP 6
-- POSTAZIONI MODIFICABILI, CLIENTI E BADGE
--
-- Prerequisito: 08_database_admin.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Nomi responsabili
-- ------------------------------------------------------------
alter table public.cashier_stations
  add column if not exists responsible_name text;

alter table public.stands
  add column if not exists responsible_name text;

-- ------------------------------------------------------------
-- Informazioni cliente / badge
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists contact_email text;

alter table public.profiles
  add column if not exists customer_source text not null default 'registrazione';

alter table public.profiles
  add column if not exists badge_code text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_customer_source_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_customer_source_check
      check (customer_source in ('registrazione', 'badge', 'staff'));
  end if;
end
$$;

update public.profiles
set contact_email = email
where role = 'cliente'::public.app_role
  and contact_email is null
  and email not like '%@badge.indivino2026.local';

update public.profiles
set customer_source = 'staff'
where role in (
  'cassa'::public.app_role,
  'stand'::public.app_role,
  'admin'::public.app_role
);

-- Codice badge indipendente da nome, cognome ed email.
update public.profiles
set badge_code =
  'IV26-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
where role = 'cliente'::public.app_role
  and badge_code is null;

create unique index if not exists profiles_badge_code_unique_idx
  on public.profiles (badge_code)
  where badge_code is not null;

create unique index if not exists profiles_contact_email_lower_unique_idx
  on public.profiles (lower(contact_email))
  where contact_email is not null
    and trim(contact_email) <> '';

-- La colonna qr_token è già UNIQUE nel database iniziale.
-- L'indice viene ribadito per rendere esplicita la protezione.
create unique index if not exists wallets_qr_token_unique_idx
  on public.wallets (qr_token);

-- ------------------------------------------------------------
-- Trigger aggiornato per nuovi account
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_name text;
  v_last_name text;
  v_account_type text;
  v_source text;
  v_contact_email text;
  v_badge_code text;
begin
  v_first_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
    'Utente'
  );

  v_last_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'cognome'), ''),
    'Indivino'
  );

  v_account_type := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'account_type'), ''),
    'cliente'
  );

  v_source := case
    when v_account_type = 'staff' then 'staff'
    when coalesce(new.raw_user_meta_data ->> 'customer_source', '') = 'badge'
      then 'badge'
    else 'registrazione'
  end;

  v_contact_email := nullif(
    trim(coalesce(
      new.raw_user_meta_data ->> 'contact_email',
      case when v_account_type = 'staff' then null else new.email end,
      ''
    )),
    ''
  );

  v_badge_code := case
    when v_account_type = 'staff' then null
    else 'IV26-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  end;

  insert into public.profiles (
    id,
    first_name,
    last_name,
    email,
    role,
    active,
    contact_email,
    customer_source,
    badge_code
  )
  values (
    new.id,
    v_first_name,
    v_last_name,
    coalesce(new.email, ''),
    'cliente',
    true,
    v_contact_email,
    v_source,
    v_badge_code
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

-- ------------------------------------------------------------
-- Elenco postazioni
-- ------------------------------------------------------------
create or replace function public.admin_list_positions()
returns table (
  position_type text,
  code text,
  name text,
  responsible_name text,
  active boolean
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
    'cassa'::text,
    cs.code,
    cs.name,
    cs.responsible_name,
    cs.active
  from public.cashier_stations cs

  union all

  select
    'stand'::text,
    s.code,
    s.name,
    s.responsible_name,
    s.active
  from public.stands s

  order by 1, 2;
end;
$$;

revoke all on function public.admin_list_positions() from public;
revoke all on function public.admin_list_positions() from anon;
grant execute on function public.admin_list_positions() to authenticated;

create or replace function public.admin_update_position(
  p_position_type text,
  p_code text,
  p_name text,
  p_responsible_name text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Il nome della postazione è obbligatorio.'
      using errcode = '22023';
  end if;

  if char_length(trim(p_name)) > 100 then
    raise exception 'Il nome non può superare 100 caratteri.'
      using errcode = '22023';
  end if;

  if p_responsible_name is not null
     and char_length(trim(p_responsible_name)) > 120 then
    raise exception 'Il responsabile non può superare 120 caratteri.'
      using errcode = '22023';
  end if;

  if lower(p_position_type) = 'cassa' then
    update public.cashier_stations
    set name = trim(p_name),
        responsible_name = nullif(trim(p_responsible_name), '')
    where code = upper(trim(p_code));

  elsif lower(p_position_type) = 'stand' then
    update public.stands
    set name = trim(p_name),
        responsible_name = nullif(trim(p_responsible_name), '')
    where code = upper(trim(p_code));

  else
    raise exception 'Tipo postazione non valido.'
      using errcode = '22023';
  end if;

  if not found then
    raise exception 'Postazione non trovata.'
      using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.admin_update_position(text, text, text, text)
  from public;
revoke all on function public.admin_update_position(text, text, text, text)
  from anon;
grant execute on function public.admin_update_position(text, text, text, text)
  to authenticated;

-- ------------------------------------------------------------
-- Elenco e ricerca clienti
-- ------------------------------------------------------------
create or replace function public.admin_list_customers(
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
  blocked boolean,
  active boolean,
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
    w.blocked,
    p.active,
    p.created_at
  from public.profiles p
  join public.wallets w
    on w.user_id = p.id
  where p.role = 'cliente'::public.app_role
    and (
      v_query = ''
      or lower(p.first_name) like '%' || v_query || '%'
      or lower(p.last_name) like '%' || v_query || '%'
      or lower(p.first_name || ' ' || p.last_name) like '%' || v_query || '%'
      or lower(coalesce(p.contact_email, '')) like '%' || v_query || '%'
      or lower(p.email) like '%' || v_query || '%'
      or lower(coalesce(p.badge_code, '')) like '%' || v_query || '%'
      or lower(w.qr_token::text) like '%' || v_query || '%'
    )
  order by p.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.admin_list_customers(text, integer) from public;
revoke all on function public.admin_list_customers(text, integer) from anon;
grant execute on function public.admin_list_customers(text, integer)
  to authenticated;

create or replace function public.admin_set_wallet_blocked(
  p_user_id uuid,
  p_blocked boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();

  update public.wallets w
  set blocked = p_blocked,
      updated_at = now()
  from public.profiles p
  where w.user_id = p.id
    and p.id = p_user_id
    and p.role = 'cliente'::public.app_role;

  if not found then
    raise exception 'Cliente o portafoglio non trovato.'
      using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.admin_set_wallet_blocked(uuid, boolean)
  from public;
revoke all on function public.admin_set_wallet_blocked(uuid, boolean)
  from anon;
grant execute on function public.admin_set_wallet_blocked(uuid, boolean)
  to authenticated;

-- ------------------------------------------------------------
-- Dashboard aggiornata con responsabili
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
      cs.responsible_name,
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
    group by cs.id, cs.code, cs.name, cs.responsible_name
  ) r;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.total_cents desc, r.code), '[]'::jsonb)
  into v_stands
  from (
    select
      s.code,
      s.name,
      s.responsible_name,
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
    group by s.id, s.code, s.name, s.responsible_name
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

commit;

-- Verifica
select
  (select count(*) from public.cashier_stations) as cashiers,
  (select count(*) from public.stands) as stands,
  (select count(*) from public.profiles where role = 'cliente'::public.app_role and badge_code is not null) as customers_with_badge_code;
