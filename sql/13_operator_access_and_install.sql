-- ============================================================
-- INDIVINO 2026 — STEP 9
-- ACCESSI DIRETTI OPERATORI E RESPONSABILI DI POSTAZIONE
--
-- Prerequisito:
--   12_database_controls.sql
--
-- Aggiunge:
--   - codice accesso semplice per operatori;
--   - responsabile operativo principale per cassa/stand;
--   - dati del profilo associato nella lista postazioni;
--   - permessi server per creazione e assegnazione diretta.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- Codice di accesso semplice
-- Esempio: annalisa -> annalisa@operatori.indivino2026.it
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists access_code text;

update public.profiles
set access_code = lower(split_part(email, '@', 1))
where role in (
    'cassa'::public.app_role,
    'stand'::public.app_role
  )
  and access_code is null
  and lower(email) like '%@operatori.indivino2026.it';

create unique index if not exists profiles_access_code_lower_unique_idx
  on public.profiles (lower(access_code))
  where access_code is not null
    and trim(access_code) <> '';

-- ------------------------------------------------------------
-- Responsabile operativo principale della postazione
-- CASSA01 mantiene comunque anche l'accesso amministratore.
-- ------------------------------------------------------------
alter table public.cashier_stations
  add column if not exists primary_operator_id uuid
  references public.profiles(id) on delete set null;

alter table public.stands
  add column if not exists primary_operator_id uuid
  references public.profiles(id) on delete set null;

create index if not exists cashier_stations_primary_operator_idx
  on public.cashier_stations (primary_operator_id);

create index if not exists stands_primary_operator_idx
  on public.stands (primary_operator_id);

-- ------------------------------------------------------------
-- Lista postazioni estesa con account responsabile
-- ------------------------------------------------------------
drop function if exists public.admin_list_positions();

create function public.admin_list_positions()
returns table (
  position_type text,
  code text,
  name text,
  responsible_name text,
  active boolean,
  primary_operator_id uuid,
  operator_first_name text,
  operator_last_name text,
  operator_email text,
  operator_access_code text,
  operator_active boolean
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
    cs.active,
    p.id,
    p.first_name,
    p.last_name,
    p.email,
    p.access_code,
    p.active
  from public.cashier_stations cs
  left join public.profiles p
    on p.id = cs.primary_operator_id

  union all

  select
    'stand'::text,
    s.code,
    s.name,
    s.responsible_name,
    s.active,
    p.id,
    p.first_name,
    p.last_name,
    p.email,
    p.access_code,
    p.active
  from public.stands s
  left join public.profiles p
    on p.id = s.primary_operator_id

  order by 1, 2;
end;
$$;

revoke all on function public.admin_list_positions()
  from public;
revoke all on function public.admin_list_positions()
  from anon;
grant execute on function public.admin_list_positions()
  to authenticated;

-- ------------------------------------------------------------
-- Imposta il responsabile principale
-- Usata dalla Edge Function dopo aver creato l'account.
-- ------------------------------------------------------------
create or replace function public.admin_set_primary_position_operator(
  p_position_type text,
  p_code text,
  p_user_id uuid,
  p_responsible_name text
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
  where p.id = p_user_id
    and p.active = true;

  if not found then
    raise exception 'Profilo operatore non disponibile.'
      using errcode = 'P0002';
  end if;

  if lower(p_position_type) = 'cassa' then
    if v_role not in (
      'cassa'::public.app_role,
      'admin'::public.app_role
    ) then
      raise exception 'Il profilo non è abilitato come cassa.'
        using errcode = '42501';
    end if;

    update public.cashier_stations
    set primary_operator_id = p_user_id,
        responsible_name = nullif(trim(p_responsible_name), '')
    where code = upper(trim(p_code));

  elsif lower(p_position_type) = 'stand' then
    if v_role <> 'stand'::public.app_role then
      raise exception 'Il profilo non è abilitato come stand.'
        using errcode = '42501';
    end if;

    update public.stands
    set primary_operator_id = p_user_id,
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

revoke all on function public.admin_set_primary_position_operator(
  text, text, uuid, text
) from public;
revoke all on function public.admin_set_primary_position_operator(
  text, text, uuid, text
) from anon;
grant execute on function public.admin_set_primary_position_operator(
  text, text, uuid, text
) to authenticated;

-- ------------------------------------------------------------
-- Permessi Edge Function
-- ------------------------------------------------------------
grant usage on schema public to service_role;

grant select, update
on table public.profiles
to service_role;

grant select, update
on table public.cashier_stations
to service_role;

grant select, update
on table public.stands
to service_role;

grant select, insert, update, delete
on table public.cashier_operators
to service_role;

grant select, insert, update, delete
on table public.stand_operators
to service_role;

commit;

-- Verifica
select
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'access_code'
  ) as access_code_column,
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cashier_stations'
      and column_name = 'primary_operator_id'
  ) as cashier_primary_operator_column,
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stands'
      and column_name = 'primary_operator_id'
  ) as stand_primary_operator_column;
