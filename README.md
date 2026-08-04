# I Divini Digitali — Step 1

Prima base grafica e tecnica dell'app di Indivino 2026.

## Contenuto

- `index.html`: pagina iniziale
- `login.html`: accesso
- `registrazione.html`: creazione portafoglio
- `cliente.html`: area cliente dimostrativa
- `css/style.css`: grafica responsive
- `js/config.js`: configurazione Supabase ancora da compilare
- `js/auth.js`: controlli iniziali dei moduli
- `manifest.json` e `service-worker.js`: base PWA
- `images/`: loghi e icone

## Come provarla sul computer

Metodo rapido:
1. estrarre lo ZIP;
2. aprire `index.html`.

Per provare correttamente anche la PWA e i moduli JavaScript è meglio usare un piccolo server locale:

```bash
python -m http.server 8000
```

Poi aprire:

```text
http://localhost:8000
```

## Stato attuale

La grafica e la navigazione funzionano. Accesso, registrazione, QR e saldo sono ancora dimostrativi.

## Passaggio successivo

1. Creare il progetto Supabase.
2. Inserire `Project URL` e `Publishable key` in `js/config.js`.
3. Creare tabelle, ruoli e regole RLS.
4. Attivare registrazione e accesso reali.

## Sicurezza

Non inserire mai nel progetto o su GitHub:

- database password;
- secret key;
- service role key.
