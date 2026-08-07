# INDIVINO 2026 — STEP 10

## Correzione delle ricariche manuali

Dal pannello amministratore:

1. aprire `Clienti e badge`;
2. cercare il cliente;
3. premere `Correggi ricarica`;
4. scegliere una ricarica manuale contanti o POS;
5. inserire l'importo totale che avrebbe dovuto essere caricato;
6. inserire una motivazione;
7. confermare.

Esempio:

- ricarica originale: 50 €
- importo corretto: 20 €
- rettifica generata: −30 €
- ricarica originale: conservata
- nuovo saldo: ridotto di 30 €
- registro: `Correzione ricarica`

La funzione permette anche il caso opposto:

- ricarica originale: 20 €
- importo corretto: 50 €
- rettifica generata: +30 €

## Regole di sicurezza

- soltanto amministratore;
- soltanto ricariche manuali contanti/POS;
- Stripe escluso;
- ticket gratuiti esclusi;
- pagamenti agli stand esclusi;
- importi multipli di 2 €;
- motivazione obbligatoria;
- ricarica originale mai modificata o cancellata;
- ogni rettifica ha un riferimento UUID alla ricarica originale;
- se una parte del credito è stata già spesa, il sistema permette di sottrarre soltanto la quota ancora disponibile;
- nessun saldo negativo;
- idempotenza contro doppi clic e richieste ripetute.

## Installazione

### 1. SQL

Supabase → SQL Editor → New query.

Eseguire:

`sql/14_manual_recharge_corrections.sql`

Risultato atteso:

- `root_transaction_column = 1`
- `correction_functions = 2`
- `wallet_balances_cents` uguale a `credit_lots_remaining_cents`

### 2. GitHub

Caricare tutto il contenuto del pacchetto.

Commit suggerito:

`Correzione ricariche manuali`

Attendere il deployment Cloudflare verde.

Non serve creare o modificare Edge Functions.

## Test raccomandato

1. creare un cliente di prova;
2. caricare 50 € contanti;
3. aprire amministrazione;
4. correggere la ricarica a 20 €;
5. verificare:
   - saldo ridotto di 30 €;
   - ricarica originale da 50 € ancora presente;
   - nuovo movimento `Correzione ricarica −30 €`;
   - motivazione visibile;
   - totale Cassa e Contanti ridotto di 30 €;
6. correggere la stessa operazione da 20 € a 30 €;
7. verificare un nuovo movimento `+10 €`;
8. effettuare un pagamento allo stand;
9. provare una riduzione superiore al credito ancora disponibile;
10. verificare che il sistema la rifiuti.
