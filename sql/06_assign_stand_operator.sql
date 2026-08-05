-- ============================================================
-- INDIVINO 2026 — ASSOCIA UN ACCOUNT A UNO STAND
--
-- 1. Crea prima un NUOVO account e conferma l'email.
-- 2. Modifica SOLO le due variabili qui sotto.
-- 3. Esegui lo script nel Supabase SQL Editor.
--
-- Codici disponibili:
-- STAND01, STAND02, STAND03, STAND04, STAND05
-- ============================================================

do $$
declare
  v_email text := 'stand01@example.com';
  v_stand_code text := 'STAND01';
  v_user_id uuid;
  v_stand_id uuid;
begin
  select p.id
  into v_user_id
  from public.profiles p
  where lower(p.email) = lower(v_email)
  limit 1;

  if v_user_id is null then
    raise exception 'Account non trovato per email: %', v_email;
  end if;

  select s.id
  into v_stand_id
  from public.stands s
  where upper(s.code) = upper(v_stand_code)
    and s.active = true
  limit 1;

  if v_stand_id is null then
    raise exception 'Stand non trovato o non attivo: %', v_stand_code;
  end if;

  update public.profiles
  set role = 'stand'::public.app_role,
      active = true,
      updated_at = now()
  where id = v_user_id;

  insert into public.stand_operators (
    user_id,
    stand_id,
    active
  )
  values (
    v_user_id,
    v_stand_id,
    true
  )
  on conflict (user_id) do update
  set stand_id = excluded.stand_id,
      active = true;
end
$$;

select
  p.first_name,
  p.last_name,
  p.email,
  p.role,
  s.code as stand_code,
  s.name as stand_name,
  so.active
from public.profiles p
join public.stand_operators so
  on so.user_id = p.id
join public.stands s
  on s.id = so.stand_id
where lower(p.email) = lower('stand01@example.com');
