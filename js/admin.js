import { supabaseClient } from "./supabase-client.js";
import { APP_CONFIG } from "./config.js";

const adminName = document.querySelector("#admin-name");
const logoutButton = document.querySelector("#logout-button");
const pageMessage = document.querySelector("#page-message");

const periodForm = document.querySelector("#period-form");
const dateFrom = document.querySelector("#date-from");
const dateTo = document.querySelector("#date-to");
const todayButton = document.querySelector("#today-button");
const refreshButton = document.querySelector("#refresh-admin");
const adminMessage = document.querySelector("#admin-message");

const totalCustomers = document.querySelector("#total-customers");
const totalLoaded = document.querySelector("#total-loaded");
const totalSpent = document.querySelector("#total-spent");
const totalRemaining = document.querySelector("#total-remaining");
const totalCash = document.querySelector("#total-cash");
const totalPos = document.querySelector("#total-pos");
const rechargeCount = document.querySelector("#recharge-count");
const paymentCount = document.querySelector("#payment-count");
const remainingDivini = document.querySelector("#remaining-divini");

const cashierRanking = document.querySelector("#cashier-ranking");
const standRanking = document.querySelector("#stand-ranking");
const hourlyChart = document.querySelector("#hourly-chart");

const balanceLoaded = document.querySelector("#balance-loaded");
const balanceSpent = document.querySelector("#balance-spent");
const balanceWallets = document.querySelector("#balance-wallets");
const balanceDifference = document.querySelector("#balance-difference");

const configuredCashiers = document.querySelector("#configured-cashiers");
const configuredStands = document.querySelector("#configured-stands");
const activeStaff = document.querySelector("#active-staff");
const activeAdmins = document.querySelector("#active-admins");
const staffList = document.querySelector("#staff-list");
const staffMessage = document.querySelector("#staff-message");
const generateStaffButton = document.querySelector("#generate-staff");
const downloadCredentialsButton = document.querySelector("#download-credentials");
const downloadCredentialsModalButton = document.querySelector("#download-credentials-modal");

const transactionList = document.querySelector("#transaction-list");
const exportTransactionsButton = document.querySelector("#export-transactions");

const credentialsModal = document.querySelector("#credentials-modal");
const credentialsPreview = document.querySelector("#credentials-preview");

let dashboardData = null;
let staffRows = [];
let transactionRows = [];
let generatedCredentials = [];

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

  if (lowered.includes("failed to send") || lowered.includes("edge function")) {
    return "La funzione amministrativa non è ancora disponibile oppure non è stata pubblicata.";
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
  const from = new Date(`${dateFrom.value}T00:00:00`);
  const to = new Date(`${dateTo.value}T23:59:59.999`);

  return {
    from: from.toISOString(),
    to: to.toISOString()
  };
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

function renderOverview(data) {
  const totals = data?.totals || {};
  const staff = data?.staff || {};

  totalCustomers.textContent = formatNumber(totals.customers_count);
  totalLoaded.textContent = formatEuro(totals.loaded_cents);
  totalSpent.textContent = formatEuro(totals.spent_cents);
  totalRemaining.textContent = formatEuro(totals.remaining_cents);
  totalCash.textContent = formatEuro(totals.cash_cents);
  totalPos.textContent = formatEuro(totals.pos_cents);

  rechargeCount.textContent = `${formatNumber(totals.recharge_count)} ricariche`;
  paymentCount.textContent = `${formatNumber(totals.payment_count)} pagamenti`;
  remainingDivini.textContent = `${formatNumber(formatDivini(totals.remaining_cents))} Divini`;

  balanceLoaded.textContent = formatEuro(totals.loaded_all_time_cents);
  balanceSpent.textContent = formatEuro(totals.spent_all_time_cents);
  balanceWallets.textContent = formatEuro(totals.remaining_cents);

  const difference =
    Number(totals.loaded_all_time_cents || 0) -
    Number(totals.spent_all_time_cents || 0) -
    Number(totals.remaining_cents || 0);

  balanceDifference.textContent = formatEuro(difference);
  balanceDifference.classList.toggle("is-alert", Math.abs(difference) > 1);

  configuredCashiers.textContent = `${formatNumber(staff.cashier_positions_configured)} / 20`;
  configuredStands.textContent = `${formatNumber(staff.stand_positions_configured)} / 15`;
  activeStaff.textContent = formatNumber(staff.active_staff);
  activeAdmins.textContent = formatNumber(staff.active_admins);
}

function renderCashierRanking(rows) {
  if (!rows?.length) {
    cashierRanking.innerHTML = `<tr><td colspan="6">Nessuna cassa configurata.</td></tr>`;
    return;
  }

  cashierRanking.innerHTML = rows.map((row, index) => `
    <tr>
      <td>
        <span class="ranking-position">${index + 1}</span>
        <strong>${escapeHtml(row.name)}</strong>
        <small>${escapeHtml(row.code)}</small>
      </td>
      <td>${formatNumber(row.operations_count)}</td>
      <td>${formatEuro(row.cash_cents)}</td>
      <td>${formatEuro(row.pos_cents)}</td>
      <td><strong>${formatEuro(row.total_cents)}</strong></td>
      <td>${formatEuro(row.average_cents)}</td>
    </tr>
  `).join("");
}

function renderStandRanking(rows) {
  if (!rows?.length) {
    standRanking.innerHTML = `<tr><td colspan="6">Nessuno stand configurato.</td></tr>`;
    return;
  }

  standRanking.innerHTML = rows.map((row, index) => `
    <tr>
      <td>
        <span class="ranking-position">${index + 1}</span>
        <strong>${escapeHtml(row.name)}</strong>
        <small>${escapeHtml(row.code)}</small>
      </td>
      <td>${formatNumber(row.operations_count)}</td>
      <td>${formatNumber(row.unique_customers)}</td>
      <td>${formatNumber(formatDivini(row.total_cents))}</td>
      <td><strong>${formatEuro(row.total_cents)}</strong></td>
      <td>${formatEuro(row.average_cents)}</td>
    </tr>
  `).join("");
}

function renderHourly(rows) {
  if (!rows?.length) {
    hourlyChart.innerHTML = `
      <div class="empty-state">
        <strong>Nessuna operazione nel periodo</strong>
      </div>
    `;
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

function roleLabel(role) {
  const labels = {
    admin: "Amministratore",
    cassa: "Cassa",
    stand: "Stand"
  };

  return labels[role] || role;
}

function renderStaff(rows) {
  if (!rows?.length) {
    staffList.innerHTML = `<tr><td colspan="6">Nessun operatore disponibile.</td></tr>`;
    return;
  }

  staffList.innerHTML = rows.map((row) => {
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
              <button class="table-action" type="button" data-action="toggle" data-id="${escapeHtml(row.id)}" data-active="${row.active}">
                ${row.active ? "Disattiva" : "Riattiva"}
              </button>
            ` : ""}
            <button class="table-action" type="button" data-action="reset" data-id="${escapeHtml(row.id)}" data-email="${escapeHtml(row.email)}">
              Nuova password
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  staffList.querySelectorAll("[data-action='toggle']").forEach((button) => {
    button.addEventListener("click", async () => {
      await toggleStaff(
        button.dataset.id,
        button.dataset.active !== "true",
        button
      );
    });
  });

  staffList.querySelectorAll("[data-action='reset']").forEach((button) => {
    button.addEventListener("click", async () => {
      await resetPassword(
        button.dataset.id,
        button.dataset.email,
        button
      );
    });
  });
}

function transactionTypeLabel(type) {
  const labels = {
    ricarica: "Ricarica",
    pagamento: "Pagamento",
    storno: "Storno",
    rettifica: "Rettifica"
  };

  return labels[type] || type;
}

function renderTransactions(rows) {
  if (!rows?.length) {
    transactionList.innerHTML = `<tr><td colspan="8">Nessun movimento nel periodo.</td></tr>`;
    return;
  }

  transactionList.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(formatDateTime(row.created_at))}</td>
      <td><span class="transaction-chip transaction-chip--${escapeHtml(row.type)}">${escapeHtml(transactionTypeLabel(row.type))}</span></td>
      <td>${escapeHtml(row.customer_label)}</td>
      <td>
        <strong>${escapeHtml(row.position_name || "—")}</strong>
        <small>${escapeHtml(row.position_code || "")}</small>
      </td>
      <td>${escapeHtml(row.operator_label || "—")}</td>
      <td>${escapeHtml(row.payment_method || "—")}</td>
      <td class="${row.type === "pagamento" ? "amount-negative" : "amount-positive"}">
        ${row.type === "pagamento" ? "−" : "+"}${formatEuro(row.amount_cents)}
      </td>
      <td>${formatEuro(row.balance_after_cents)}</td>
    </tr>
  `).join("");
}

async function loadDashboard() {
  clearMessage(adminMessage);
  setButtonLoading(refreshButton, true, "Aggiornamento…");

  const period = getPeriod();

  const { data, error } = await supabaseClient.rpc("admin_get_dashboard", {
    p_from: period.from,
    p_to: period.to
  });

  setButtonLoading(refreshButton, false);

  if (error) {
    console.error("Errore dashboard:", error);
    showMessage(adminMessage, readableError(error), "error");
    return;
  }

  dashboardData = data;
  renderOverview(data);
  renderCashierRanking(data.cashiers || []);
  renderStandRanking(data.stands || []);
  renderHourly(data.hourly || []);
}

async function loadStaff() {
  const { data, error } = await supabaseClient.rpc("admin_list_staff");

  if (error) {
    console.error("Errore personale:", error);
    staffList.innerHTML = `<tr><td colspan="6">Impossibile caricare gli operatori.</td></tr>`;
    return;
  }

  staffRows = data || [];
  renderStaff(staffRows);
}

async function loadTransactions(limit = 100) {
  const period = getPeriod();

  const { data, error } = await supabaseClient.rpc("admin_recent_transactions", {
    p_from: period.from,
    p_to: period.to,
    p_limit: limit
  });

  if (error) {
    console.error("Errore transazioni:", error);
    transactionList.innerHTML = `<tr><td colspan="8">Impossibile caricare i movimenti.</td></tr>`;
    return;
  }

  transactionRows = data || [];
  renderTransactions(transactionRows);
}

async function refreshAll() {
  await Promise.all([
    loadDashboard(),
    loadStaff(),
    loadTransactions(100)
  ]);
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

function openCredentialsModal() {
  credentialsModal.classList.remove("is-hidden");
  document.body.classList.add("modal-open");
}

function closeCredentialsModal() {
  credentialsModal.classList.add("is-hidden");
  document.body.classList.remove("modal-open");
}

document.querySelectorAll("[data-close-credentials]").forEach((element) => {
  element.addEventListener("click", closeCredentialsModal);
});

function renderCredentials(rows) {
  const created = rows.filter((row) => row.password);

  credentialsPreview.innerHTML = created.length
    ? created.slice(0, 12).map((row) => `
        <div class="credential-row">
          <div>
            <strong>${escapeHtml(row.position_name)}</strong>
            <span>${escapeHtml(row.email)}</span>
          </div>
          <code>${escapeHtml(row.password)}</code>
        </div>
      `).join("") + (created.length > 12
        ? `<p class="field-help">Altri ${created.length - 12} profili sono inclusi nel file CSV.</p>`
        : "")
    : `
      <div class="empty-state">
        <strong>Nessun nuovo account creato</strong>
        <span>I profili standard risultavano già presenti.</span>
      </div>
    `;
}

async function invokeStaffFunction(body) {
  const { data, error } = await supabaseClient.functions.invoke(
    "admin-staff",
    { body }
  );

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data;
}

generateStaffButton.addEventListener("click", async () => {
  clearMessage(staffMessage);

  const confirmed = window.confirm(
    "Creare i profili operatore mancanti per Cassa 02–20 e Stand 01–15? Cassa 01 resta associata all’amministratore."
  );

  if (!confirmed) return;

  setButtonLoading(generateStaffButton, true, "Creazione profili…");

  try {
    const result = await invokeStaffFunction({
      action: "generate_structure"
    });

    generatedCredentials = result.credentials || [];
    const createdCount = generatedCredentials.filter((row) => row.password).length;

    downloadCredentialsButton.disabled = createdCount === 0;
    downloadCredentialsModalButton.disabled = createdCount === 0;

    renderCredentials(generatedCredentials);
    openCredentialsModal();

    showMessage(
      staffMessage,
      `${createdCount} nuovi profili creati. ${result.existing_count || 0} profili erano già presenti.`,
      "success"
    );

    await refreshAll();
  } catch (error) {
    console.error("Errore generazione operatori:", error);
    showMessage(staffMessage, readableError(error), "error");
  } finally {
    setButtonLoading(generateStaffButton, false);
  }
});

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

async function resetPassword(userId, email, button) {
  const confirmed = window.confirm(
    `Generare una nuova password temporanea per ${email}?`
  );

  if (!confirmed) return;

  setButtonLoading(button, true, "…");

  try {
    const result = await invokeStaffFunction({
      action: "reset_password",
      user_id: userId
    });

    generatedCredentials = [{
      position_name: result.position_name || "Operatore",
      email: result.email,
      password: result.password,
      role: result.role
    }];

    downloadCredentialsButton.disabled = false;
    downloadCredentialsModalButton.disabled = false;
    renderCredentials(generatedCredentials);
    openCredentialsModal();

    showMessage(staffMessage, "Password temporanea generata.", "success");
  } catch (error) {
    showMessage(staffMessage, readableError(error), "error");
  } finally {
    setButtonLoading(button, false);
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
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
  const rowsWithPasswords = generatedCredentials.filter((row) => row.password);

  if (!rowsWithPasswords.length) {
    showMessage(staffMessage, "Non ci sono nuove credenziali da scaricare.", "error");
    return;
  }

  const rows = [
    ["Postazione", "Ruolo", "Email accesso", "Password temporanea"],
    ...rowsWithPasswords.map((row) => [
      row.position_name,
      roleLabel(row.role),
      row.email,
      row.password
    ])
  ];

  downloadCsv("indivino-credenziali-operatori.csv", rows);
}

downloadCredentialsButton.addEventListener("click", downloadCredentials);
downloadCredentialsModalButton.addEventListener("click", downloadCredentials);

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

  const rows = [
    [
      "Data e ora",
      "Tipo",
      "Cliente",
      "Postazione",
      "Codice postazione",
      "Operatore",
      "Metodo",
      "Importo euro",
      "Saldo prima euro",
      "Saldo dopo euro",
      "ID transazione"
    ],
    ...(data || []).map((row) => [
      formatDateTime(row.created_at),
      transactionTypeLabel(row.type),
      row.customer_label,
      row.position_name || "",
      row.position_code || "",
      row.operator_label || "",
      row.payment_method || "",
      (Number(row.amount_cents || 0) / 100).toFixed(2),
      (Number(row.balance_before_cents || 0) / 100).toFixed(2),
      (Number(row.balance_after_cents || 0) / 100).toFixed(2),
      row.transaction_id
    ])
  ];

  downloadCsv(
    `indivino-movimenti-${dateFrom.value}-${dateTo.value}.csv`,
    rows
  );
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
  const adminSession = await requireAdminSession();

  if (adminSession) {
    await refreshAll();
  }
} catch (error) {
  console.error("Errore inizializzazione amministrazione:", error);
  pageMessage.textContent = readableError(error);
  pageMessage.className = "demo-notice demo-notice--error";
}
