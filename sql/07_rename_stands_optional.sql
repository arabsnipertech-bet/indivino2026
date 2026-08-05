-- ============================================================
-- FACOLTATIVO — RINOMINA I CINQUE STAND
-- Modifica i nomi a destra quando saranno note le cantine.
-- ============================================================

update public.stands
set name = case code
  when 'STAND01' then 'Stand vino 1'
  when 'STAND02' then 'Stand vino 2'
  when 'STAND03' then 'Stand vino 3'
  when 'STAND04' then 'Stand vino 4'
  when 'STAND05' then 'Stand vino 5'
  else name
end
where code in ('STAND01', 'STAND02', 'STAND03', 'STAND04', 'STAND05');

select code, name, active
from public.stands
order by code;
