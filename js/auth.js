import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const form = document.querySelector("form");
const message = document.querySelector("#form-message");

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.togglePassword);
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";
    button.textContent = isPassword ? "Nascondi" : "Mostra";
  });
});

function showMessage(text, type = "info") {
  if (!message) return;
  message.textContent = text;
  message.className = `form-message is-visible is-${type}`;
}

function isConfigured() {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_PUBLISHABLE_KEY &&
    !SUPABASE_URL.includes("IL-TUO-PROGETTO") &&
    !SUPABASE_PUBLISHABLE_KEY.includes("LA-TUA")
  );
}

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (!isConfigured()) {
      showMessage(
        "La grafica funziona. Nel passaggio successivo collegheremo Supabase per attivare registrazione e accesso.",
        "info"
      );
      return;
    }

    showMessage("Configurazione rilevata. La logica Supabase verrà attivata nel passaggio 2.", "info");
  });
}
