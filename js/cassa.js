import { supabaseClient } from "./supabase-client.js";
import { APP_CONFIG } from "./config.js";

const operatorName = document.querySelector("#operator-name");
const logoutButton = document.querySelector("#logout-button");
const pageMessage = document.querySelector("#page-message");

const summaryTotal = document.querySelector("#summary-total");
const summaryCount = document.querySelector("#summary-count");
const summaryCash = document.querySelector("#summary-cash");
const summaryPos = document.querySelector("#summary-pos");

const tabs = [...document.querySelectorAll(".finder-tab")];
const scanPanel = document.querySelector("#scan-panel");
const searchPanel = document.querySelector("#search-panel");
const startScannerButton = document.querySelector("#start-scanner");
const stopScannerButton = document.querySelector("#stop-scanner");
const scannerPlaceholder = document.querySelector("#scanner-placeholder");
const finderMessage = document.querySelector("#finder-message");
const searchForm = document.querySelector("#customer-search-form");
const searchInput = document.querySelector("#customer-search");
const customerResults = document.querySelector("#customer-results");

const selectedEmpty = document.querySelector("#selected-customer-empty");
const selectedCustomerPanel = document.querySelector("#selected-customer");
const selectedStatus = document.querySelector("#selected-status");
const selectedInitials = document.querySelector("#selected-initials");
const selectedName = document.querySelector("#selected-name");
const selectedEmail = document.querySelector("#selected-email");
const selectedBalance = document.querySelector("#selected-balance");
const selectedDivini = document.querySelector("#selected-divini");
const rechargeFieldset = document.querySelector("#recharge-fieldset");

const rechargeForm = document.querySelector("#recharge-form");
const amountInput = document.querySelector("#custom-amount");
const amountButtons = [...document.querySelectorAll(".amount-button")];
const amountPreview = document.querySelector("#amount-preview");
const diviniPreview = document.querySelector("#divini-preview");
const rechargeMessage = document.querySelector("#recharge-message");

const receiptPanel = document.querySelector("#receipt-panel");
const receiptCustomer = document.querySelector("#receipt-customer");
const receiptAmount = document.querySelector("#receipt-amount");
const receiptMethod = document.querySelector("#receipt-method");
const receiptBefore = document.querySelector("#receipt-before");
const receiptAfter = document.querySelector("#receipt-after");
const receiptId = document.querySelector("#receipt-id");
const newOperationButton = document.querySelector("#new-operation");

const recentRecharges = document.querySelector("#recent-recharges");
const refreshRechargesButton = document.querySelector("#refresh-recharges");

let selectedCustomer = null;
let scanner = null;
let scannerRunning = false;
let pendingIdempotencyKey = null;

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(element, text, type = "info") {
  if (!element) return;
  element.textContent = text;
  element.className = `form-message is-visible is-${type}`;
}

function clearMessage(element) {
  if (!element) return;
  element.textContent = "";
  element.className = "form-message";
}

function showPageError(text) {
  if (!pageMessage) return;
  pageMessage.textContent = text;
  pageMessage.className = "demo-notice demo-notice--error";
}

function setButtonLoading(button, loading, text = "Attendere…") {
  if (!button) return;
  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent;
  }
  button.disabled = loading;
  button.textContent = loading ? text : button.dataset.originalText;
}

function readableError(error) {
  const message = String(error?.message || error || "");
  const lowered = message.toLowerCase();

  if (lowered.includes("permesso negato") || lowered.includes("not authorized")) {
    return "Questo account non è autorizzato a utilizzare la cassa.";
  }
  if (lowered.includes("portafoglio bloccato")) {
    return "Il portafoglio del cliente è bloccato.";
  }
  if (lowered.includes("importo")) {
    return message;
  }
  if (lowered.includes("failed to fetch")) {
    return "Connessione assente o instabile. Riprova: il sistema userà lo stesso codice operazione per evitare doppie ricariche.";
  }

  return message || "Si è verificato un errore.";
}

function parseQrValue(decodedText) {
  const value = String(decodedText || "").trim();
  if (value.toUpperCase().startsWith("INDIVINO:")) {
    return value.slice(value.indexOf(":") + 1).trim();
  }
  return value;
}

async function requireCashierSession() {
  const {
    data: { session },
    error: sessionError
  } = await supabaseClient.auth.getSession();

  if (sessionError || !session?.user) {
    window.location.replace("/login");
    return null;
  }

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("first_name, last_name, role, active")
    .eq("id", session.user.id)
    .single();

  if (error) throw error;

  if (!profile.active || !["cassa", "admin"].includes(profile.role)) {
    await supabaseClient.auth.signOut();
    window.location.replace("/login");
    return null;
  }

  operatorName.textContent = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ");

  return { session, profile };
}

function switchFinderMode(mode) {
  tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.mode === mode);
  });

  scanPanel.classList.toggle("is-hidden", mode !== "scan");
  searchPanel.classList.toggle("is-hidden", mode !== "search");

  if (mode !== "scan") {
    stopScanner().catch(console.warn);
    window.setTimeout(() => searchInput?.focus(), 100);
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchFinderMode(tab.dataset.mode));
});

async function startScanner() {
  clearMessage(finderMessage);

  if (!window.Html5Qrcode) {
    showMessage(
      finderMessage,
      "Lettore QR non disponibile. Usa la ricerca manuale.",
      "error"
    );
    return;
  }

  if (scannerRunning) return;

  scanner = scanner || new window.Html5Qrcode("qr-reader");

  startScannerButton.disabled = true;
  scannerPlaceholder.classList.add("is-hidden");

  try {
    await scanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1,
        formatsToSupport: [window.Html5QrcodeSupportedFormats.QR_CODE]
      },
      async (decodedText) => {
        if (!scannerRunning) return;
        const token = parseQrValue(decodedText);
        await stopScanner();
        await searchCustomers(token, true);
      },
      () => {
        // Gli errori di scansione durante l'inquadratura sono normali.
      }
    );

    scannerRunning = true;
    startScannerButton.classList.add("is-hidden");
    stopScannerButton.classList.remove("is-hidden");
  } catch (error) {
    console.error("Errore fotocamera:", error);
    scannerPlaceholder.classList.remove("is-hidden");
    startScannerButton.disabled = false;
    showMessage(
      finderMessage,
      "Non è stato possibile aprire la fotocamera. Concedi il permesso oppure usa la ricerca manuale.",
      "error"
    );
  }
}

async function stopScanner() {
  if (scanner && scannerRunning) {
    try {
      await scanner.stop();
      await scanner.clear();
    } catch (error) {
      console.warn("Arresto scanner:", error);
    }
  }

  scannerRunning = false;
  scanner = null;
  startScannerButton.disabled = false;
  startScannerButton.classList.remove("is-hidden");
  stopScannerButton.classList.add("is-hidden");
  scannerPlaceholder.classList.remove("is-hidden");
}

startScannerButton.addEventListener("click", startScanner);
stopScannerButton.addEventListener("click", stopScanner);

function renderSearchResults(rows) {
  customerResults.innerHTML = "";

  if (!rows?.length) {
    customerResults.innerHTML = `
      <div class="empty-state">
        <strong>Nessun cliente trovato</strong>
        <span>Controlla il nome, l’email o riprova a scansionare il QR.</span>
      </div>
    `;
    return;
  }

  customerResults.innerHTML = rows.map((customer, index) => {
    const initials = `${customer.first_name?.[0] || ""}${customer.last_name?.[0] || ""}`.toUpperCase();
    const status = customer.blocked ? "Bloccato" : "Attivo";

    return `
      <button class="customer-result" type="button" data-index="${index}">
        <span class="customer-avatar">${escapeHtml(initials || "ID")}</span>
        <span class="customer-result__identity">
          <strong>${escapeHtml(customer.first_name)} ${escapeHtml(customer.last_name)}</strong>
          <small>${escapeHtml(customer.email)}</small>
        </span>
        <span class="customer-result__balance">
          <strong>${escapeHtml(formatEuro(customer.balance_cents))}</strong>
          <small>${escapeHtml(formatDivini(customer.balance_cents))} Divini · ${escapeHtml(status)}</small>
        </span>
      </button>
    `;
  }).join("");

  customerResults.querySelectorAll(".customer-result").forEach((button) => {
    button.addEventListener("click", () => {
      const customer = rows[Number(button.dataset.index)];
      selectCustomer(customer);
    });
  });
}

async function searchCustomers(query, autoSelectExact = false) {
  const value = String(query || "").trim();
  clearMessage(finderMessage);

  if (value.length < 2) {
    showMessage(finderMessage, "Inserisci almeno due caratteri.", "error");
    return;
  }

  customerResults.innerHTML = `
    <div class="empty-state">
      <strong>Ricerca in corso…</strong>
    </div>
  `;

  const { data, error } = await supabaseClient.rpc("cassa_search_customers", {
    p_query: value
  });

  if (error) {
    console.error("Errore ricerca:", error);
    customerResults.innerHTML = "";
    showMessage(finderMessage, readableError(error), "error");
    return;
  }

  renderSearchResults(data);

  if (autoSelectExact && data?.length === 1) {
    selectCustomer(data[0]);
    showMessage(finderMessage, "QR riconosciuto correttamente.", "success");
  } else if (autoSelectExact && data?.length !== 1) {
    showMessage(
      finderMessage,
      "QR non riconosciuto oppure portafoglio non disponibile.",
      "error"
    );
  }
}

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await searchCustomers(searchInput.value);
});

function selectCustomer(customer) {
  selectedCustomer = customer;
  pendingIdempotencyKey = null;

  selectedEmpty.classList.add("is-hidden");
  selectedCustomerPanel.classList.remove("is-hidden");
  rechargeFieldset.disabled = Boolean(customer.blocked);

  const initials = `${customer.first_name?.[0] || ""}${customer.last_name?.[0] || ""}`.toUpperCase();
  selectedInitials.textContent = initials || "ID";
  selectedName.textContent = `${customer.first_name} ${customer.last_name}`;
  selectedEmail.textContent = customer.email;
  selectedBalance.textContent = formatEuro(customer.balance_cents);
  selectedDivini.textContent = `${formatDivini(customer.balance_cents)} Divini`;

  selectedStatus.textContent = customer.blocked ? "Portafoglio bloccato" : "Cliente selezionato";
  selectedStatus.classList.toggle("selection-chip--blocked", customer.blocked);

  receiptPanel.classList.add("is-hidden");
  rechargeForm.reset();
  amountButtons.forEach((button) => button.classList.remove("is-active"));
  updateAmountPreview();
  clearMessage(rechargeMessage);

  if (!customer.blocked) {
    window.setTimeout(() => amountInput.focus(), 100);
  }
}

function getAmountCents() {
  const amount = Number(amountInput.value || 0);
  return Math.round(amount * 100);
}

function updateAmountPreview() {
  const cents = getAmountCents();
  amountPreview.textContent = formatEuro(cents);
  diviniPreview.textContent = `${formatDivini(cents)} Divini`;
  pendingIdempotencyKey = null;
}

amountButtons.forEach((button) => {
  button.addEventListener("click", () => {
    amountButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    amountInput.value = button.dataset.amount;
    updateAmountPreview();
  });
});

amountInput.addEventListener("input", () => {
  amountButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.amount === amountInput.value);
  });
  updateAmountPreview();
});

rechargeForm.addEventListener("change", (event) => {
  if (event.target.name === "payment_method") {
    pendingIdempotencyKey = null;
  }
});

function validateAmount(cents) {
  if (!Number.isInteger(cents) || cents < 200 || cents > 50000) {
    return "L’importo deve essere compreso tra 2 € e 500 €.";
  }
  if (cents % 200 !== 0) {
    return "L’importo deve essere un multiplo di 2 €.";
  }
  return null;
}

rechargeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(rechargeMessage);

  if (!selectedCustomer) {
    showMessage(rechargeMessage, "Seleziona prima un cliente.", "error");
    return;
  }

  const amountCents = getAmountCents();
  const amountError = validateAmount(amountCents);

  if (amountError) {
    showMessage(rechargeMessage, amountError, "error");
    return;
  }

  const formData = new FormData(rechargeForm);
  const paymentMethod = String(formData.get("payment_method") || "contanti");
  const note = String(formData.get("note") || "").trim();
  const submitButton = rechargeForm.querySelector('button[type="submit"]');

  pendingIdempotencyKey = pendingIdempotencyKey || crypto.randomUUID();
  setButtonLoading(submitButton, true, "Registrazione in corso…");

  const { data, error } = await supabaseClient.rpc("cassa_recharge_wallet", {
    p_wallet_id: selectedCustomer.wallet_id,
    p_amount_cents: amountCents,
    p_payment_method: paymentMethod,
    p_idempotency_key: pendingIdempotencyKey,
    p_note: note || null
  });

  if (error) {
    console.error("Errore ricarica:", error);
    showMessage(rechargeMessage, readableError(error), "error");

    // In caso di errore certo del database, un nuovo tentativo può avere
    // un nuovo codice. In caso di rete instabile conserviamo invece il codice.
    if (!String(error.message || "").toLowerCase().includes("failed to fetch")) {
      pendingIdempotencyKey = null;
    }

    setButtonLoading(submitButton, false);
    return;
  }

  pendingIdempotencyKey = null;
  setButtonLoading(submitButton, false);

  const result = data || {};
  selectedCustomer.balance_cents = result.balance_after_cents;
  selectedBalance.textContent = formatEuro(result.balance_after_cents);
  selectedDivini.textContent = `${formatDivini(result.balance_after_cents)} Divini`;

  receiptCustomer.textContent = `${selectedCustomer.first_name} ${selectedCustomer.last_name}`;
  receiptAmount.textContent = formatEuro(result.amount_cents);
  receiptMethod.textContent = result.payment_method === "pos" ? "POS" : "Contanti";
  receiptBefore.textContent = formatEuro(result.balance_before_cents);
  receiptAfter.textContent = formatEuro(result.balance_after_cents);
  receiptId.textContent = result.transaction_id;
  receiptPanel.classList.remove("is-hidden");

  showMessage(
    rechargeMessage,
    `Ricarica di ${formatEuro(result.amount_cents)} completata.`,
    "success"
  );

  await Promise.all([loadSummary(), loadRecentRecharges()]);
  receiptPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

newOperationButton.addEventListener("click", () => {
  selectedCustomer = null;
  pendingIdempotencyKey = null;
  selectedEmpty.classList.remove("is-hidden");
  selectedCustomerPanel.classList.add("is-hidden");
  selectedStatus.textContent = "Nessun cliente";
  selectedStatus.classList.remove("selection-chip--blocked");
  rechargeFieldset.disabled = true;
  rechargeForm.reset();
  receiptPanel.classList.add("is-hidden");
  customerResults.innerHTML = "";
  searchInput.value = "";
  clearMessage(finderMessage);
  clearMessage(rechargeMessage);
  updateAmountPreview();
  switchFinderMode("scan");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

async function loadSummary() {
  const { data, error } = await supabaseClient.rpc("cassa_daily_summary");

  if (error) {
    console.error("Errore riepilogo:", error);
    return;
  }

  summaryTotal.textContent = formatEuro(data.total_cents);
  summaryCount.textContent = new Intl.NumberFormat(APP_CONFIG.locale).format(data.operations_count || 0);
  summaryCash.textContent = formatEuro(data.cash_cents);
  summaryPos.textContent = formatEuro(data.pos_cents);
}

function renderRecentRecharges(rows) {
  if (!rows?.length) {
    recentRecharges.innerHTML = `
      <div class="empty-state">
        <strong>Nessuna ricarica oggi</strong>
        <span>Le operazioni completate compariranno qui.</span>
      </div>
    `;
    return;
  }

  recentRecharges.innerHTML = rows.map((row) => {
    const time = new Intl.DateTimeFormat(APP_CONFIG.locale, {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(row.created_at));

    return `
      <div class="recent-recharge">
        <div>
          <strong>${escapeHtml(row.first_name)} ${escapeHtml(row.last_name)}</strong>
          <span>${escapeHtml(time)} · ${row.payment_method === "pos" ? "POS" : "Contanti"}</span>
        </div>
        <b>${escapeHtml(formatEuro(row.amount_cents))}</b>
      </div>
    `;
  }).join("");
}

async function loadRecentRecharges() {
  recentRecharges.innerHTML = `
    <div class="empty-state">
      <strong>Caricamento…</strong>
    </div>
  `;

  const { data, error } = await supabaseClient.rpc("cassa_recent_recharges", {
    p_limit: 20
  });

  if (error) {
    console.error("Errore ultime ricariche:", error);
    recentRecharges.innerHTML = `
      <div class="empty-state">
        <strong>Impossibile caricare le operazioni</strong>
      </div>
    `;
    return;
  }

  renderRecentRecharges(data);
}

refreshRechargesButton.addEventListener("click", async () => {
  setButtonLoading(refreshRechargesButton, true, "…");
  await Promise.all([loadSummary(), loadRecentRecharges()]);
  setButtonLoading(refreshRechargesButton, false);
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  await stopScanner();
  await supabaseClient.auth.signOut();
  window.location.replace("/login");
});

window.addEventListener("beforeunload", () => {
  if (scanner && scannerRunning) {
    scanner.stop().catch(() => {});
  }
});

try {
  const cashier = await requireCashierSession();
  if (cashier) {
    await Promise.all([loadSummary(), loadRecentRecharges()]);
  }
} catch (error) {
  console.error("Errore inizializzazione cassa:", error);
  showPageError(readableError(error));
}
