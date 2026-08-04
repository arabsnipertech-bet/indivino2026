-- ============================================================
-- ESEGUIRE SOLO SE avevi già creato utenti Auth PRIMA di lanciare
-- 01_database_step2.sql e tali utenti non hanno profilo/portafoglio.
-- Su un progetto appena creato normalmente NON serve.
-- ============================================================

insert into public.profiles (
  id,
  first_name,
  last_name,
  email,
  role,
  active
)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), 'Utente'),
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'cognome'), ''), 'Indivino'),
  coalesce(u.email, ''),
  'cliente'::public.app_role,
  true
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

insert into public.wallets (user_id)
select p.id
from public.profiles p
left join public.wallets w on w.user_id = p.id
where w.id is null
on conflict (user_id) do nothing;
