# INDIVINO 2026 — STEP 4 AREA STAND

## Funzioni aggiunte

- account associato a uno specifico stand;
- scanner QR;
- codice manuale di emergenza;
- nessuna ricerca per nome o email;
- nome cliente abbreviato;
- scelta da 1 a 50 Divini;
- anteprima saldo residuo;
- conferma finale in finestra dedicata;
- pagamento atomico;
- controllo saldo insufficiente;
- protezione da doppio clic e doppio addebito;
- riepilogo giornaliero dello stand;
- ultime operazioni;
- storico cliente con nome dello stand;
- service worker corretto: non conserva più HTML, CSS e JavaScript.

## Ordine corretto

### 1. Eseguire il database

In Supabase:

1. `SQL Editor`
2. `New query`
3. aprire `sql/05_database_stand.sql`
4. copiare tutto
5. incollare
6. premere `Run`

Alla fine devono comparire cinque funzioni:

- `stand_charge_wallet`
- `stand_daily_summary`
- `stand_get_context`
- `stand_lookup_wallet`
- `stand_recent_payments`

### 2. Creare un account stand

Crea un nuovo account dall'app e conferma l'email.

Esempio:

- Nome: `Stand`
- Cognome: `Uno`
- Email: un indirizzo dedicato
- Password: diversa da cassa e amministrazione

Non riutilizzare l'account cliente o cassa.

### 3. Associare l'account allo stand

Apri:

`sql/06_assign_stand_operator.sql`

Modifica:

- `stand01@example.com` con l'email reale;
- `STAND01` con il codice desiderato.

Attenzione: nel file l'email compare anche nella SELECT finale. Modifica entrambe le occorrenze.

Esegui lo script.

Il risultato deve mostrare:

- `role = stand`
- `stand_code = STAND01`
- `active = true`

### 4. Pubblicare il codice

1. estrarre lo ZIP;
2. aprire GitHub `indivino2026`;
3. `Add file → Upload files`;
4. caricare il contenuto della cartella estratta;
5. commit:
   `Attivazione pagamenti agli stand`
6. attendere il deployment Cloudflare verde.

### 5. Primo test

Saldo cliente Bruno attuale: 10 € = 5 Divini.

1. accedere con l'account dello stand;
2. deve aprirsi automaticamente `/stand`;
3. scansionare il QR di Bruno;
4. selezionare `1 Divino`;
5. verificare anteprima:
   - addebito 2 €
   - saldo residuo 8 €
6. confermare;
7. accedere come Bruno;
8. verificare:
   - saldo 8 €
   - 4 Divini
   - movimento negativo associato allo stand.

### 6. Test saldo insufficiente

Dopo il primo pagamento prova a selezionare un numero di Divini superiore al saldo.

Il sistema deve:
- mostrare `Saldo insufficiente`;
- non aprire o non completare il pagamento;
- non creare alcuna transazione.

## Privacy e sicurezza

Lo stand:
- non può cercare clienti;
- non vede l'email;
- vede solo nome abbreviato e saldo;
- non può ricaricare;
- non può modificare direttamente il portafoglio;
- non può operare per un altro stand.

La funzione SQL:
- verifica account e associazione stand;
- blocca il portafoglio durante l'operazione;
- serializza pagamenti e ricariche contemporanei;
- controlla il saldo;
- registra stand, operatore, saldo prima e saldo dopo;
- usa una chiave univoca contro il doppio addebito.

## Cache

Da questa versione il service worker conserva soltanto loghi e icone.

HTML, CSS e JavaScript vengono sempre richiesti alla rete, quindi le nuove versioni pubblicate non dovrebbero più rimanere nascoste dietro vecchie cache.
