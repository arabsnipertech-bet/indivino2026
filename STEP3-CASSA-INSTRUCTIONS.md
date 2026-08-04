# INDIVINO 2026 — STEP 3 AREA CASSA

## Cosa viene aggiunto

- ricerca cliente per nome, cognome, email o QR;
- scanner QR con fotocamera;
- ricariche da 2 € a 500 €, solo multipli di 2 €;
- pulsanti rapidi 10/20/30/40/50 €;
- pagamento contanti o POS;
- saldo prima e dopo;
- registrazione completa della transazione;
- protezione dal doppio clic tramite idempotency key;
- riepilogo giornaliero dell'operatore;
- ultime ricariche effettuate.

## Ordine corretto

### 1. Database

In Supabase:

1. `SQL Editor`
2. `New query`
3. aprire `sql/03_database_cassa.sql`
4. copiare tutto
5. incollare
6. premere `Run`

Alla fine devono apparire quattro funzioni:

- `cassa_daily_summary`
- `cassa_recent_recharges`
- `cassa_recharge_wallet`
- `cassa_search_customers`

### 2. Crea un secondo account per la cassa

Non trasformare il tuo account cliente principale in cassa.

Crea un secondo account:
- dalla pagina `/registrazione`;
- oppure da Supabase `Authentication → Users`.

Conferma l'email e assicurati che l'utente compaia in `Authentication → Users`.

### 3. Promuovi il secondo account

Apri `sql/04_promote_cashier_by_email.sql`.

Sostituisci entrambe le occorrenze:

`email-cassa@example.com`

con l'email reale del secondo account.

Esegui lo script nel SQL Editor.

Il risultato deve mostrare:

`role = cassa`

### 4. Pubblica il codice

1. estrarre lo ZIP;
2. aprire GitHub `indivino2026`;
3. `Add file → Upload files`;
4. caricare il contenuto della cartella estratta;
5. commit:
   `Attivazione area cassa Indivino`
6. attendere il deployment Cloudflare verde.

### 5. Pulisci la cache

Dopo il deployment:
- aprire il sito;
- eseguire `Ctrl + F5`;
- sul telefono, chiudere e riaprire la scheda;
- se necessario, eliminare i dati del sito.

### 6. Test

1. esci dall'account cliente;
2. accedi con l'account cassa;
3. devi essere portato automaticamente a `/cassa`;
4. cerca il cliente Bruno;
5. selezionalo;
6. carica 10 € con metodo contanti;
7. controlla che il nuovo saldo sia 10 € e 5 Divini;
8. esci dalla cassa;
9. accedi come cliente e controlla saldo e movimento.

## Sicurezza

La cassa non aggiorna mai direttamente la tabella `wallets`.

La funzione SQL:
- verifica il ruolo;
- blocca il portafoglio durante l'operazione;
- impedisce ricariche doppie;
- registra saldo precedente e successivo;
- registra operatore e metodo di pagamento.

La secret key di Supabase non è presente nel progetto.
