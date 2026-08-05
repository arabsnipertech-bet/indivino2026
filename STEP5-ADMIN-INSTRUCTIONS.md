# INDIVINO 2026 — STEP 5 AMMINISTRAZIONE

## Struttura prevista

- Amministratore principale: `arabsnipertech@gmail.com`
- Lo stesso account opera anche come `CASSA01`
- Postazioni cassa: `CASSA01`–`CASSA20`
- Postazioni stand: `STAND01`–`STAND15`
- Profili generati:
  - Cassa 02–20: 19 profili
  - Stand 01–15: 15 profili
  - Cassa 01: account amministratore già esistente

## Funzioni del pannello

- clienti attivi;
- credito caricato;
- credito consumato;
- credito residuo;
- contanti e POS;
- classifica delle 20 casse;
- classifica dei 15 stand;
- attività per ora;
- quadratura del credito;
- elenco operatori;
- disattivazione e riattivazione;
- reset password;
- generazione automatica degli operatori;
- download CSV credenziali;
- registro completo ed esportazione CSV.

## Ordine corretto

### 1. Database

In Supabase:

1. `SQL Editor`
2. `New query`
3. aprire `sql/08_database_admin.sql`
4. copiare tutto
5. incollare
6. premere `Run`

Risultato corretto:

- email: `arabsnipertech@gmail.com`
- role: `admin`
- cashier_code: `CASSA01`
- active: `true`

Nella seconda tabella:

- cashiers: `20`
- stands: `15`

Dopo questo passaggio, il prossimo accesso con l'account principale apre `/admin`.

### 2. Pubblicazione sito

1. estrarre lo ZIP;
2. aprire il repository GitHub `indivino2026`;
3. `Add file → Upload files`;
4. caricare tutto il contenuto della cartella estratta;
5. commit:
   `Attivazione amministrazione centrale`
6. attendere il deployment Cloudflare verde.

### 3. Pubblicare la Supabase Edge Function

La funzione server è necessaria esclusivamente per:

- creare account già confermati;
- generare password temporanee;
- reimpostare password.

File:

`supabase/functions/admin-staff/index.ts`

Dal pannello Supabase:

1. aprire `Edge Functions`;
2. creare una nuova funzione;
3. nome esatto: `admin-staff`;
4. aprire il file `index.ts`;
5. copiare tutto il contenuto;
6. incollarlo nell'editor;
7. pubblicare la funzione.

Non aggiungere nel browser o su GitHub la `service_role key`.
La funzione riceve automaticamente i segreti server del progetto.

### 4. Accesso amministratore

Accedere con:

`arabsnipertech@gmail.com`

Il sistema deve aprire:

`/admin`

In alto compare il pulsante:

`Apri Cassa 01`

che consente allo stesso account di effettuare ricariche come CASSA01.

### 5. Generazione operatori

Dal pannello amministratore premere:

`Genera profili mancanti`

Il sistema crea:

- `cassa02@operatori.indivino2026.it`
- ...
- `cassa20@operatori.indivino2026.it`
- `stand01@operatori.indivino2026.it`
- ...
- `stand15@operatori.indivino2026.it`

Gli account vengono creati con email già confermata.

Scaricare immediatamente:

`indivino-credenziali-operatori.csv`

Le password temporanee sono mostrate soltanto al momento della creazione o del reset.

### 6. Account di prova già esistenti

Gli account cassa e stand creati in precedenza con email personali continueranno a comparire.

Dal pannello possono essere:

- lasciati attivi durante i test;
- disattivati dopo aver verificato i nuovi profili.

Non eliminare direttamente gli utenti dal database.

## Nota

Il pannello crea le postazioni e gli operatori, ma i nomi degli stand restano generici:

- Stand 01
- Stand 02
- ...
- Stand 15

Saranno rinominati quando sarà definita la distribuzione reale.
