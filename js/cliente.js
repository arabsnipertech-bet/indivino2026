import { supabaseClient } from "./supabase-client.js";
import { APP_CONFIG } from "./config.js";

const nomeUtente = document.querySelector("#customer-name");
const statoAccount = document.querySelector("#account-status");
const saldoElement = document.querySelector("#wallet-balance");
const diviniElement = document.querySelector("#wallet-divini");
const qrContainer = document.querySelector("#qr-code");
const qrTokenText = document.querySelector("#qr-token-text");
const movements = document.querySelector("#movement-list");
const pageMessage = document.querySelector("#page-message");
const logoutButton = document.querySelector("#logout-button");
const stripeAmountButtons = [
  ...document.querySelectorAll(".stripe-amount-button")
];
const stripeSelectedAmount = document.querySelector("#stripe-selected-amount");
const stripeSelectedDivini = document.querySelector("#stripe-selected-divini");
const stripeCheckoutButton = document.querySelector("#stripe-checkout-button");
const stripeMessage = document.querySelector("#stripe-message");

let selectedStripeAmountCents = 0;
let currentWallet = null;

function formatEuro(cents) {
  return new Intl.NumberFormat(APP_CONFIG.locale, {
    style: "currency",
    currency: APP_CONFIG.valuta
  }).format(Number(cents || 0) / 100);
}

function formatDivini(cents) {
  const value = Number(cents || 0) / APP_CONFIG.valoreDivinoCentesimi;
  return new Intl.NumberFormat(APP_CONFIG.locale, {
    maximumFractionDigits: 2
  }).format(value);
}

function showPageError(text) {
  if (!pageMessage) return;
  pageMessage.textContent = text;
  pageMessage.className = "demo-notice demo-notice--error";
}

function showStripeMessage(text, type = "info") {
  if (!stripeMessage) return;
  stripeMessage.textContent = text;
  stripeMessage.className = `form-message is-visible is-${type}`;
}

function clearStripeMessage() {
  if (!stripeMessage) return;
  stripeMessage.textContent = "";
  stripeMessage.className = "form-message";
}

function setStripeButtonLoading(loading) {
  if (!stripeCheckoutButton) return;

  if (!stripeCheckoutButton.dataset.originalText) {
    stripeCheckoutButton.dataset.originalText =
      stripeCheckoutButton.textContent;
  }

  stripeCheckoutButton.disabled = loading || !selectedStripeAmountCents;
  stripeCheckoutButton.textContent = loading
    ? "Apertura pagamento sicuro…"
    : stripeCheckoutButton.dataset.originalText;
}

function transactionLabel(row) {
  if (row.type === "pagamento") {
    return row.stand?.name
      ? `Pagamento · ${row.stand.name}`
      : "Pagamento stand";
  }

  if (row.type === "ricarica" && row.payment_method === "stripe") {
    return "Ricarica online · Stripe";
  }

  if (row.type === "ricarica" && row.payment_method === "omaggio") {
    return "Ticket gratuito";
  }

  if (row.type === "storno" && row.payment_method === "contanti") {
    return "Rimborso contanti";
  }

  const labels = {
    ricarica: "Ricarica cassa",
    storno: "Storno",
    rettifica: "Rettifica amministrativa"
  };

  return labels[row.type] || "Movimento";
}

function renderTransactions(rows) {
  if (!movements) return;

  if (!rows?.length) {
    movements.innerHTML = `
      <div class="empty-state">
        <strong>Nessun movimento</strong>
        <span>Le ricariche e gli acquisti compariranno qui.</span>
      </div>
    `;
    return;
  }

  movements.innerHTML = rows.map((row) => {
    const positive = !(
      row.type === "pagamento" ||
      (
        row.type === "storno" &&
        row.payment_method === "contanti"
      )
    );
    const sign = positive ? "+" : "−";
    const date = new Intl.DateTimeFormat(APP_CONFIG.locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(row.created_at));

    return `
      <div class="movement">
        <div>
          <strong>${transactionLabel(row)}</strong>
          <span>${date}</span>
        </div>
        <b class="${positive ? "positive" : ""}">
          ${sign} ${formatEuro(row.amount_cents)}
        </b>
      </div>
    `;
  }).join("");
}

function renderQr(token) {
  if (!qrContainer || !token) return;

  const qrValue = `INDIVINO:${token}`;
  qrContainer.innerHTML = "";

  if (window.QRCode) {
    new window.QRCode(qrContainer, {
      text: qrValue,
      width: 190,
      height: 190,
      colorDark: "#241b1d",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.H
    });
  } else {
    qrContainer.textContent = "QR non disponibile";
  }

  if (qrTokenText) {
    qrTokenText.textContent = token;
  }
}

async function loadDashboard() {
  const {
    data: { session },
    error: sessionError
  } = await supabaseClient.auth.getSession();

  if (sessionError || !session?.user) {
    window.location.replace("/login");
    return;
  }

  const userId = session.user.id;

  const [
    { data: profile, error: profileError },
    { data: wallet, error: walletError }
  ] = await Promise.all([
    supabaseClient
      .from("profiles")
      .select("first_name, last_name, role, active")
      .eq("id", userId)
      .single(),
    supabaseClient
      .from("wallets")
      .select("id, balance_cents, qr_token, blocked")
      .eq("user_id", userId)
      .single()
  ]);

  if (profileError) throw profileError;
  if (walletError) throw walletError;

  if (!profile.active) {
    await supabaseClient.auth.signOut();
    window.location.replace("/login");
    return;
  }

  if (profile.role !== "cliente") {
    const destinations = {
      cassa: "/cassa",
      stand: "/stand",
      admin: "/admin"
    };
    window.location.replace(destinations[profile.role] || "/login");
    return;
  }

  if (nomeUtente) {
    nomeUtente.textContent = profile.first_name || "ospite";
  }

  if (statoAccount) {
    statoAccount.textContent = wallet.blocked
      ? "Portafoglio bloccato"
      : "Account attivo";
    statoAccount.classList.toggle("status-badge--blocked", wallet.blocked);
  }

  if (saldoElement) saldoElement.textContent = formatEuro(wallet.balance_cents);
  if (diviniElement) {
    const quantity = formatDivini(wallet.balance_cents);
    diviniElement.textContent = `${quantity} ${quantity === "1" ? "Divino" : "Divini"}`;
  }

  currentWallet = wallet;
  renderQr(wallet.qr_token);

  const { data: transactionRows, error: transactionError } = await supabaseClient
    .from("transactions")
    .select("id, type, amount_cents, payment_method, created_at, stand:stands(name)")
    .eq("wallet_id", wallet.id)
    .order("created_at", { ascending: false })
    .limit(10);

  // wallet.id is required by the transaction query; fetch it if the earlier
  // selection was changed accidentally.
  if (transactionError) {
    const { data: walletWithId, error: walletIdError } = await supabaseClient
      .from("wallets")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (walletIdError) throw walletIdError;

    const retry = await supabaseClient
      .from("transactions")
      .select("id, type, amount_cents, payment_method, created_at, stand:stands(name)")
      .eq("wallet_id", walletWithId.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (retry.error) throw retry.error;
    renderTransactions(retry.data);
  } else {
    renderTransactions(transactionRows);
  }
}


function chooseStripeAmount(amountCents) {
  selectedStripeAmountCents = Number(amountCents || 0);
  clearStripeMessage();

  stripeAmountButtons.forEach((button) => {
    button.classList.toggle(
      "is-active",
      Number(button.dataset.stripeAmount) === selectedStripeAmountCents
    );
  });

  if (stripeSelectedAmount) {
    stripeSelectedAmount.textContent = formatEuro(selectedStripeAmountCents);
  }

  if (stripeSelectedDivini) {
    stripeSelectedDivini.textContent =
      `${formatDivini(selectedStripeAmountCents)} Divini`;
  }

  if (stripeCheckoutButton) {
    stripeCheckoutButton.disabled = !selectedStripeAmountCents;
  }
}

stripeAmountButtons.forEach((button) => {
  button.addEventListener("click", () => {
    chooseStripeAmount(button.dataset.stripeAmount);
  });
});

stripeCheckoutButton?.addEventListener("click", async () => {
  clearStripeMessage();

  if (!selectedStripeAmountCents) {
    showStripeMessage("Scegli prima un importo.", "error");
    return;
  }

  if (currentWallet?.blocked) {
    showStripeMessage(
      "Il portafoglio è bloccato. Rivolgiti all’amministrazione.",
      "error"
    );
    return;
  }

  setStripeButtonLoading(true);
  const requestId = crypto.randomUUID();

  try {
    const { data, error } = await supabaseClient.functions.invoke(
      "stripe-create-checkout",
      {
        body: {
          amount_cents: selectedStripeAmountCents,
          request_id: requestId
        }
      }
    );

    if (error) {
      let detail = error.message || "Impossibile avviare il pagamento.";

      try {
        if (error.context && typeof error.context.json === "function") {
          const payload = await error.context.json();
          detail = payload?.error || payload?.message || detail;
        }
      } catch {
        // Mantiene il messaggio disponibile.
      }

      throw new Error(detail);
    }

    if (!data?.url) {
      throw new Error("Stripe non ha restituito la pagina di pagamento.");
    }

    window.location.assign(data.url);
  } catch (error) {
    console.error("Errore Stripe Checkout:", error);
    showStripeMessage(
      error?.message || "Impossibile avviare la ricarica online.",
      "error"
    );
    setStripeButtonLoading(false);
  }
});

async function waitForStripeCredit(sessionId) {
  showStripeMessage(
    "Pagamento ricevuto. Attendo la conferma e aggiorno il saldo…",
    "info"
  );

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabaseClient
      .from("stripe_payments")
      .select("status, amount_cents, paid_at")
      .eq("checkout_session_id", sessionId)
      .maybeSingle();

    if (!error && data?.status === "paid") {
      showStripeMessage(
        `Ricarica di ${formatEuro(data.amount_cents)} completata.`,
        "success"
      );

      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("stripe");
      cleanUrl.searchParams.delete("session_id");
      window.history.replaceState({}, "", cleanUrl.pathname);

      await loadDashboard();
      return;
    }

    if (!error && ["failed", "expired", "cancelled"].includes(data?.status)) {
      showStripeMessage(
        "Il pagamento non è stato completato. Il saldo non è stato modificato.",
        "error"
      );
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  showStripeMessage(
    "Il pagamento risulta ricevuto, ma l’aggiornamento sta impiegando più tempo del previsto. Aggiorna la pagina tra qualche secondo.",
    "info"
  );
}

async function handleStripeReturn() {
  const url = new URL(window.location.href);
  const result = url.searchParams.get("stripe");
  const sessionId = url.searchParams.get("session_id");

  if (result === "success" && sessionId) {
    await waitForStripeCredit(sessionId);
    return;
  }

  if (result === "cancelled") {
    showStripeMessage(
      "Pagamento annullato. Nessun importo è stato addebitato al portafoglio.",
      "info"
    );

    url.searchParams.delete("stripe");
    window.history.replaceState({}, "", url.pathname);
  }
}

logoutButton?.addEventListener("click", async () => {
  logoutButton.disabled = true;
  await supabaseClient.auth.signOut();
  window.location.replace("/login");
});

try {
  await loadDashboard();
  await handleStripeReturn();
} catch (error) {
  console.error("Errore area cliente:", error);
  showPageError(
    "Non è stato possibile caricare il portafoglio. Controlla di aver eseguito lo script SQL in Supabase."
  );
}
