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

function transactionLabel(type) {
  const labels = {
    ricarica: "Ricarica cassa",
    pagamento: "Pagamento stand",
    storno: "Storno",
    rettifica: "Rettifica amministrativa"
  };
  return labels[type] || "Movimento";
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
    const positive = row.type !== "pagamento";
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
          <strong>${transactionLabel(row.type)}</strong>
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

  renderQr(wallet.qr_token);

  const { data: transactionRows, error: transactionError } = await supabaseClient
    .from("transactions")
    .select("id, type, amount_cents, created_at")
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
      .select("id, type, amount_cents, created_at")
      .eq("wallet_id", walletWithId.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (retry.error) throw retry.error;
    renderTransactions(retry.data);
  } else {
    renderTransactions(transactionRows);
  }
}

logoutButton?.addEventListener("click", async () => {
  logoutButton.disabled = true;
  await supabaseClient.auth.signOut();
  window.location.replace("/login");
});

try {
  await loadDashboard();
} catch (error) {
  console.error("Errore area cliente:", error);
  showPageError(
    "Non è stato possibile caricare il portafoglio. Controlla di aver eseguito lo script SQL in Supabase."
  );
}
