# INDIVINO 2026 — STEP 7 RICARICA STRIPE

## Funzionamento

Il cliente autenticato sceglie:

- 10 € = 5 Divini
- 20 € = 10 Divini
- 30 € = 15 Divini
- 50 € = 25 Divini

Il browser non riceve mai la secret key Stripe.

Flusso:

1. il cliente richiede la ricarica;
2. la Edge Function verifica sessione, ruolo e portafoglio;
3. Stripe crea una Checkout Session;
4. il cliente paga sulla pagina Stripe;
5. Stripe invia un webhook firmato;
6. il database verifica sessione, importo e valuta;
7. portafoglio e transazione vengono aggiornati insieme;
8. un evento duplicato non può accreditare due volte.

## Prima regola

Configurare prima tutto in modalità TEST Stripe.

Non inserire chiavi live finché non è stato completato il collaudo.

## 1. Database

Supabase → SQL Editor → New query.

Eseguire:

`sql/10_database_stripe.sql`

Risultato atteso:

- `stripe_table = stripe_payments`
- `stripe_functions = 4`

## 2. Creare le Edge Functions

Creare e pubblicare:

### stripe-create-checkout

Codice:

`supabase/functions/stripe-create-checkout/index.ts`

Settings:

`Verify JWT with legacy secret = OFF`

La funzione verifica autonomamente il token dell'utente.

### stripe-webhook

Codice:

`supabase/functions/stripe-webhook/index.ts`

Settings:

`Verify JWT with legacy secret = OFF`

Questa funzione è pubblica perché Stripe non possiede un token Supabase.
La sicurezza deriva dalla verifica della firma `Stripe-Signature`.

## 3. Segreti Supabase

Supabase → Edge Functions → Secrets.

Aggiungere:

### STRIPE_SECRET_KEY

La secret key TEST Stripe.

Inizia normalmente con:

`sk_test_`

Non copiarla nel sito, in GitHub o in chat.

### SITE_URL

Valore:

`https://indivino2026.arabsnipertech.workers.dev`

### STRIPE_WEBHOOK_SECRET

Questo valore si aggiunge dopo aver creato il webhook Stripe.

Inizia normalmente con:

`whsec_`

Il signing secret del webhook non è la secret API key.

## 4. Webhook Stripe

URL funzione:

`https://rwcpfeesufwgxrhfcsta.supabase.co/functions/v1/stripe-webhook`

Nel Dashboard Stripe, in modalità TEST:

1. Workbench
2. Webhooks
3. Create an event destination
4. Your account / Account
5. Selezionare gli eventi:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
6. Destination type: Webhook endpoint
7. Inserire l'URL sopra
8. Creare la destinazione
9. Aprire la destinazione
10. Copiare il signing secret `whsec_...`
11. salvarlo nei Secrets Supabase come `STRIPE_WEBHOOK_SECRET`

Dopo aver salvato i segreti, ripubblicare entrambe le Edge Functions.

## 5. Pubblicare il sito

Caricare su GitHub il contenuto dello ZIP.

Commit suggerito:

`Attivazione ricariche Stripe`

Attendere il deployment Cloudflare verde.

## 6. Test

Usare un cliente registrato con email reale.

1. accedere al portafoglio;
2. scegliere 10 €;
3. premere Continua su Stripe;
4. usare una carta TEST Stripe;
5. completare il pagamento;
6. attendere il ritorno all'app;
7. verificare:
   - saldo aumentato di 10 €;
   - Divini aumentati di 5;
   - movimento `Ricarica online · Stripe`;
   - amministrazione: card `Stripe online` aumentata di 10 €.

Carta test base:

`4242 4242 4242 4242`

- scadenza futura;
- CVC qualunque di 3 cifre;
- CAP qualunque valido.

Non usare carte reali in modalità test.

## 7. Passaggio alla modalità LIVE

Solo dopo i test:

1. attivare e verificare completamente l'account Stripe;
2. usare la secret key LIVE;
3. creare un nuovo webhook LIVE;
4. sostituire `STRIPE_SECRET_KEY`;
5. sostituire `STRIPE_WEBHOOK_SECRET`;
6. ripubblicare le funzioni;
7. eseguire una prova reale di piccolo importo;
8. verificare accredito, ricevuta e dashboard.

Le chiavi TEST e LIVE sono separate.
Anche i webhook TEST e LIVE hanno signing secret differenti.

## Sicurezza

- importi consentiti soltanto: 10, 20, 30, 50 euro;
- importo determinato dal server, non dal browser;
- portafoglio ricavato dalla sessione autenticata;
- carta gestita esclusivamente da Stripe Checkout;
- firma webhook verificata sul corpo grezzo;
- sessione, PaymentIntent, evento e idempotency key univoci;
- saldo e transazione aggiornati atomicamente;
- nessun accredito basato sulla sola pagina di ritorno;
- RLS: il cliente vede soltanto i propri pagamenti Stripe.
