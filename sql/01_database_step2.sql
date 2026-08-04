-- ============================================================
-- INDIVINO 2026 — DATABASE STEP 2
-- Registrazione, profili, portafogli e lettura movimenti
-- Eseguire UNA SOLA VOLTA nel Supabase SQL Editor.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Tipi
-- ------------------------------------------------------------
do $$
begin
  create type public.app_role as enum ('cliente', 'cassa', 'stand', 'admin');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.transaction_type as enum (
    'ricarica',
    'pagamento',
    'storno',
    'rettifica'
  );
exception
  when duplicate_object then null;
end
$$;

-- ------------------------------------------------------------
-- Tabelle
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (char_length(trim(first_name)) between 1 and 80),
  last_name text not null check (char_length(trim(last_name)) between 1 and 80),
  email text not null,
  role public.app_role not null default 'cliente',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  qr_token uuid not null unique default gen_random_uuid(),
  blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallets_user_id_idx
  on public.wallets (user_id);

create index if not exists wallets_qr_token_idx
  on public.wallets (qr_token);

create table if not exists public.stands (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.stand_operators (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stand_id uuid not null references public.stands(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists stand_operators_stand_id_idx
  on public.stand_operators (stand_id);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  type public.transaction_type not null,
  amount_cents bigint not null check (amount_cents > 0),
  stand_id uuid references public.stands(id) on delete restrict,
  operator_id uuid references public.profiles(id) on delete restrict,
  balance_before_cents bigint not null check (balance_before_cents >= 0),
  balance_after_cents bigint not null check (balance_after_cents >= 0),
  idempotency_key uuid not null unique default gen_random_uuid(),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists transactions_wallet_created_idx
  on public.transactions (wallet_id, created_at desc);

create index if not exists transactions_stand_created_idx
  on public.transactions (stand_id, created_at desc);

create index if not exists transactions_operator_created_idx
  on public.transactions (operator_id, created_at desc);

-- I nomi potranno essere modificati dall'amministratore in seguito.
insert into public.stands (code, name)
values
  ('STAND01', 'Stand vino 1'),
  ('STAND02', 'Stand vino 2'),
  ('STAND03', 'Stand vino 3'),
  ('STAND04', 'Stand vino 4'),
  ('STAND05', 'Stand vino 5')
on conflict (code) do update
set name = excluded.name;

-- ------------------------------------------------------------
-- Timestamp automatico
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at
before update on public.wallets
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Creazione automatica profilo + portafoglio dopo Auth signup
-- SECURITY DEFINER è necessario perché il trigger deve inserire
-- anche se l'utente non ha ancora una sessione autenticata.
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
begin
  v_first_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
    'Utente'
  );

  v_last_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'cognome'), ''),
    'Indivino'
  );

  insert into public.profiles (
    id,
    first_name,
    last_name,
    email,
    role,
    active
  )
  values (
    new.id,
    v_first_name,
    v_last_name,
    coalesce(new.email, ''),
    'cliente',
    true
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.stands enable row level security;
alter table public.stand_operators enable row level security;
alter table public.transactions enable row level security;

-- Nessun accesso anonimo alle tabelle.
revoke all on table public.profiles from anon;
revoke all on table public.wallets from anon;
revoke all on table public.stands from anon;
revoke all on table public.stand_operators from anon;
revoke all on table public.transactions from anon;

-- Permessi minimi per gli utenti autenticati.
revoke all on table public.profiles from authenticated;
revoke all on table public.wallets from authenticated;
revoke all on table public.stands from authenticated;
revoke all on table public.stand_operators from authenticated;
revoke all on table public.transactions from authenticated;

grant select on table public.profiles to authenticated;
grant select on table public.wallets to authenticated;
grant select on table public.stands to authenticated;
grant select on table public.stand_operators to authenticated;
grant select on table public.transactions to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = id
);

drop policy if exists "wallets_select_own" on public.wallets;
create policy "wallets_select_own"
on public.wallets
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

drop policy if exists "stands_select_active" on public.stands;
create policy "stands_select_active"
on public.stands
for select
to authenticated
using (active = true);

drop policy if exists "stand_operators_select_own" on public.stand_operators;
create policy "stand_operators_select_own"
on public.stand_operators
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (select auth.uid()) = user_id
);

drop policy if exists "transactions_select_own_wallet" on public.transactions;
create policy "transactions_select_own_wallet"
on public.transactions
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.wallets w
    where w.id = transactions.wallet_id
      and w.user_id = (select auth.uid())
  )
);

commit;

-- Verifica finale: devono comparire 5 righe.
select code, name, active
from public.stands
order by code;
