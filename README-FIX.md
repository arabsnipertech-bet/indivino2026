# Correzione routing Cloudflare Workers

Corregge `ERR_FAILED` sulle pagine di accesso e registrazione.

Modifiche principali:
- URL senza estensione: `/login`, `/registrazione`, `/cliente`
- service worker aggiornato alla cache v2
- configurazione esplicita `wrangler.jsonc`
- esclusione dei file `.git` tramite `.assetsignore`
- pagina `404.html`

Dopo il deployment cancellare i dati del sito o eseguire un aggiornamento forzato.
