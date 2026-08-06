# I Divini Digitali — Step 8

Controlli economici finali prima del go-live:

- credito separato per origine;
- rimborso soltanto contanti;
- ticket gratuito amministrativo;
- eliminazione o anonimizzazione clienti;
- quadratura corretta;
- Stripe ancora in modalità test.

Eseguire prima:

`sql/12_database_controls.sql`

Poi ripubblicare:

`supabase/functions/admin-staff/index.ts`
