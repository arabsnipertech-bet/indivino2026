# INDIVINO 2026 — PASSAGGIO 2

Questa versione attiva:

- registrazione reale con Supabase Auth;
- login reale;
- creazione automatica di profilo e portafoglio;
- saldo iniziale pari a zero;
- QR personale reale;
- storico movimenti collegato al database;
- protezione RLS: ogni cliente vede soltanto i propri dati;
- predisposizione dei cinque stand.

## Ordine corretto

### 1. Eseguire il database SQL

1. Aprire Supabase.
2. Cliccare `SQL Editor` nel menu sinistro.
3. Cliccare `New query`.
4. Aprire `sql/01_database_step2.sql`.
5. Copiare tutto il contenuto.
6. Incollarlo nel SQL Editor.
7. Premere `Run`.
8. In basso devono comparire cinque stand.

Non eseguire `02_repair_existing_users_optional.sql` su un progetto nuovo.

### 2. Configurare gli indirizzi Auth

In Supabase:

`Authentication → URL Configuration`

Impostare:

- Site URL:
  `https://indivino2026.arabsnipertech.workers.dev`

- Redirect URLs:
  `https://indivino2026.arabsnipertech.workers.dev/cliente`

Salvare.

### 3. Collaudo senza email di conferma

Il servizio email predefinito Supabase è fortemente limitato. Per il primo collaudo:

`Authentication → Sign In / Providers → Email`

Disattivare temporaneamente:

`Confirm email`

Lasciare attivo:

`Allow new users to sign up`

Salvare.

Prima della messa in produzione decideremo se:
- configurare un SMTP;
- riattivare la conferma email;
- oppure far creare i portafogli direttamente alla cassa.

### 4. Pubblicare il codice

1. Estrarre lo ZIP.
2. Aprire GitHub → repository `indivino2026`.
3. `Add file → Upload files`.
4. Caricare il contenuto della cartella estratta.
5. Commit:
   `Attivazione Supabase Auth e portafoglio cliente`
6. Attendere il deployment Cloudflare verde.

### 5. Eliminare la vecchia cache

Dopo il deployment:

- aprire il sito;
- premere `Ctrl + F5`;
- se necessario eliminare i dati del sito dal browser.

### 6. Test

1. Aprire `/registrazione`.
2. Registrare una nuova email e una password di almeno 8 caratteri.
3. Al termine deve aprirsi `/cliente`.
4. Il saldo deve essere `0,00 €`.
5. Deve apparire un QR personale.
6. Uscire e accedere nuovamente da `/login`.

## Sicurezza

Nel browser è presente soltanto la Publishable key.
Non sono presenti:
- database password;
- secret key;
- service_role key.

Il cliente dispone soltanto di permessi SELECT sulle proprie righe.
Nessun utente può modificare il saldo dal browser.
