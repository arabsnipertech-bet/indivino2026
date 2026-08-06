# INDIVINO 2026 — STEP 8 CONTROLLI

## Funzioni inserite

### Rimborso contanti

- disponibile soltanto nel pannello amministratore;
- rimborsa esclusivamente credito originato da ricariche contanti;
- credito POS, Stripe e omaggio non viene mai rimborsato;
- importo sempre multiplo di 2 €;
- motivazione obbligatoria;
- registra saldo prima/dopo, amministratore e data.

Il credito viene separato in lotti e consumato FIFO.
Il saldo mostrato come “Contanti rimborsabili” è quindi reale, non una semplice sottrazione approssimativa.

### Ticket gratuito

Disponibile soltanto nell’amministrazione.

Importi iniziali:

- 1 Divino = 2 €
- 2 Divini = 4 €
- 3 Divini = 6 €
- 5 Divini = 10 €
- 10 Divini = 20 €

Il ticket:

- aumenta il saldo;
- appare nello storico;
- non è rimborsabile in contanti;
- è separato dagli incassi reali.

### Eliminazione cliente

- saldo diverso da zero: eliminazione rifiutata;
- saldo zero e nessun movimento: cancellazione definitiva;
- saldo zero ma con storico: account disattivato e dati personali anonimizzati;
- transazioni economiche conservate per quadratura e controllo.

## Ordine di pubblicazione

### 1. SQL

Supabase → SQL Editor → New query.

Eseguire:

`sql/12_database_controls.sql`

Risultato atteso:

- credit_lots = wallet_credit_lots
- credit_consumptions = wallet_credit_consumptions
- free_ticket_presets = free_ticket_presets
- active_presets = 5
- wallet_balances_cents uguale a credit_lots_remaining_cents

L’ultima uguaglianza è il controllo più importante.

### 2. Edge Function admin-staff

Supabase → Edge Functions → admin-staff → Code.

Sostituire tutto con:

`supabase/functions/admin-staff/index.ts`

Pubblicare.

Settings:

`Verify JWT with legacy secret = OFF`

### 3. Edge Function Stripe

Il pacchetto contiene anche la versione diagnostica già corretta di:

`supabase/functions/stripe-create-checkout/index.ts`

Sostituirla soltanto se nel pannello Supabase è rimasta una versione precedente.

### 4. GitHub

Caricare tutto il contenuto del pacchetto nel repository.

Commit:

`Controlli rimborsi ticket ed eliminazione utenti`

Attendere il deployment Cloudflare verde.

## Test raccomandato

Creare un cliente test con saldo zero.

1. caricare 10 € contanti;
2. caricare 10 € POS;
3. assegnare 2 Divini gratuiti;
4. verificare il saldo totale;
5. effettuare un pagamento allo stand;
6. verificare il credito contante rimborsabile;
7. rimborsare soltanto la quota contante indicata;
8. provare a superarla: il sistema deve rifiutare;
9. portare il saldo a zero;
10. eliminare il cliente.

## Stripe reale

Non attivare ancora le chiavi LIVE.

Il passaggio definitivo richiederà:

- account Stripe completamente verificato;
- chiave server LIVE;
- webhook LIVE separato;
- signing secret LIVE;
- prova reale di piccolo importo;
- verifica accredito e dashboard;
- separazione chiara dei dati test e live.
