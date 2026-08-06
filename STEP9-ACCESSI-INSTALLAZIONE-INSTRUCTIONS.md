# INDIVINO 2026 — STEP 9

## Funzioni inserite

### 1. Registrazione cliente senza conferma email

Il codice è già predisposto per aprire immediatamente il portafoglio.

Configurazione obbligatoria nel pannello Supabase:

1. Authentication
2. Sign In / Providers
3. Email
4. disattivare `Confirm email`
5. salvare

Dopo la modifica, il cliente:

- inserisce nome, cognome, email e password;
- viene autenticato immediatamente;
- apre il portafoglio;
- non riceve una richiesta di conferma.

L'email resta necessaria per il recupero e l'accesso futuro.

### 2. Creazione responsabile direttamente dalla postazione

Dal pannello amministratore:

1. Casse e stand
2. scegliere Cassa 01, Cassa 02, Stand 05 ecc.
3. Modifica
4. compilare nome della postazione e responsabile
5. attivare `Crea e collega un nuovo profilo responsabile`
6. inserire:
   - nome;
   - cognome;
   - codice accesso;
   - password iniziale facoltativa
7. salvare.

Esempio:

- Postazione: CASSA01
- Nome: Cassa ingresso
- Responsabile: Annalisa Rossi
- Codice accesso: annalisa
- Password: generata oppure scelta

Annalisa accede dalla normale pagina Login scrivendo:

- Email o codice accesso: `annalisa`
- Password: quella consegnata

Il sistema converte internamente il codice in:

`annalisa@operatori.indivino2026.it`

L'operatore entra direttamente nella pagina della cassa o dello stand assegnato.

### Sostituzione responsabile

Quando viene creato un nuovo responsabile:

- il precedente operatore principale della postazione viene disattivato;
- l'amministratore di CASSA01 non viene disattivato;
- il nuovo profilo diventa responsabile principale;
- la password viene mostrata una sola volta e può essere scaricata in CSV.

### 3. QR installazione app

Nel pannello amministratore compare:

`Installa app`

Contiene:

- QR generale;
- indirizzo della pagina;
- stampa del QR;
- pulsante di apertura.

Il QR apre:

`https://indivino2026.arabsnipertech.workers.dev/installa`

Su Android Chrome:

- l'utente apre il QR;
- preme `Installa l'app`;
- conferma l'installazione.

Su iPhone/iPad:

- apre la pagina in Safari;
- Condividi;
- Aggiungi alla schermata Home;
- Aggiungi.

Il browser non consente a un QR di installare automaticamente un'app senza un'azione dell'utente. La pagina rende il passaggio il più rapido possibile.

## Installazione tecnica

### 1. SQL

Eseguire:

`sql/13_operator_access_and_install.sql`

Risultato atteso:

- access_code_column = 1
- cashier_primary_operator_column = 1
- stand_primary_operator_column = 1

### 2. Edge Function

Sostituire e pubblicare:

`supabase/functions/admin-staff/index.ts`

Settings:

`Verify JWT with legacy secret = OFF`

### 3. Disattivare conferma email

Supabase:

`Authentication → Sign In / Providers → Email → Confirm email OFF`

### 4. GitHub

Caricare tutto il pacchetto.

Commit:

`Accessi diretti operatori e installazione app`

Attendere il deployment Cloudflare.

## Test

### Cliente

1. registrare una nuova email;
2. verificare che non arrivi richiesta di conferma;
3. verificare apertura immediata del portafoglio.

### Operatore

1. aprire CASSA02;
2. creare responsabile con codice `annalisa-test`;
3. uscire;
4. Login;
5. inserire `annalisa-test`;
6. inserire la password;
7. verificare apertura diretta della Cassa 02.

### App

1. aprire Amministrazione → Installa app;
2. scansionare il QR;
3. installare;
4. aprire l'icona dalla schermata del telefono;
5. verificare il reindirizzamento automatico in base al ruolo.
