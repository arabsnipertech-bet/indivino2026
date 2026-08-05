# INDIVINO 2026 — STEP 6

## Contenuto

- ritorno da Cassa 01 ad Amministrazione;
- modifica nome e responsabile di 20 casse e 15 stand;
- ricerca clienti;
- visualizzazione e stampa QR;
- codice badge univoco;
- creazione cliente con email già confermata;
- creazione badge senza email;
- reset password cliente;
- blocco/sblocco portafoglio;
- generazione operatori uno alla volta;
- messaggi dettagliati degli errori Edge Function.

## 1. Eseguire SQL

Supabase → SQL Editor → New query.

Eseguire:

`sql/09_positions_customers_badges.sql`

Risultato atteso:

- cashiers = 20
- stands = 15
- customers_with_badge_code almeno pari ai clienti già presenti.

## 2. Sostituire Edge Function

Supabase → Edge Functions → admin-staff → Code.

Sostituire tutto il codice con:

`supabase/functions/admin-staff/index.ts`

Pubblicare nuovamente la funzione.

In Settings lasciare:

`Verify JWT with legacy secret = OFF`

La funzione verifica autonomamente il token e il ruolo amministratore.

## 3. Pubblicare sito

Caricare il contenuto dello ZIP nel repository GitHub e attendere il deployment Cloudflare.

Commit suggerito:

`Gestione postazioni clienti e badge`

## 4. Funzioni nuove

### Cassa 01

L'account amministratore che apre `/cassa` vede il pulsante:

`Amministrazione`

### Postazioni

Nel pannello amministratore:

`Casse e stand`

Ogni codice resta fisso, ma si possono modificare:

- nome visualizzato;
- responsabile.

### Clienti

Ricerca per:

- nome;
- cognome;
- email;
- codice badge;
- UUID del QR.

Le password non sono leggibili. Il pulsante `Nuova password` ne genera una sostitutiva.

### Creazione cliente / badge

Con email:
- account già confermato;
- password temporanea mostrata una volta;
- QR stampabile.

Senza email:
- portafoglio badge;
- email tecnica interna;
- QR stampabile;
- nessuna conferma email.

### Unicità

- `wallets.qr_token` è UNIQUE;
- `profiles.badge_code` è UNIQUE;
- `profiles.contact_email` è UNIQUE quando presente.

Due persone con lo stesso nome e cognome possono essere create senza sovrapposizione:
il QR non deriva dal nome.

La stessa email viene invece rifiutata e bisogna recuperare il cliente esistente.
