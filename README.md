# I Divini Digitali — Step 9

Aggiunge:

- registrazione cliente immediata;
- accesso operatori con codice semplice;
- creazione responsabile direttamente dalla cassa o dallo stand;
- disattivazione automatica del precedente responsabile;
- QR e pagina guidata per installare la PWA.

Eseguire:

`sql/13_operator_access_and_install.sql`

Poi pubblicare:

`supabase/functions/admin-staff/index.ts`

Infine disattivare `Confirm email` nelle impostazioni Auth di Supabase.
