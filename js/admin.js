import { supabaseClient } from "./supabase-client.js";
import { APP_CONFIG } from "./config.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const adminName = $("#admin-name");
const logoutButton = $("#logout-button");
const pageMessage = $("#page-message");

const periodForm = $("#period-form");
const dateFrom = $("#date-from");
const dateTo = $("#date-to");
const todayButton = $("#today-button");
const refreshButton = $("#refresh-admin");
const adminMessage = $("#admin-message");

const totalCustomers = $("#total-customers");
const totalLoaded = $("#total-loaded");
const totalSpent = $("#total-spent");
const totalRemaining = $("#total-remaining");
const totalCash = $("#total-cash");
const totalPos = $("#total-pos");
const totalStripe = $("#total-stripe");
const totalFreeTickets = $("#total-free-tickets");
const freeTicketCount = $("#free-ticket-count");
const totalCashRefunds = $("#total-cash-refunds");
const cashRefundCount = $("#cash-refund-count");
const totalManualCorrections = $("#total-manual-corrections");
const manualCorrectionCount = $("#manual-correction-count");
const rechargeCount = $("#recharge-count");
const paymentCount = $("#payment-count");
const remainingDivini = $("#remaining-divini");

const cashierRanking = $("#cashier-ranking");
const standRanking = $("#stand-ranking");
const hourlyChart = $("#hourly-chart");

const balanceLoaded = $("#balance-loaded");
const balanceSpent = $("#balance-spent");
const balanceWallets = $("#balance-wallets");
const balanceDifference = $("#balance-difference");

const positionList = $("#position-list");
const positionFilters = $$(".position-filter");
const positionsMessage = $("#positions-message");
const positionModal = $("#position-modal");
const positionForm = $("#position-form");
const positionTypeInput = $("#position-type");
const positionCodeInput = $("#position-code");
const positionCodeView = $("#position-code-view");
const positionNameInput = $("#position-name");
const positionResponsibleInput = $("#position-responsible");
const positionModalMessage = $("#position-modal-message");
const positionCurrentOperator = $("#position-current-operator");
const positionCurrentLogin = $("#position-current-login");
const positionCreateOperator = $("#position-create-operator");
const positionOperatorFields = $("#position-operator-fields");
const positionOperatorFirstName = $("#position-operator-first-name");
const positionOperatorLastName = $("#position-operator-last-name");
const positionAccessCode = $("#position-access-code");
const positionOperatorPassword = $("#position-operator-password");

const customerSearchForm = $("#customer-search-form");
const customerQuery = $("#customer-query");
const clearCustomerSearchButton = $("#clear-customer-search");
const createCustomerButton = $("#create-customer");
const customerList = $("#customer-list");
const customersMessage = $("#customers-message");
const customerModal = $("#customer-modal");
const createCustomerForm = $("#create-customer-form");
const customerModalMessage = $("#customer-modal-message");

const badgeModal = $("#badge-modal");
const badgeCustomerName = $("#badge-customer-name");
const badgeQr = $("#badge-qr");
const badgeCode = $("#badge-code");
const badgeSource = $("#badge-source");
const badgeLoginEmail = $("#badge-login-email");
const badgePassword = $("#badge-password");
const badgeToken = $("#badge-token");
const printBadgeButton = $("#print-badge");

const rechargeCorrectionModal = $("#recharge-correction-modal");
const rechargeCorrectionForm = $("#recharge-correction-form");
const rechargeCorrectionInitials = $("#recharge-correction-initials");
const rechargeCorrectionCustomer = $("#recharge-correction-customer");
const manualRechargeList = $("#manual-recharge-list");
const correctionSelectedDate = $("#correction-selected-date");
const correctionSelectedPosition = $("#correction-selected-position");
const correctionSelectedMethod = $("#correction-selected-method");
const correctionOriginalAmount = $("#correction-original-amount");
const correctionCurrentAmount = $("#correction-current-amount");
const correctionReducibleAmount = $("#correction-reducible-amount");
const correctionCorrectTotal = $("#correction-correct-total");
const correctionDelta = $("#correction-delta");
const correctionBalanceAfter = $("#correction-balance-after");
const correctionReason = $("#correction-reason");
const rechargeCorrectionMessage = $("#recharge-correction-message");

const cashRefundModal = $("#cash-refund-modal");
const cashRefundForm = $("#cash-refund-form");
const cashRefundInitials = $("#cash-refund-initials");
const cashRefundCustomer = $("#cash-refund-customer");
const cashRefundTotalBalance = $("#cash-refund-total-balance");
const cashRefundAvailable = $("#cash-refund-available");
const cashRefundDivini = $("#cash-refund-divini");
const cashRefundAmount = $("#cash-refund-amount");
const cashRefundDiviniPreview = $("#cash-refund-divini-preview");
const cashRefundAfter = $("#cash-refund-after");
const cashRefundNote = $("#cash-refund-note");
const cashRefundMessage = $("#cash-refund-message");

const freeTicketModal = $("#free-ticket-modal");
const freeTicketInitials = $("#free-ticket-initials");
const freeTicketCustomer = $("#free-ticket-customer");
const freeTicketPresetsContainer = $("#free-ticket-presets");
const freeTicketNote = $("#free-ticket-note");
const freeTicketMessage = $("#free-ticket-message");
const confirmFreeTicketButton = $("#confirm-free-ticket");

const configuredCashiers = $("#configured-cashiers");
const configuredStands = $("#configured-stands");
const activeStaff = $("#active-staff");
const activeAdmins = $("#active-admins");
const staffList = $("#staff-list");
const staffMessage = $("#staff-message");
const generateStaffButton = $("#generate-staff");
const downloadCredentialsButton = $("#download-credentials");
const downloadCredentialsModalButton = $("#download-credentials-modal");
const staffProgress = $("#staff-progress");
const staffProgressLabel = $("#staff-progress-label");
const staffProgressCount = $("#staff-progress-count");
const staffProgressBar = $("#staff-progress-bar");

const transactionList = $("#transaction-list");
const exportTransactionsButton = $("#export-transactions");

const installAppQr = $("#install-app-qr");
const installAppUrl = $("#install-app-url");
const printInstallQrButton = $("#print-install-qr");

const credentialsModal = $("#credentials-modal");
const credentialsPreview = $("#credentials-preview");

let positions = [];
let currentPositionFilter = "all";
let staffRows = [];
let transactionRows = [];
let customerRows = [];
let generatedCredentials = [];
let currentBadge = null;
let selectedControlCustomer = null;
let freeTicketPresets = [];
let selectedFreeTicketPreset = null;
let manualRechargeRows = [];
let selectedManualRecharge = null;

function formatEuro(cents) {
  return new Intl.NumberFormat(APP_CONFIG.locale, {
    style: "currency",
    currency: APP_CONFIG.valuta
  }).format(Number(cents || 0) / 100);
}

function formatNumber(value) {
  return new Intl.NumberFormat(APP_CONFIG.locale).format(Number(value || 0));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat(APP_CONFIG.locale, {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
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

  if (lowered.includes("permesso negato") || lowered.includes("not authorized")) {
    return "L’account non dispone dei permessi di amministrazione.";
  }
  if (lowered.includes("email") && lowered.includes("già")) {
    return message;
  }
  if (lowered.includes("already been registered") || lowered.includes("already registered")) {
    return "Questa email è già associata a un account esistente.";
  }
  if (lowered.includes("failed to fetch")) {
    return "Connessione assente o instabile.";
  }

  return message || "Si è verificato un errore.";
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPeriod() {
  return {
    from: new Date(`${dateFrom.value}T00:00:00`).toISOString(),
    to: new Date(`${dateTo.value}T23:59:59.999`).toISOString()
  };
}

function openModal(element) {
  element.classList.remove("is-hidden");
  document.body.classList.add("modal-open");
}

function closeModal(element) {
  element.classList.add("is-hidden");

  if ($$(".payment-modal:not(.is-hidden)").length === 0) {
    document.body.classList.remove("modal-open");
  }
}

async function requireAdminSession() {
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

  if (!profile.active || profile.role !== "admin") {
    await supabaseClient.auth.signOut();
    window.location.replace("/login");
    return null;
  }

  adminName.textContent = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ");

  return { session, profile };
}

async function invokeAdminFunction(body) {
  const { data, error } = await supabaseClient.functions.invoke(
    "admin-staff",
    { body }
  );

  if (error) {
    let detail = error.message || "Errore Edge Function.";

    try {
      if (error.context && typeof error.context.json === "function") {
        const payload = await error.context.json();
        detail = payload?.error || payload?.message || detail;
      }
    } catch {
      // Mantiene il messaggio originale.
    }

    throw new Error(detail);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

function renderOverview(data, stripeSummary = {}, controlSummary = {}) {
  const totals = data?.totals || {};
  const staff = data?.staff || {};

  totalCustomers.textContent = formatNumber(totals.customers_count);
  totalLoaded.textContent = formatEuro(totals.loaded_cents);
  totalSpent.textContent = formatEuro(totals.spent_cents);
  totalRemaining.textContent = formatEuro(totals.remaining_cents);
  totalCash.textContent = formatEuro(totals.cash_cents);
  totalPos.textContent = formatEuro(totals.pos_cents);
  totalStripe.textContent = formatEuro(stripeSummary.stripe_cents);
  totalFreeTickets.textContent = formatEuro(controlSummary.free_ticket_cents);
  freeTicketCount.textContent =
    `${formatNumber(controlSummary.free_ticket_count)} operazioni`;
  totalCashRefunds.textContent =
    formatEuro(controlSummary.cash_refund_cents);
  cashRefundCount.textContent =
    `${formatNumber(controlSummary.cash_refund_count)} operazioni`;
  totalManualCorrections.textContent =
    formatEuro(controlSummary.manual_correction_net_cents);
  manualCorrectionCount.textContent =
    `${formatNumber(controlSummary.manual_correction_count)} operazioni`;

  rechargeCount.textContent = `${formatNumber(totals.recharge_count)} ricariche`;
  paymentCount.textContent = `${formatNumber(totals.payment_count)} pagamenti`;
  remainingDivini.textContent = `${formatNumber(formatDivini(totals.remaining_cents))} Divini`;

  balanceLoaded.textContent = formatEuro(totals.loaded_all_time_cents);
  balanceSpent.textContent = formatEuro(totals.spent_all_time_cents);
  balanceWallets.textContent = formatEuro(totals.remaining_cents);

  const difference =
    Number(totals.loaded_all_time_cents || 0) -
    Number(totals.spent_all_time_cents || 0) -
    Number(controlSummary.cash_refund_all_time_cents || 0) -
    Number(totals.remaining_cents || 0);

  balanceDifference.textContent = formatEuro(difference);
  balanceDifference.classList.toggle("is-alert", Math.abs(difference) > 1);

  configuredCashiers.textContent = `${formatNumber(staff.cashier_positions_configured)} / 20`;
  configuredStands.textContent = `${formatNumber(staff.stand_positions_configured)} / 15`;
  activeStaff.textContent = formatNumber(staff.active_staff);
  activeAdmins.textContent = formatNumber(staff.active_admins);
}

function renderCashierRanking(rows) {
  cashierRanking.innerHTML = rows?.length
    ? rows.map((row, index) => `
      <tr>
        <td>
          <span class="ranking-position">${index + 1}</span>
          <strong>${escapeHtml(row.name)}</strong>
          <small>${escapeHtml(row.code)}${row.responsible_name ? ` · ${escapeHtml(row.responsible_name)}` : ""}</small>
        </td>
        <td>${formatNumber(row.operations_count)}</td>
        <td>${formatEuro(row.cash_cents)}</td>
        <td>${formatEuro(row.pos_cents)}</td>
        <td><strong>${formatEuro(row.total_cents)}</strong></td>
        <td>${formatEuro(row.average_cents)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6">Nessuna cassa configurata.</td></tr>`;
}

function renderStandRanking(rows) {
  standRanking.innerHTML = rows?.length
    ? rows.map((row, index) => `
      <tr>
        <td>
          <span class="ranking-position">${index + 1}</span>
          <strong>${escapeHtml(row.name)}</strong>
          <small>${escapeHtml(row.code)}${row.responsible_name ? ` · ${escapeHtml(row.responsible_name)}` : ""}</small>
        </td>
        <td>${formatNumber(row.operations_count)}</td>
        <td>${formatNumber(row.unique_customers)}</td>
        <td>${formatNumber(formatDivini(row.total_cents))}</td>
        <td><strong>${formatEuro(row.total_cents)}</strong></td>
        <td>${formatEuro(row.average_cents)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6">Nessuno stand configurato.</td></tr>`;
}

function renderHourly(rows) {
  if (!rows?.length) {
    hourlyChart.innerHTML = `<div class="empty-state"><strong>Nessuna operazione nel periodo</strong></div>`;
    return;
  }

  const maxValue = Math.max(
    1,
    ...rows.flatMap((row) => [
      Number(row.loaded_cents || 0),
      Number(row.spent_cents || 0)
    ])
  );

  hourlyChart.innerHTML = rows.map((row) => {
    const loadedHeight = Math.max(2, Math.round((Number(row.loaded_cents || 0) / maxValue) * 100));
    const spentHeight = Math.max(2, Math.round((Number(row.spent_cents || 0) / maxValue) * 100));

    return `
      <div class="hourly-column" title="${String(row.hour).padStart(2, "0")}:00 · Caricato ${formatEuro(row.loaded_cents)} · Speso ${formatEuro(row.spent_cents)}">
        <div class="hourly-bars">
          <span class="hourly-bar hourly-bar--loaded" style="height:${loadedHeight}%"></span>
          <span class="hourly-bar hourly-bar--spent" style="height:${spentHeight}%"></span>
        </div>
        <small>${String(row.hour).padStart(2, "0")}</small>
      </div>
    `;
  }).join("");
}

async function loadDashboard() {
  clearMessage(adminMessage);
  const period = getPeriod();

  const [
    dashboardResult,
    stripeResult,
    controlResult
  ] = await Promise.all([
    supabaseClient.rpc("admin_get_dashboard", {
      p_from: period.from,
      p_to: period.to
    }),
    supabaseClient.rpc("admin_stripe_summary", {
      p_from: period.from,
      p_to: period.to
    }),
    supabaseClient.rpc("admin_control_summary", {
      p_from: period.from,
      p_to: period.to
    })
  ]);

  if (dashboardResult.error) {
    showMessage(
      adminMessage,
      readableError(dashboardResult.error),
      "error"
    );
    return;
  }

  if (stripeResult.error) {
    console.error("Errore riepilogo Stripe:", stripeResult.error);
  }

  const data = dashboardResult.data;
  renderOverview(data, stripeResult.data || {}, controlResult.data || {});
  renderCashierRanking(data.cashiers || []);
  renderStandRanking(data.stands || []);
  renderHourly(data.hourly || []);
}

function positionTypeLabel(type) {
  return type === "cassa" ? "Cassa" : "Stand";
}

function renderPositions() {
  const filtered = currentPositionFilter === "all"
    ? positions
    : positions.filter((row) => row.position_type === currentPositionFilter);

  positionList.innerHTML = filtered.length
    ? filtered.map((row) => `
      <tr>
        <td><strong>${escapeHtml(row.code)}</strong></td>
        <td>${escapeHtml(row.name)}</td>
        <td>
          <strong>${escapeHtml(row.responsible_name || "Non indicato")}</strong>
          <small>
            ${row.operator_access_code
              ? `Accesso: ${escapeHtml(row.operator_access_code)}`
              : "Nessun accesso diretto"}
          </small>
        </td>
        <td>${escapeHtml(positionTypeLabel(row.position_type))}</td>
        <td>
          <span class="status-pill ${row.active ? "is-active" : "is-disabled"}">
            ${row.active ? "Attiva" : "Disattivata"}
          </span>
        </td>
        <td>
          <button class="table-action" type="button" data-edit-position="${escapeHtml(row.position_type)}:${escapeHtml(row.code)}">
            Modifica
          </button>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="6">Nessuna postazione.</td></tr>`;

  $$("[data-edit-position]").forEach((button) => {
    button.addEventListener("click", () => {
      const [type, code] = button.dataset.editPosition.split(":");
      const row = positions.find(
        (item) => item.position_type === type && item.code === code
      );

      if (row) openPositionModal(row);
    });
  });
}

async function loadPositions() {
  const { data, error } = await supabaseClient.rpc("admin_list_positions");

  if (error) {
    positionList.innerHTML = `<tr><td colspan="6">Impossibile caricare le postazioni.</td></tr>`;
    return;
  }

  positions = data || [];
  renderPositions();
}

positionFilters.forEach((button) => {
  button.addEventListener("click", () => {
    currentPositionFilter = button.dataset.positionFilter;
    positionFilters.forEach((item) => item.classList.toggle("is-active", item === button));
    renderPositions();
  });
});

function openPositionModal(row) {
  clearMessage(positionModalMessage);
  positionTypeInput.value = row.position_type;
  positionCodeInput.value = row.code;
  positionCodeView.value = row.code;
  positionNameInput.value = row.name;
  positionResponsibleInput.value = row.responsible_name || "";

  positionCreateOperator.checked = false;
  positionOperatorFields.classList.add("is-hidden");
  positionOperatorFirstName.value = "";
  positionOperatorLastName.value = "";
  positionAccessCode.value = "";
  positionOperatorPassword.value = "";

  if (row.primary_operator_id) {
    positionCurrentOperator.textContent =
      `${row.operator_first_name || ""} ${row.operator_last_name || ""}`.trim();
    positionCurrentLogin.textContent = row.operator_access_code
      ? `Codice accesso: ${row.operator_access_code}`
      : row.operator_email || "Accesso non disponibile";
  } else {
    positionCurrentOperator.textContent =
      "Nessun profilo responsabile associato";
    positionCurrentLogin.textContent = "—";
  }

  openModal(positionModal);
}


positionCreateOperator?.addEventListener("change", () => {
  positionOperatorFields.classList.toggle(
    "is-hidden",
    !positionCreateOperator.checked
  );

  if (positionCreateOperator.checked) {
    setTimeout(() => positionOperatorFirstName.focus(), 50);
  }
});

document.querySelector("[data-position-password-toggle]")
  ?.addEventListener("click", (event) => {
    const reveal = positionOperatorPassword.type === "password";
    positionOperatorPassword.type = reveal ? "text" : "password";
    event.currentTarget.textContent = reveal ? "Nascondi" : "Mostra";
  });

function normalizeOperatorAccessCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "");
}

$$("[data-close-position]").forEach((element) => {
  element.addEventListener("click", () => closeModal(positionModal));
});

positionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(positionModalMessage);

  const submitButton =
    positionForm.querySelector('button[type="submit"]');

  const createOperator = positionCreateOperator.checked;
  const firstName = positionOperatorFirstName.value.trim();
  const lastName = positionOperatorLastName.value.trim();
  const accessCode = normalizeOperatorAccessCode(
    positionAccessCode.value
  );
  const password = positionOperatorPassword.value;

  if (createOperator) {
    if (!firstName || !lastName || !accessCode) {
      showMessage(
        positionModalMessage,
        "Per creare l’accesso inserisci nome, cognome e codice accesso.",
        "error"
      );
      return;
    }

    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(accessCode)) {
      showMessage(
        positionModalMessage,
        "Il codice accesso deve contenere 3–40 caratteri: lettere minuscole, numeri, punto, trattino o underscore.",
        "error"
      );
      return;
    }

    if (password && password.length < 8) {
      showMessage(
        positionModalMessage,
        "La password scelta deve contenere almeno 8 caratteri.",
        "error"
      );
      return;
    }

    const currentRow = positions.find(
      (row) =>
        row.position_type === positionTypeInput.value &&
        row.code === positionCodeInput.value
    );

    if (currentRow?.primary_operator_id) {
      const confirmed = window.confirm(
        `La postazione ha già un responsabile operativo. Creando il nuovo accesso, il precedente verrà disattivato. Continuare?`
      );

      if (!confirmed) return;
    }
  }

  setButtonLoading(submitButton, true, "Salvataggio…");

  const { error } = await supabaseClient.rpc(
    "admin_update_position",
    {
      p_position_type: positionTypeInput.value,
      p_code: positionCodeInput.value,
      p_name: positionNameInput.value.trim(),
      p_responsible_name:
        positionResponsibleInput.value.trim() || null
    }
  );

  if (error) {
    setButtonLoading(submitButton, false);
    showMessage(
      positionModalMessage,
      readableError(error),
      "error"
    );
    return;
  }

  try {
    if (createOperator) {
      const result = await invokeAdminFunction({
        action: "create_position_operator",
        type: positionTypeInput.value,
        code: positionCodeInput.value,
        first_name: firstName,
        last_name: lastName,
        access_code: accessCode,
        password: password || null
      });

      generatedCredentials = [{
        position_name: result.position_name,
        email: result.email,
        access_code: result.access_code,
        password: result.password,
        role: result.role
      }];

      renderCredentials(generatedCredentials);
      downloadCredentialsButton.disabled = false;
      downloadCredentialsModalButton.disabled = false;
      openModal(credentialsModal);
    }

    closeModal(positionModal);
    showMessage(
      positionsMessage,
      createOperator
        ? "Postazione aggiornata e nuovo responsabile operativo creato."
        : "Postazione aggiornata.",
      "success"
    );

    await Promise.all([
      loadPositions(),
      loadStaff(),
      loadDashboard()
    ]);
  } catch (operatorError) {
    showMessage(
      positionModalMessage,
      readableError(operatorError),
      "error"
    );
  } finally {
    setButtonLoading(submitButton, false);
  }
});

function customerSourceLabel(source) {
  return source === "badge" ? "Badge / accoglienza" : "Registrazione";
}

function renderCustomers(rows) {
  customerList.innerHTML = rows.length
    ? rows.map((row) => `
      <tr>
        <td>
          <strong>${escapeHtml(row.first_name)} ${escapeHtml(row.last_name)}</strong>
          <small>Creato ${escapeHtml(formatDateTime(row.created_at))}</small>
        </td>
        <td>
          <span class="role-chip ${row.customer_source === "badge" ? "role-chip--stand" : "role-chip--cassa"}">
            ${escapeHtml(customerSourceLabel(row.customer_source))}
          </span>
        </td>
        <td>
          <strong>${escapeHtml(row.contact_email || "Nessuna email")}</strong>
          <small>${escapeHtml(row.auth_email)}</small>
        </td>
        <td>
          <strong>${formatEuro(row.balance_cents)}</strong>
          <small>${formatNumber(formatDivini(row.balance_cents))} Divini</small>
          <small class="cash-refundable">
            Contanti rimborsabili: ${formatEuro(row.refundable_cash_cents)}
          </small>
        </td>
        <td>
          <strong>${escapeHtml(row.badge_code || "—")}</strong>
          <small>${escapeHtml(row.qr_token)}</small>
        </td>
        <td>
          <span class="status-pill ${row.active && !row.blocked ? "is-active" : "is-disabled"}">
            ${!row.active ? "Disattivato" : row.blocked ? "Bloccato" : "Attivo"}
          </span>
        </td>
        <td>
          <div class="staff-row-actions">
            <button class="table-action" type="button" data-customer-action="qr" data-id="${escapeHtml(row.user_id)}">
              QR / Badge
            </button>
            <button class="table-action" type="button" data-customer-action="password" data-id="${escapeHtml(row.user_id)}">
              Nuova password
            </button>
            <button class="table-action" type="button" data-customer-action="correct-recharge" data-id="${escapeHtml(row.user_id)}" ${row.deleted_at ? "disabled" : ""}>
              Correggi ricarica
            </button>
            <button class="table-action" type="button" data-customer-action="refund" data-id="${escapeHtml(row.user_id)}" ${Number(row.refundable_cash_cents || 0) < 200 || row.deleted_at ? "disabled" : ""}>
              Rimborso contanti
            </button>
            <button class="table-action" type="button" data-customer-action="gift" data-id="${escapeHtml(row.user_id)}" ${row.deleted_at ? "disabled" : ""}>
              Ticket gratuito
            </button>
            <button class="table-action" type="button" data-customer-action="block" data-id="${escapeHtml(row.user_id)}" data-blocked="${row.blocked}" ${row.deleted_at ? "disabled" : ""}>
              ${row.blocked ? "Sblocca" : "Blocca"}
            </button>
            <button class="table-action table-action--danger" type="button" data-customer-action="delete" data-id="${escapeHtml(row.user_id)}">
              ${row.deleted_at ? "Eliminato" : "Elimina"}
            </button>
          </div>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">Nessun cliente trovato.</td></tr>`;

  $$("[data-customer-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = customerRows.find((item) => item.user_id === button.dataset.id);
      if (!row) return;

      if (button.dataset.customerAction === "qr") {
        showBadge(row);
      } else if (button.dataset.customerAction === "password") {
        await resetPassword(row.user_id, row.auth_email, button, true);
      } else if (button.dataset.customerAction === "correct-recharge") {
        await openRechargeCorrectionModal(row);
      } else if (button.dataset.customerAction === "refund") {
        openCashRefundModal(row);
      } else if (button.dataset.customerAction === "gift") {
        openFreeTicketModal(row);
      } else if (button.dataset.customerAction === "block") {
        await toggleWallet(row, button);
      } else if (button.dataset.customerAction === "delete") {
        await deleteCustomer(row, button);
      }
    });
  });
}

async function loadCustomers(query = "") {
  const { data, error } = await supabaseClient.rpc("admin_list_customers", {
    p_query: query.trim() || null,
    p_limit: 200
  });

  if (error) {
    customerList.innerHTML = `<tr><td colspan="7">Impossibile caricare i clienti.</td></tr>`;
    showMessage(customersMessage, readableError(error), "error");
    return;
  }

  customerRows = data || [];
  renderCustomers(customerRows);
}

customerSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(customersMessage);
  await loadCustomers(customerQuery.value);
});

clearCustomerSearchButton.addEventListener("click", async () => {
  customerQuery.value = "";
  await loadCustomers("");
});

createCustomerButton.addEventListener("click", () => {
  createCustomerForm.reset();
  clearMessage(customerModalMessage);
  openModal(customerModal);
  setTimeout(() => $("#new-customer-first-name").focus(), 50);
});

$$("[data-close-customer]").forEach((element) => {
  element.addEventListener("click", () => closeModal(customerModal));
});

createCustomerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(customerModalMessage);

  const formData = new FormData(createCustomerForm);
  const submitButton = createCustomerForm.querySelector('button[type="submit"]');

  setButtonLoading(submitButton, true, "Creazione…");

  try {
    const result = await invokeAdminFunction({
      action: "create_customer",
      first_name: String(formData.get("first_name") || "").trim(),
      last_name: String(formData.get("last_name") || "").trim(),
      email: String(formData.get("email") || "").trim().toLowerCase() || null
    });

    closeModal(customerModal);
    currentBadge = result.customer;
    showBadge(result.customer);
    showMessage(customersMessage, "Cliente e portafoglio creati correttamente.", "success");
    await Promise.all([loadCustomers(customerQuery.value), loadDashboard()]);
  } catch (error) {
    showMessage(customerModalMessage, readableError(error), "error");
  } finally {
    setButtonLoading(submitButton, false);
  }
});

function showBadge(row) {
  currentBadge = row;
  badgeCustomerName.textContent = `${row.first_name} ${row.last_name}`;
  badgeCode.textContent = row.badge_code || "—";
  badgeSource.textContent = customerSourceLabel(row.customer_source);
  badgeLoginEmail.textContent = row.contact_email || row.auth_email || "Badge senza email";
  badgePassword.textContent = row.password || "Non recuperabile: usa “Nuova password”";
  badgeToken.textContent = row.qr_token;

  badgeQr.innerHTML = "";
  new window.QRCode(badgeQr, {
    text: `INDIVINO:${row.qr_token}`,
    width: 220,
    height: 220,
    colorDark: "#241b1d",
    colorLight: "#ffffff",
    correctLevel: window.QRCode.CorrectLevel.H
  });

  openModal(badgeModal);
}

$$("[data-close-badge]").forEach((element) => {
  element.addEventListener("click", () => closeModal(badgeModal));
});

printBadgeButton.addEventListener("click", () => {
  const canvas = badgeQr.querySelector("canvas");
  const image = badgeQr.querySelector("img");
  const qrData = canvas?.toDataURL("image/png") || image?.src;

  if (!currentBadge || !qrData) {
    showMessage(customersMessage, "QR non ancora pronto per la stampa.", "error");
    return;
  }

  const printWindow = window.open("", "_blank", "width=520,height=760");

  if (!printWindow) {
    showMessage(customersMessage, "Il browser ha bloccato la finestra di stampa.", "error");
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="it">
    <head>
      <meta charset="utf-8">
      <title>Badge ${escapeHtml(currentBadge.badge_code)}</title>
      <style>
        @page { size: A6 portrait; margin: 8mm; }
        body { margin: 0; font-family: Arial, sans-serif; color: #2b171b; }
        .badge { border: 2px solid #641426; border-radius: 22px; padding: 24px; text-align: center; }
        .brand { color: #641426; font-size: 24px; font-weight: 900; }
        .subtitle { margin-top: 4px; color: #9a7b64; letter-spacing: 2px; }
        h1 { margin: 24px 0 14px; font-size: 26px; }
        img { width: 230px; height: 230px; }
        .code { margin-top: 16px; font-size: 22px; font-weight: 900; letter-spacing: 1px; }
        p { margin: 18px 0 0; color: #5f5557; font-size: 13px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <article class="badge">
        <div class="brand">INDIVINO 2026</div>
        <div class="subtitle">I DIVINI DIGITALI</div>
        <h1>${escapeHtml(currentBadge.first_name)} ${escapeHtml(currentBadge.last_name)}</h1>
        <img src="${qrData}" alt="QR">
        <div class="code">${escapeHtml(currentBadge.badge_code || "")}</div>
        <p>Mostrare questo QR agli stand. In caso di smarrimento rivolgersi alla cassa.</p>
      </article>
      <script>
        window.onload = () => {
          window.print();
          window.onafterprint = () => window.close();
        };
      <\/script>
    </body>
    </html>
  `);

  printWindow.document.close();
});

async function toggleWallet(row, button) {
  setButtonLoading(button, true, "…");

  const { error } = await supabaseClient.rpc("admin_set_wallet_blocked", {
    p_user_id: row.user_id,
    p_blocked: !row.blocked
  });

  setButtonLoading(button, false);

  if (error) {
    showMessage(customersMessage, readableError(error), "error");
    return;
  }

  showMessage(
    customersMessage,
    row.blocked ? "Portafoglio sbloccato." : "Portafoglio bloccato.",
    "success"
  );

  await loadCustomers(customerQuery.value);
}


function initialsForCustomer(row) {
  return `${String(row.first_name || "").slice(0, 1)}${String(row.last_name || "").slice(0, 1)}`.toUpperCase() || "ID";
}


function paymentMethodLabel(method) {
  return {
    contanti: "Contanti",
    pos: "POS",
    stripe: "Stripe",
    omaggio: "Omaggio"
  }[method] || method || "—";
}

async function openRechargeCorrectionModal(row) {
  selectedControlCustomer = row;
  selectedManualRecharge = null;
  manualRechargeRows = [];
  rechargeCorrectionForm.classList.add("is-hidden");
  clearMessage(rechargeCorrectionMessage);

  rechargeCorrectionInitials.textContent =
    initialsForCustomer(row);
  rechargeCorrectionCustomer.textContent =
    `${row.first_name} ${row.last_name}`;

  manualRechargeList.innerHTML = `
    <div class="empty-state">
      <strong>Caricamento ricariche…</strong>
    </div>
  `;

  openModal(rechargeCorrectionModal);

  const { data, error } = await supabaseClient.rpc(
    "admin_list_manual_recharges",
    {
      p_user_id: row.user_id,
      p_limit: 50
    }
  );

  if (error) {
    manualRechargeList.innerHTML = `
      <div class="empty-state">
        <strong>Impossibile caricare le ricariche</strong>
        <span>${escapeHtml(readableError(error))}</span>
      </div>
    `;
    return;
  }

  manualRechargeRows = data || [];
  renderManualRechargeList();
}

function renderManualRechargeList() {
  manualRechargeList.innerHTML = manualRechargeRows.length
    ? manualRechargeRows.map((row) => `
      <button
        class="manual-recharge-item"
        type="button"
        data-manual-recharge-id="${escapeHtml(row.transaction_id)}"
      >
        <div>
          <strong>${escapeHtml(formatDateTime(row.created_at))}</strong>
          <span>
            ${escapeHtml(row.position_name || "Cassa")}
            ${row.position_code ? ` · ${escapeHtml(row.position_code)}` : ""}
          </span>
          <small>
            Operatore: ${escapeHtml(row.operator_label || "—")}
          </small>
        </div>
        <div>
          <span class="method-pill method-pill--${escapeHtml(row.payment_method)}">
            ${escapeHtml(paymentMethodLabel(row.payment_method))}
          </span>
          <strong>${formatEuro(row.current_recorded_amount_cents)}</strong>
          <small>
            Iniziale ${formatEuro(row.original_amount_cents)}
            ${Number(row.correction_count || 0) > 0
              ? ` · ${formatNumber(row.correction_count)} correzioni`
              : ""}
          </small>
        </div>
      </button>
    `).join("")
    : `
      <div class="empty-state">
        <strong>Nessuna ricarica manuale correggibile</strong>
        <span>Le ricariche Stripe e i ticket gratuiti non possono essere modificati da questa funzione.</span>
      </div>
    `;

  $$("[data-manual-recharge-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const row = manualRechargeRows.find(
        (item) =>
          item.transaction_id ===
          button.dataset.manualRechargeId
      );

      if (!row) return;
      selectManualRecharge(row, button);
    });
  });
}

function selectManualRecharge(row, selectedButton) {
  selectedManualRecharge = row;
  clearMessage(rechargeCorrectionMessage);

  $$("[data-manual-recharge-id]").forEach((button) => {
    button.classList.toggle(
      "is-active",
      button === selectedButton
    );
  });

  correctionSelectedDate.textContent =
    formatDateTime(row.created_at);
  correctionSelectedPosition.textContent =
    `${row.position_name || "Cassa"}${row.position_code ? ` · ${row.position_code}` : ""}`;
  correctionSelectedMethod.textContent =
    paymentMethodLabel(row.payment_method);
  correctionOriginalAmount.textContent =
    formatEuro(row.original_amount_cents);
  correctionCurrentAmount.textContent =
    formatEuro(row.current_recorded_amount_cents);
  correctionReducibleAmount.textContent =
    formatEuro(row.reducible_credit_cents);

  correctionCorrectTotal.value =
    Number(row.current_recorded_amount_cents || 0) / 100;
  correctionReason.value = "";
  rechargeCorrectionForm.classList.remove("is-hidden");
  updateRechargeCorrectionPreview();

  setTimeout(() => correctionCorrectTotal.focus(), 50);
}

function updateRechargeCorrectionPreview() {
  if (!selectedManualRecharge || !selectedControlCustomer) {
    correctionDelta.textContent = "0,00 €";
    correctionBalanceAfter.textContent = "—";
    return;
  }

  const correctTotalCents =
    Math.round(Number(correctionCorrectTotal.value || 0) * 100);
  const currentAmount =
    Number(selectedManualRecharge.current_recorded_amount_cents || 0);
  const delta = correctTotalCents - currentAmount;
  const balanceAfter =
    Number(selectedControlCustomer.balance_cents || 0) + delta;

  correctionDelta.textContent =
    `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${formatEuro(Math.abs(delta))}`;
  correctionDelta.classList.toggle("amount-positive", delta > 0);
  correctionDelta.classList.toggle("amount-negative", delta < 0);
  correctionBalanceAfter.textContent = formatEuro(balanceAfter);

  const excessiveReduction =
    delta < 0 &&
    Math.abs(delta) >
      Number(selectedManualRecharge.reducible_credit_cents || 0);

  correctionReducibleAmount.classList.toggle(
    "is-alert",
    excessiveReduction
  );
}

correctionCorrectTotal?.addEventListener(
  "input",
  updateRechargeCorrectionPreview
);

$$("[data-close-recharge-correction]").forEach((element) => {
  element.addEventListener("click", () => {
    closeModal(rechargeCorrectionModal);
  });
});

rechargeCorrectionForm?.addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();
    clearMessage(rechargeCorrectionMessage);

    if (!selectedManualRecharge ||
        !selectedControlCustomer) {
      return;
    }

    const euroValue = Number(correctionCorrectTotal.value);
    const correctedTotalCents = Math.round(euroValue * 100);
    const currentAmount =
      Number(selectedManualRecharge.current_recorded_amount_cents || 0);
    const delta = correctedTotalCents - currentAmount;
    const reducible =
      Number(selectedManualRecharge.reducible_credit_cents || 0);

    if (
      !Number.isFinite(euroValue) ||
      correctedTotalCents < 0 ||
      correctedTotalCents > 50000 ||
      correctedTotalCents % APP_CONFIG.valoreDivinoCentesimi !== 0
    ) {
      showMessage(
        rechargeCorrectionMessage,
        "Inserisci un importo da 0 € a 500 €, multiplo di 2 €.",
        "error"
      );
      return;
    }

    if (delta === 0) {
      showMessage(
        rechargeCorrectionMessage,
        "L’importo inserito è già quello registrato.",
        "error"
      );
      return;
    }

    if (delta < 0 && Math.abs(delta) > reducible) {
      showMessage(
        rechargeCorrectionMessage,
        `Una parte del credito è già stata utilizzata. Puoi sottrarre al massimo ${formatEuro(reducible)} da questa ricarica.`,
        "error"
      );
      return;
    }

    if (!correctionReason.value.trim()) {
      showMessage(
        rechargeCorrectionMessage,
        "Inserisci la motivazione della correzione.",
        "error"
      );
      return;
    }

    const actionText = delta < 0
      ? `sottrarre ${formatEuro(Math.abs(delta))}`
      : `aggiungere ${formatEuro(delta)}`;

    const confirmed = window.confirm(
      `Confermi di ${actionText} al saldo di ${selectedControlCustomer.first_name} ${selectedControlCustomer.last_name}?\n\nLa ricarica originale resterà nello storico e verrà creato un nuovo movimento di correzione.`
    );

    if (!confirmed) return;

    const submitButton =
      rechargeCorrectionForm.querySelector(
        'button[type="submit"]'
      );

    setButtonLoading(
      submitButton,
      true,
      "Registrazione…"
    );

    const { data, error } = await supabaseClient.rpc(
      "admin_correct_manual_recharge",
      {
        p_original_transaction_id:
          selectedManualRecharge.transaction_id,
        p_corrected_total_cents:
          correctedTotalCents,
        p_idempotency_key:
          crypto.randomUUID(),
        p_reason:
          correctionReason.value.trim()
      }
    );

    setButtonLoading(submitButton, false);

    if (error) {
      showMessage(
        rechargeCorrectionMessage,
        readableError(error),
        "error"
      );
      return;
    }

    closeModal(rechargeCorrectionModal);

    const signedDelta =
      Number(data.signed_delta_cents || 0);

    showMessage(
      customersMessage,
      `Correzione registrata: ${signedDelta < 0 ? "sottratti" : "aggiunti"} ${formatEuro(Math.abs(signedDelta))}.`,
      "success"
    );

    await Promise.all([
      loadCustomers(customerQuery.value),
      loadDashboard(),
      loadTransactions(100)
    ]);
  }
);

function openCashRefundModal(row) {
  selectedControlCustomer = row;
  cashRefundForm.reset();
  clearMessage(cashRefundMessage);

  cashRefundInitials.textContent = initialsForCustomer(row);
  cashRefundCustomer.textContent = `${row.first_name} ${row.last_name}`;
  cashRefundTotalBalance.textContent = formatEuro(row.balance_cents);
  cashRefundAvailable.textContent =
    formatEuro(row.refundable_cash_cents);

  cashRefundDivini.max = Math.floor(
    Number(row.refundable_cash_cents || 0) /
    APP_CONFIG.valoreDivinoCentesimi
  );

  updateCashRefundPreview();
  openModal(cashRefundModal);
  setTimeout(() => cashRefundDivini.focus(), 50);
}

function updateCashRefundPreview() {
  const divini = Number(cashRefundDivini.value || 0);
  const amountCents =
    divini * APP_CONFIG.valoreDivinoCentesimi;
  const balance = Number(
    selectedControlCustomer?.balance_cents || 0
  );

  cashRefundAmount.textContent = formatEuro(amountCents);
  cashRefundDiviniPreview.textContent =
    `${divini} ${divini === 1 ? "Divino" : "Divini"}`;
  cashRefundAfter.textContent = selectedControlCustomer
    ? formatEuro(Math.max(balance - amountCents, 0))
    : "—";
}

cashRefundDivini?.addEventListener(
  "input",
  updateCashRefundPreview
);

$$("[data-close-cash-refund]").forEach((element) => {
  element.addEventListener("click", () => {
    closeModal(cashRefundModal);
  });
});

cashRefundForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage(cashRefundMessage);

  if (!selectedControlCustomer) return;

  const divini = Number(cashRefundDivini.value || 0);
  const amountCents =
    divini * APP_CONFIG.valoreDivinoCentesimi;
  const available = Number(
    selectedControlCustomer.refundable_cash_cents || 0
  );

  if (!Number.isInteger(divini) || divini < 1) {
    showMessage(
      cashRefundMessage,
      "Inserisci almeno 1 Divino.",
      "error"
    );
    return;
  }

  if (amountCents > available) {
    showMessage(
      cashRefundMessage,
      "L’importo supera il credito contante rimborsabile.",
      "error"
    );
    return;
  }

  if (!cashRefundNote.value.trim()) {
    showMessage(
      cashRefundMessage,
      "Inserisci la motivazione del rimborso.",
      "error"
    );
    return;
  }

  const confirmed = window.confirm(
    `Restituire ${formatEuro(amountCents)} in contanti a ${selectedControlCustomer.first_name} ${selectedControlCustomer.last_name}?`
  );

  if (!confirmed) return;

  const submitButton =
    cashRefundForm.querySelector('button[type="submit"]');

  setButtonLoading(
    submitButton,
    true,
    "Registrazione…"
  );

  const { data, error } = await supabaseClient.rpc(
    "admin_cash_refund",
    {
      p_user_id: selectedControlCustomer.user_id,
      p_amount_cents: amountCents,
      p_idempotency_key: crypto.randomUUID(),
      p_note: cashRefundNote.value.trim()
    }
  );

  setButtonLoading(submitButton, false);

  if (error) {
    showMessage(
      cashRefundMessage,
      readableError(error),
      "error"
    );
    return;
  }

  closeModal(cashRefundModal);
  showMessage(
    customersMessage,
    `Rimborso contanti di ${formatEuro(data.amount_cents)} registrato.`,
    "success"
  );

  await Promise.all([
    loadCustomers(customerQuery.value),
    loadDashboard(),
    loadTransactions(100)
  ]);
});

async function loadFreeTicketPresets() {
  const { data, error } = await supabaseClient.rpc(
    "admin_list_free_ticket_presets"
  );

  if (error) {
    freeTicketPresetsContainer.innerHTML = `
      <div class="empty-state">
        <strong>Impossibile caricare gli importi</strong>
      </div>
    `;
    return;
  }

  freeTicketPresets = data || [];
  renderFreeTicketPresets();
}

function renderFreeTicketPresets() {
  freeTicketPresetsContainer.innerHTML =
    freeTicketPresets.length
      ? freeTicketPresets.map((preset) => `
        <button
          type="button"
          class="free-ticket-preset"
          data-free-ticket-id="${escapeHtml(preset.preset_id)}"
        >
          <strong>${escapeHtml(preset.label)}</strong>
          <span>${escapeHtml(formatEuro(preset.amount_cents))}</span>
        </button>
      `).join("")
      : `
        <div class="empty-state">
          <strong>Nessun importo configurato</strong>
        </div>
      `;

  $$("[data-free-ticket-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedFreeTicketPreset = freeTicketPresets.find(
        (preset) =>
          preset.preset_id === button.dataset.freeTicketId
      );

      $$("[data-free-ticket-id]").forEach((item) => {
        item.classList.toggle(
          "is-active",
          item === button
        );
      });

      confirmFreeTicketButton.disabled =
        !selectedFreeTicketPreset;
      clearMessage(freeTicketMessage);
    });
  });
}

async function openFreeTicketModal(row) {
  selectedControlCustomer = row;
  selectedFreeTicketPreset = null;
  freeTicketNote.value = "";
  confirmFreeTicketButton.disabled = true;
  clearMessage(freeTicketMessage);

  freeTicketInitials.textContent = initialsForCustomer(row);
  freeTicketCustomer.textContent =
    `${row.first_name} ${row.last_name}`;

  openModal(freeTicketModal);
  await loadFreeTicketPresets();
}

$$("[data-close-free-ticket]").forEach((element) => {
  element.addEventListener("click", () => {
    closeModal(freeTicketModal);
  });
});

confirmFreeTicketButton?.addEventListener(
  "click",
  async () => {
    clearMessage(freeTicketMessage);

    if (!selectedControlCustomer ||
        !selectedFreeTicketPreset) {
      showMessage(
        freeTicketMessage,
        "Seleziona un importo.",
        "error"
      );
      return;
    }

    const confirmed = window.confirm(
      `Assegnare gratuitamente ${selectedFreeTicketPreset.label} a ${selectedControlCustomer.first_name} ${selectedControlCustomer.last_name}?`
    );

    if (!confirmed) return;

    setButtonLoading(
      confirmFreeTicketButton,
      true,
      "Assegnazione…"
    );

    const { data, error } = await supabaseClient.rpc(
      "admin_grant_free_ticket",
      {
        p_user_id: selectedControlCustomer.user_id,
        p_preset_id: selectedFreeTicketPreset.preset_id,
        p_idempotency_key: crypto.randomUUID(),
        p_note: freeTicketNote.value.trim() || null
      }
    );

    setButtonLoading(
      confirmFreeTicketButton,
      false
    );

    if (error) {
      showMessage(
        freeTicketMessage,
        readableError(error),
        "error"
      );
      return;
    }

    closeModal(freeTicketModal);
    showMessage(
      customersMessage,
      `Ticket gratuito di ${formatEuro(data.amount_cents)} assegnato.`,
      "success"
    );

    await Promise.all([
      loadCustomers(customerQuery.value),
      loadDashboard(),
      loadTransactions(100)
    ]);
  }
);

async function deleteCustomer(row, button) {
  if (row.deleted_at) {
    showMessage(
      customersMessage,
      "Questo cliente è già stato eliminato e anonimizzato.",
      "info"
    );
    return;
  }

  if (Number(row.balance_cents || 0) !== 0) {
    showMessage(
      customersMessage,
      "Prima di eliminare il cliente il saldo deve essere portato a zero.",
      "error"
    );
    return;
  }

  const explanation = row.can_hard_delete
    ? "L’account non ha movimenti e sarà eliminato definitivamente."
    : "L’account ha movimenti contabili: i dati personali saranno anonimizzati, ma lo storico economico resterà disponibile.";

  const confirmed = window.confirm(
    `Eliminare ${row.first_name} ${row.last_name}?\n\n${explanation}`
  );

  if (!confirmed) return;

  setButtonLoading(button, true, "…");

  try {
    const result = await invokeAdminFunction({
      action: "delete_customer",
      user_id: row.user_id
    });

    showMessage(
      customersMessage,
      result.mode === "deleted"
        ? "Cliente eliminato definitivamente."
        : "Cliente disattivato e anonimizzato; storico contabile conservato.",
      "success"
    );

    await Promise.all([
      loadCustomers(customerQuery.value),
      loadDashboard(),
      loadTransactions(100)
    ]);
  } catch (error) {
    showMessage(
      customersMessage,
      readableError(error),
      "error"
    );
  } finally {
    setButtonLoading(button, false);
  }
}

function roleLabel(role) {
  return {
    admin: "Amministratore",
    cassa: "Cassa",
    stand: "Stand",
    cliente: "Cliente"
  }[role] || role;
}

function renderStaff(rows) {
  staffList.innerHTML = rows?.length
    ? rows.map((row) => {
      const position = row.position_name
        ? `${row.position_name} (${row.position_code})`
        : "Non assegnata";

      return `
        <tr>
          <td>
            <strong>${escapeHtml(row.first_name)} ${escapeHtml(row.last_name)}</strong>
            <small>${escapeHtml(row.id)}</small>
          </td>
          <td>${escapeHtml(row.email)}</td>
          <td><span class="role-chip role-chip--${escapeHtml(row.role)}">${escapeHtml(roleLabel(row.role))}</span></td>
          <td>${escapeHtml(position)}</td>
          <td>
            <span class="status-pill ${row.active ? "is-active" : "is-disabled"}">
              ${row.active ? "Attivo" : "Disattivato"}
            </span>
          </td>
          <td>
            <div class="staff-row-actions">
              ${row.role !== "admin" ? `
                <button class="table-action" type="button" data-staff-action="toggle" data-id="${escapeHtml(row.id)}" data-active="${row.active}">
                  ${row.active ? "Disattiva" : "Riattiva"}
                </button>
              ` : ""}
              <button class="table-action" type="button" data-staff-action="reset" data-id="${escapeHtml(row.id)}" data-email="${escapeHtml(row.email)}">
                Nuova password
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("")
    : `<tr><td colspan="6">Nessun operatore disponibile.</td></tr>`;

  $$("[data-staff-action='toggle']").forEach((button) => {
    button.addEventListener("click", async () => {
      await toggleStaff(
        button.dataset.id,
        button.dataset.active !== "true",
        button
      );
    });
  });

  $$("[data-staff-action='reset']").forEach((button) => {
    button.addEventListener("click", async () => {
      await resetPassword(
        button.dataset.id,
        button.dataset.email,
        button,
        false
      );
    });
  });
}

async function loadStaff() {
  const { data, error } = await supabaseClient.rpc("admin_list_staff");

  if (error) {
    staffList.innerHTML = `<tr><td colspan="6">Impossibile caricare gli operatori.</td></tr>`;
    return;
  }

  staffRows = data || [];
  renderStaff(staffRows);
}

async function toggleStaff(userId, active, button) {
  setButtonLoading(button, true, "…");

  const { error } = await supabaseClient.rpc("admin_set_staff_active", {
    p_user_id: userId,
    p_active: active
  });

  setButtonLoading(button, false);

  if (error) {
    showMessage(staffMessage, readableError(error), "error");
    return;
  }

  showMessage(
    staffMessage,
    active ? "Operatore riattivato." : "Operatore disattivato.",
    "success"
  );

  await refreshAll();
}

async function resetPassword(userId, email, button, customer) {
  const confirmed = window.confirm(
    `Generare una nuova password temporanea per ${email}? La password precedente smetterà di funzionare.`
  );

  if (!confirmed) return;

  setButtonLoading(button, true, "…");

  try {
    const result = await invokeAdminFunction({
      action: "reset_password",
      user_id: userId
    });

    if (customer) {
      const row = customerRows.find((item) => item.user_id === userId);
      if (row) {
        showBadge({ ...row, password: result.password });
      }
      showMessage(customersMessage, "Password temporanea generata.", "success");
    } else {
      generatedCredentials = [{
        position_name: result.position_name || "Operatore",
        email: result.email,
        password: result.password,
        role: result.role
      }];

      renderCredentials(generatedCredentials);
      downloadCredentialsButton.disabled = false;
      downloadCredentialsModalButton.disabled = false;
      openModal(credentialsModal);
      showMessage(staffMessage, "Password temporanea generata.", "success");
    }
  } catch (error) {
    showMessage(customer ? customersMessage : staffMessage, readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function renderCredentials(rows) {
  const created = rows.filter((row) => row.password);

  credentialsPreview.innerHTML = created.length
    ? created.slice(0, 20).map((row) => `
        <div class="credential-row">
          <div>
            <strong>${escapeHtml(row.position_name)}</strong>
            <span>
              ${row.access_code
                ? `Codice accesso: ${escapeHtml(row.access_code)}`
                : escapeHtml(row.email)}
            </span>
          </div>
          <code>${escapeHtml(row.password)}</code>
        </div>
      `).join("") + (created.length > 20
        ? `<p class="field-help">Altri ${created.length - 20} profili sono inclusi nel CSV.</p>`
        : "")
    : `<div class="empty-state"><strong>Nessun nuovo account creato</strong></div>`;
}

function staffTargets() {
  const targets = [];

  for (let number = 2; number <= 20; number += 1) {
    targets.push({ type: "cassa", number, label: `Cassa ${String(number).padStart(2, "0")}` });
  }

  for (let number = 1; number <= 15; number += 1) {
    targets.push({ type: "stand", number, label: `Stand ${String(number).padStart(2, "0")}` });
  }

  return targets;
}

generateStaffButton.addEventListener("click", async () => {
  clearMessage(staffMessage);

  const confirmed = window.confirm(
    "Creare o completare i profili mancanti per Cassa 02–20 e Stand 01–15?"
  );

  if (!confirmed) return;

  const targets = staffTargets();
  generatedCredentials = [];
  const failures = [];

  setButtonLoading(generateStaffButton, true, "Generazione in corso…");
  staffProgress.classList.remove("is-hidden");
  staffProgressBar.max = targets.length;
  staffProgressBar.value = 0;

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    staffProgressLabel.textContent = `Controllo ${target.label}`;
    staffProgressCount.textContent = `${index + 1} / ${targets.length}`;
    staffProgressBar.value = index + 1;

    try {
      const result = await invokeAdminFunction({
        action: "ensure_operator",
        type: target.type,
        number: target.number
      });

      if (result.password) {
        generatedCredentials.push(result);
      }
    } catch (error) {
      failures.push(`${target.label}: ${readableError(error)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  setButtonLoading(generateStaffButton, false);
  staffProgressLabel.textContent = "Operazione completata";

  downloadCredentialsButton.disabled = generatedCredentials.length === 0;
  downloadCredentialsModalButton.disabled = generatedCredentials.length === 0;

  if (generatedCredentials.length) {
    renderCredentials(generatedCredentials);
    openModal(credentialsModal);
  }

  if (failures.length) {
    showMessage(
      staffMessage,
      `Creati ${generatedCredentials.length} profili. Errori: ${failures.slice(0, 3).join(" | ")}`,
      "error"
    );
  } else {
    showMessage(
      staffMessage,
      `${generatedCredentials.length} nuovi profili creati. Gli altri risultavano già presenti.`,
      "success"
    );
  }

  await refreshAll();
});

$$("[data-close-credentials]").forEach((element) => {
  element.addEventListener("click", () => closeModal(credentialsModal));
});

function csvEscape(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(";")).join("\n");
  const blob = new Blob(["\ufeff", csv], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadCredentials() {
  if (!generatedCredentials.length) return;

  downloadCsv("indivino-credenziali-operatori.csv", [
    ["Postazione", "Ruolo", "Codice accesso", "Email tecnica", "Password temporanea"],
    ...generatedCredentials.map((row) => [
      row.position_name,
      roleLabel(row.role),
      row.access_code || "",
      row.email,
      row.password
    ])
  ]);
}

downloadCredentialsButton.addEventListener("click", downloadCredentials);
downloadCredentialsModalButton.addEventListener("click", downloadCredentials);

function transactionTypeLabel(row) {
  if (
    row.type === "rettifica" &&
    row.metadata?.operation === "manual_recharge_correction"
  ) {
    return "Correzione ricarica";
  }

  if (
    row.type === "storno" &&
    row.payment_method === "contanti"
  ) {
    return "Rimborso contanti";
  }

  if (
    row.type === "ricarica" &&
    row.payment_method === "omaggio"
  ) {
    return "Ticket gratuito";
  }

  return {
    ricarica: "Ricarica",
    pagamento: "Pagamento",
    storno: "Storno",
    rettifica: "Rettifica"
  }[row.type] || row.type;
}

function isNegativeTransaction(row) {
  return (
    Number(row.balance_after_cents) <
    Number(row.balance_before_cents)
  );
}

function transactionDetail(row) {
  if (
    row.type === "rettifica" &&
    row.metadata?.operation === "manual_recharge_correction"
  ) {
    const previous =
      Number(row.metadata.previous_recorded_amount_cents || 0);
    const corrected =
      Number(row.metadata.corrected_total_cents || 0);

    return `Ricarica ${formatEuro(previous)} → ${formatEuro(corrected)}${row.note ? ` · ${row.note}` : ""}`;
  }

  return row.note || "—";
}

function renderTransactions(rows) {
  transactionList.innerHTML = rows?.length
    ? rows.map((row) => `
      <tr>
        <td>${escapeHtml(formatDateTime(row.created_at))}</td>
        <td><span class="transaction-chip transaction-chip--${escapeHtml(row.type)}">${escapeHtml(transactionTypeLabel(row))}</span></td>
        <td>${escapeHtml(row.customer_label)}</td>
        <td>
          <strong>${escapeHtml(row.position_name || "—")}</strong>
          <small>${escapeHtml(row.position_code || "")}</small>
        </td>
        <td>${escapeHtml(row.operator_label || "—")}</td>
        <td>${escapeHtml(paymentMethodLabel(row.payment_method))}</td>
        <td class="transaction-detail">${escapeHtml(transactionDetail(row))}</td>
        <td class="${isNegativeTransaction(row) ? "amount-negative" : "amount-positive"}">
          ${isNegativeTransaction(row) ? "−" : "+"}${formatEuro(row.amount_cents)}
        </td>
        <td>${formatEuro(row.balance_after_cents)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="9">Nessun movimento nel periodo.</td></tr>`;
}

async function loadTransactions(limit = 100) {
  const period = getPeriod();

  const { data, error } = await supabaseClient.rpc("admin_recent_transactions", {
    p_from: period.from,
    p_to: period.to,
    p_limit: limit
  });

  if (error) {
    transactionList.innerHTML = `<tr><td colspan="9">Impossibile caricare i movimenti.</td></tr>`;
    return;
  }

  transactionRows = data || [];
  renderTransactions(transactionRows);
}

exportTransactionsButton.addEventListener("click", async () => {
  setButtonLoading(exportTransactionsButton, true, "Preparazione…");
  const period = getPeriod();

  const { data, error } = await supabaseClient.rpc("admin_recent_transactions", {
    p_from: period.from,
    p_to: period.to,
    p_limit: 10000
  });

  setButtonLoading(exportTransactionsButton, false);

  if (error) {
    showMessage(adminMessage, readableError(error), "error");
    return;
  }

  downloadCsv(
    `indivino-movimenti-${dateFrom.value}-${dateTo.value}.csv`,
    [
      [
        "Data e ora",
        "Tipo",
        "Cliente",
        "Postazione",
        "Codice postazione",
        "Operatore",
        "Metodo",
        "Dettaglio",
        "Importo euro",
        "Saldo prima euro",
        "Saldo dopo euro",
        "ID transazione"
      ],
      ...(data || []).map((row) => [
        formatDateTime(row.created_at),
        transactionTypeLabel(row),
        row.customer_label,
        row.position_name || "",
        row.position_code || "",
        row.operator_label || "",
        paymentMethodLabel(row.payment_method),
        transactionDetail(row),
        (isNegativeTransaction(row) ? -1 : 1) *
          (Number(row.amount_cents || 0) / 100).toFixed(2),
        (Number(row.balance_before_cents || 0) / 100).toFixed(2),
        (Number(row.balance_after_cents || 0) / 100).toFixed(2),
        row.transaction_id
      ])
    ]
  );
});

async function refreshAll() {
  setButtonLoading(refreshButton, true, "Aggiornamento…");

  await Promise.all([
    loadDashboard(),
    loadPositions(),
    loadCustomers(customerQuery.value),
    loadStaff(),
    loadTransactions(100)
  ]);

  setButtonLoading(refreshButton, false);
}

periodForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await refreshAll();
});

todayButton.addEventListener("click", async () => {
  const today = localDateString();
  dateFrom.value = today;
  dateTo.value = today;
  await refreshAll();
});

refreshButton.addEventListener("click", refreshAll);


function renderInstallAppQr() {
  if (!installAppQr || !window.QRCode) return;

  const url = `${window.location.origin}/installa`;
  installAppUrl.textContent = url;
  installAppQr.innerHTML = "";

  new window.QRCode(installAppQr, {
    text: url,
    width: 230,
    height: 230,
    colorDark: "#241b1d",
    colorLight: "#ffffff",
    correctLevel: window.QRCode.CorrectLevel.H
  });
}

printInstallQrButton?.addEventListener("click", () => {
  const canvas = installAppQr?.querySelector("canvas");
  const image = installAppQr?.querySelector("img");
  const qrData = canvas?.toDataURL("image/png") || image?.src;
  const url = installAppUrl?.textContent || "";

  if (!qrData) {
    showMessage(
      adminMessage,
      "QR di installazione non ancora disponibile.",
      "error"
    );
    return;
  }

  const printWindow = window.open(
    "",
    "_blank",
    "width=620,height=820"
  );

  if (!printWindow) {
    showMessage(
      adminMessage,
      "Il browser ha bloccato la finestra di stampa.",
      "error"
    );
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="it">
    <head>
      <meta charset="utf-8">
      <title>Installa I Divini Digitali</title>
      <style>
        @page { size: A4 portrait; margin: 18mm; }
        body {
          font-family: Arial, sans-serif;
          color: #2b171b;
          text-align: center;
        }
        .card {
          max-width: 520px;
          margin: 30px auto;
          padding: 35px;
          border: 3px solid #641426;
          border-radius: 28px;
        }
        h1 { color: #641426; font-size: 34px; }
        p { font-size: 20px; line-height: 1.5; }
        img { width: 330px; height: 330px; }
        code {
          display: block;
          margin-top: 20px;
          padding: 12px;
          background: #f5eeee;
          border-radius: 10px;
          font-size: 14px;
          word-break: break-all;
        }
      </style>
    </head>
    <body>
      <article class="card">
        <h1>I Divini Digitali</h1>
        <p>Scansiona il QR con la fotocamera del telefono e installa l’app ufficiale di Indivino 2026.</p>
        <img src="${qrData}" alt="QR installazione">
        <code>${escapeHtml(url)}</code>
      </article>
      <script>
        window.onload = () => {
          window.print();
          window.onafterprint = () => window.close();
        };
      <\/script>
    </body>
    </html>
  `);

  printWindow.document.close();
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  await supabaseClient.auth.signOut();
  window.location.replace("/login");
});

const today = localDateString();
dateFrom.value = today;
dateTo.value = today;

try {
  const session = await requireAdminSession();

  if (session) {
    renderInstallAppQr();
    await refreshAll();
  }
} catch (error) {
  pageMessage.textContent = readableError(error);
  pageMessage.className = "demo-notice demo-notice--error";
}
