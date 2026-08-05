import { supabaseClient } from "./supabase-client.js";
import { APP_CONFIG } from "./config.js";

const standHeaderName = document.querySelector("#stand-header-name");
const operatorName = document.querySelector("#operator-name");
const standCode = document.querySelector("#stand-code");
const standName = document.querySelector("#stand-name");
const logoutButton = document.querySelector("#logout-button");
const pageMessage = document.querySelector("#page-message");

const summaryTotal = document.querySelector("#summary-total");
const summaryCount = document.querySelector("#summary-count");
const summaryCustomers = document.querySelector("#summary-customers");
const summaryAverage = document.querySelector("#summary-average");

const startScannerButton = document.querySelector("#start-scanner");
const stopScannerButton = document.querySelector("#stop-scanner");
const scannerPlaceholder = document.querySelector("#scanner-placeholder");
const scannerMessage = document.querySelector("#scanner-message");
const manualCodeForm = document.querySelector("#manual-code-form");
const manualCodeInput = document.querySelector("#manual-code");

const selectedEmpty = document.querySelector("#selected-customer-empty");
const selectedCustomerPanel = document.querySelector("#selected-customer");
const selectedStatus = document.querySelector("#selected-status");
const selectedInitials = document.querySelector("#selected-initials");
const selectedName = document.querySelector("#selected-name");
const selectedBalance = document.querySelector("#selected-balance");
const selectedDivini = document.querySelector("#selected-divini");

const paymentForm = document.querySelector("#payment-form");
const paymentFieldset = document.querySelector("#payment-fieldset");
const diviniButtons = [...document.querySelectorAll(".divini-button")];
const diviniInput = document.querySelector("#custom-divini");
const paymentPreview = document.querySelector("#payment-preview");
const diviniPreview = document.querySelector("#divini-preview");
const afterPreview = document.querySelector("#after-preview");
const balanceWarning = document.querySelector("#balance-warning");
const paymentMessage = document.querySelector("#payment-message");
const paymentNote = document.querySelector("#payment-note");

const modal = document.querySelector("#payment-modal");
const modalInitials = document.querySelector("#modal-initials");
const modalCustomer = document.querySelector("#modal-customer");
const modalStand = document.querySelector("#modal-stand");
const modalAmount = document.querySelector("#modal-amount");
const modalDivini = document.querySelector("#modal-divini");
const modalBefore = document.querySelector("#modal-before");
const modalAfter = document.querySelector("#modal-after");
const modalMessage = document.querySelector("#modal-message");
const confirmPaymentButton = document.querySelector("#confirm-payment");

const receiptPanel = document.querySelector("#receipt-panel");
const receiptCustomer = document.querySelector("#receipt-customer");
const receiptDivini = document.querySelector("#receipt-divini");
const receiptAmount = document.querySelector("#receipt-amount");
const receiptBefore = document.querySelector("#receipt-before");
const receiptAfter = document.querySelector("#receipt-after");
const receiptId = document.querySelector("#receipt-id");
const newPaymentButton = document.querySelector("#new-payment");

const recentPayments = document.querySelector("#recent-payments");
const refreshPaymentsButton = document.querySelector("#refresh-payments");

let context = null;
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
  return Number(cents || 0) / APP_CONFIG.valoreDivinoCentesimi;
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

function setButtonLoading(button, loading, loadingText = "Attendere…") {
  if (!button) return;

  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent;
  }

  button.disabled = loading;
  button.textContent = loading ? loadingText : button.dataset.originalText;
}

function readableError(error) {
  const message = String(error?.message || error || "");
  const lowered = message.toLowerCase();

  if (lowered.includes("permesso negato") || lowered.includes("non associato")) {
    return "Questo account non è associato a uno stand attivo.";
  }
  if (lowered.includes("saldo insufficiente")) {
    return "Saldo insufficiente.";
  }
  if (lowered.includes("portafoglio bloccato")) {
    return "Il portafoglio del cliente è bloccato.";
  }
  if (lowered.includes("qr") || lowered.includes("codice")) {
    return message;
  }
  if (lowered.includes("failed to fetch")) {
    return "Connessione instabile. Riprova: lo stesso codice operazione impedirà un doppio addebito.";
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

async function requireStandSession() {
  const {
    data: { session },
    error: sessionError
  } = await supabaseClient.auth.getSession();

  if (sessionError || !session?.user) {
    window.location.replace("/login");
    return null;
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("first_name, last_name, role, active")
    .eq("id", session.user.id)
    .single();

  if (profileError) throw profileError;

  if (!profile.active || profile.role !== "stand") {
    await supabaseClient.auth.signOut();
    window.location.replace("/login");
    return null;
  }

  const { data: standContext, error: contextError } = await supabaseClient.rpc(
    "stand_get_context"
  );

  if (contextError) throw contextError;

  context = standContext;
  const fullOperatorName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ");

  operatorName.textContent = fullOperatorName;
  standHeaderName.textContent = standContext.stand_name;
  standCode.textContent = standContext.stand_code;
  standName.textContent = standContext.stand_name;
  modalStand.textContent = standContext.stand_name;

  return { session, profile, standContext };
}

async function startScanner() {
  clearMessage(scannerMessage);

  if (!window.Html5Qrcode) {
    showMessage(
      scannerMessage,
      "Lettore QR non disponibile. Inserisci il codice manualmente.",
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
        await lookupCustomer(token);
      },
      () => {
        // Gli errori mentre la fotocamera cerca il QR sono normali.
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
      scannerMessage,
      "Impossibile aprire la fotocamera. Concedi il permesso oppure inserisci il codice manualmente.",
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

manualCodeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = parseQrValue(manualCodeInput.value);
  await lookupCustomer(token);
});

async function lookupCustomer(token) {
  clearMessage(scannerMessage);
  clearMessage(paymentMessage);

  if (!token || token.length < 20) {
    showMessage(scannerMessage, "Codice QR non valido.", "error");
    return;
  }

  showMessage(scannerMessage, "Verifica del portafoglio in corso…", "info");

  const { data, error } = await supabaseClient.rpc("stand_lookup_wallet", {
    p_qr_token: token
  });

  if (error) {
    console.error("Errore verifica QR:", error);
    selectedCustomer = null;
    showMessage(scannerMessage, readableError(error), "error");
    return;
  }

  selectedCustomer = data;
  pendingIdempotencyKey = null;

  selectedEmpty.classList.add("is-hidden");
  selectedCustomerPanel.classList.remove("is-hidden");
  selectedStatus.textContent = data.blocked
    ? "Portafoglio bloccato"
    : "Cliente verificato";
  selectedStatus.classList.toggle("selection-chip--blocked", data.blocked);

  selectedInitials.textContent = data.initials || "ID";
  selectedName.textContent = data.customer_label;
  selectedBalance.textContent = formatEuro(data.balance_cents);
  selectedDivini.textContent = `${formatDivini(data.balance_cents)} Divini`;

  paymentFieldset.disabled = Boolean(data.blocked);
  paymentForm.reset();
  diviniButtons.forEach((button) => button.classList.remove("is-active"));
  updatePaymentPreview();
  receiptPanel.classList.add("is-hidden");

  modalInitials.textContent = data.initials || "ID";
  modalCustomer.textContent = data.customer_label;

  if (data.blocked) {
    showMessage(scannerMessage, "Il portafoglio risulta bloccato.", "error");
  } else {
    showMessage(scannerMessage, "QR riconosciuto correttamente.", "success");
    window.setTimeout(() => diviniInput.focus(), 100);
  }
}

function getDivini() {
  return Number(diviniInput.value || 0);
}

function getAmountCents() {
  return getDivini() * APP_CONFIG.valoreDivinoCentesimi;
}

function validatePayment() {
  if (!selectedCustomer) {
    return "Scansiona prima il QR del cliente.";
  }

  const divini = getDivini();
  const cents = getAmountCents();

  if (!Number.isInteger(divini) || divini < 1 || divini > 50) {
    return "Inserisci da 1 a 50 Divini.";
  }

  if (cents > selectedCustomer.balance_cents) {
    return "Saldo insufficiente.";
  }

  return null;
}

function updatePaymentPreview() {
  const divini = getDivini();
  const cents = getAmountCents();
  const currentBalance = Number(selectedCustomer?.balance_cents || 0);
  const after = currentBalance - cents;
  const hasInsufficientBalance = Boolean(
    selectedCustomer && cents > currentBalance
  );

  paymentPreview.textContent = formatEuro(cents);
  diviniPreview.textContent = `${divini || 0} ${divini === 1 ? "Divino" : "Divini"}`;
  afterPreview.textContent = selectedCustomer ? formatEuro(Math.max(after, 0)) : "—";

  balanceWarning.classList.toggle("is-hidden", !hasInsufficientBalance);
  pendingIdempotencyKey = null;
}

diviniButtons.forEach((button) => {
  button.addEventListener("click", () => {
    diviniButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    diviniInput.value = button.dataset.divini;
    updatePaymentPreview();
  });
});

diviniInput.addEventListener("input", () => {
  diviniButtons.forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.divini === diviniInput.value
    );
  });
  updatePaymentPreview();
});

paymentNote.addEventListener("input", () => {
  pendingIdempotencyKey = null;
});

paymentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearMessage(paymentMessage);
  clearMessage(modalMessage);

  const validationError = validatePayment();

  if (validationError) {
    showMessage(paymentMessage, validationError, "error");
    return;
  }

  const divini = getDivini();
  const cents = getAmountCents();
  const after = selectedCustomer.balance_cents - cents;

  modalInitials.textContent = selectedCustomer.initials || "ID";
  modalCustomer.textContent = selectedCustomer.customer_label;
  modalAmount.textContent = formatEuro(cents);
  modalDivini.textContent = `${divini} ${divini === 1 ? "Divino" : "Divini"}`;
  modalBefore.textContent = formatEuro(selectedCustomer.balance_cents);
  modalAfter.textContent = formatEuro(after);

  openModal();
});

function openModal() {
  modal.classList.remove("is-hidden");
  document.body.classList.add("modal-open");
  window.setTimeout(() => confirmPaymentButton.focus(), 50);
}

function closeModal() {
  if (confirmPaymentButton.disabled) return;
  modal.classList.add("is-hidden");
  document.body.classList.remove("modal-open");
}

document.querySelectorAll("[data-close-modal]").forEach((element) => {
  element.addEventListener("click", closeModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modal.classList.contains("is-hidden")) {
    closeModal();
  }
});

confirmPaymentButton.addEventListener("click", async () => {
  clearMessage(modalMessage);

  const validationError = validatePayment();

  if (validationError) {
    showMessage(modalMessage, validationError, "error");
    return;
  }

  const divini = getDivini();
  const amountCents = getAmountCents();
  const note = paymentNote.value.trim();

  pendingIdempotencyKey = pendingIdempotencyKey || crypto.randomUUID();
  setButtonLoading(
    confirmPaymentButton,
    true,
    "Registrazione in corso…"
  );

  const { data, error } = await supabaseClient.rpc("stand_charge_wallet", {
    p_wallet_id: selectedCustomer.wallet_id,
    p_amount_cents: amountCents,
    p_idempotency_key: pendingIdempotencyKey,
    p_note: note || null
  });

  if (error) {
    console.error("Errore pagamento:", error);
    showMessage(modalMessage, readableError(error), "error");

    if (!String(error.message || "").toLowerCase().includes("failed to fetch")) {
      pendingIdempotencyKey = null;
    }

    setButtonLoading(confirmPaymentButton, false);
    return;
  }

  pendingIdempotencyKey = null;
  setButtonLoading(confirmPaymentButton, false);
  closeModal();

  selectedCustomer.balance_cents = data.balance_after_cents;
  selectedBalance.textContent = formatEuro(data.balance_after_cents);
  selectedDivini.textContent = `${formatDivini(data.balance_after_cents)} Divini`;

  receiptCustomer.textContent = selectedCustomer.customer_label;
  receiptDivini.textContent = `${divini} ${divini === 1 ? "Divino" : "Divini"}`;
  receiptAmount.textContent = formatEuro(data.amount_cents);
  receiptBefore.textContent = formatEuro(data.balance_before_cents);
  receiptAfter.textContent = formatEuro(data.balance_after_cents);
  receiptId.textContent = data.transaction_id;
  receiptPanel.classList.remove("is-hidden");

  showMessage(
    paymentMessage,
    `Pagamento di ${formatEuro(data.amount_cents)} completato.`,
    "success"
  );

  paymentFieldset.disabled = true;
  await Promise.all([loadSummary(), loadRecentPayments()]);
  receiptPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

function resetPaymentFlow() {
  selectedCustomer = null;
  pendingIdempotencyKey = null;

  selectedEmpty.classList.remove("is-hidden");
  selectedCustomerPanel.classList.add("is-hidden");
  selectedStatus.textContent = "Nessun cliente";
  selectedStatus.classList.remove("selection-chip--blocked");

  paymentFieldset.disabled = true;
  paymentForm.reset();
  diviniButtons.forEach((button) => button.classList.remove("is-active"));
  updatePaymentPreview();

  receiptPanel.classList.add("is-hidden");
  manualCodeForm.reset();
  clearMessage(scannerMessage);
  clearMessage(paymentMessage);

  window.scrollTo({ top: 0, behavior: "smooth" });
}

newPaymentButton.addEventListener("click", resetPaymentFlow);

async function loadSummary() {
  const { data, error } = await supabaseClient.rpc("stand_daily_summary");

  if (error) {
    console.error("Errore riepilogo stand:", error);
    return;
  }

  summaryTotal.textContent = formatEuro(data.total_cents);
  summaryCount.textContent = new Intl.NumberFormat(APP_CONFIG.locale).format(
    data.operations_count || 0
  );
  summaryCustomers.textContent = new Intl.NumberFormat(APP_CONFIG.locale).format(
    data.unique_customers || 0
  );
  summaryAverage.textContent = formatEuro(data.average_cents);
}

function renderRecentPayments(rows) {
  if (!rows?.length) {
    recentPayments.innerHTML = `
      <div class="empty-state">
        <strong>Nessun pagamento oggi</strong>
        <span>Le operazioni completate compariranno qui.</span>
      </div>
    `;
    return;
  }

  recentPayments.innerHTML = rows.map((row) => {
    const time = new Intl.DateTimeFormat(APP_CONFIG.locale, {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(row.created_at));

    const divini = formatDivini(row.amount_cents);

    return `
      <div class="recent-recharge">
        <div>
          <strong>${escapeHtml(row.customer_label)}</strong>
          <span>${escapeHtml(time)} · ${escapeHtml(String(divini))} Divini</span>
        </div>
        <b>${escapeHtml(formatEuro(row.amount_cents))}</b>
      </div>
    `;
  }).join("");
}

async function loadRecentPayments() {
  recentPayments.innerHTML = `
    <div class="empty-state">
      <strong>Caricamento…</strong>
    </div>
  `;

  const { data, error } = await supabaseClient.rpc("stand_recent_payments", {
    p_limit: 20
  });

  if (error) {
    console.error("Errore ultimi pagamenti:", error);
    recentPayments.innerHTML = `
      <div class="empty-state">
        <strong>Impossibile caricare le operazioni</strong>
      </div>
    `;
    return;
  }

  renderRecentPayments(data);
}

refreshPaymentsButton.addEventListener("click", async () => {
  setButtonLoading(refreshPaymentsButton, true, "…");
  await Promise.all([loadSummary(), loadRecentPayments()]);
  setButtonLoading(refreshPaymentsButton, false);
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
  const standSession = await requireStandSession();

  if (standSession) {
    await Promise.all([loadSummary(), loadRecentPayments()]);
  }
} catch (error) {
  console.error("Errore inizializzazione stand:", error);
  showPageError(readableError(error));
}
