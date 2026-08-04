-- ============================================================
-- INDIVINO 2026 — PROMUOVI UN ACCOUNT A OPERATORE DI CASSA
--
-- 1. Crea prima un SECONDO account dall'app o da Authentication > Users.
-- 2. Sostituisci qui sotto email-cassa@example.com con l'email reale.
-- 3. Esegui questo script una sola volta.
--
-- Non usare l'account cliente principale, altrimenti verrà reindirizzato
-- alla cassa invece che al portafoglio personale.
-- ============================================================

update public.profiles
set role = 'cassa'::public.app_role,
    active = true,
    updated_at = now()
where lower(email) = lower('email-cassa@example.com');

select
  id,
  first_name,
  last_name,
  email,
  role,
  active
from public.profiles
where lower(email) = lower('email-cassa@example.com');
