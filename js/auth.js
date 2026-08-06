import { supabaseClient } from "./supabase-client.js";

const loginForm = document.querySelector("#login-form");
const registrationForm = document.querySelector("#registration-form");
const message = document.querySelector("#form-message");

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;

    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.textContent = reveal ? "Nascondi" : "Mostra";
  });
});

function showMessage(text, type = "info") {
  if (!message) return;
  message.textContent = text;
  message.className = `form-message is-visible is-${type}`;
}

function clearMessage() {
  if (!message) return;
  message.textContent = "";
  message.className = "form-message";
}

function setLoading(form, loading, text) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;

  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent;
  }

  button.disabled = loading;
  button.textContent = loading ? text : button.dataset.originalText;
}

function translateAuthError(error) {
  const raw = String(error?.message || "").toLowerCase();

  if (raw.includes("invalid login credentials")) {
    return "Email/codice accesso o password non corretti.";
  }
  if (raw.includes("email not confirmed")) {
    return "Devi prima confermare il tuo indirizzo email.";
  }
  if (raw.includes("user already registered")) {
    return "Questa email risulta già registrata. Prova ad accedere.";
  }
  if (raw.includes("password should be at least")) {
    return "La password deve contenere almeno 8 caratteri.";
  }
  if (raw.includes("email address not authorized")) {
    return "Supabase non può ancora inviare email a questo indirizzo. Per il collaudo disattiva temporaneamente la conferma email oppure configura un servizio SMTP.";
  }
  if (raw.includes("rate limit") || raw.includes("too many requests")) {
    return "Sono stati effettuati troppi tentativi. Attendi qualche minuto e riprova.";
  }
  if (raw.includes("failed to fetch")) {
    return "Impossibile contattare il servizio. Controlla la connessione internet.";
  }

  return error?.message || "Si è verificato un errore inatteso.";
}

async function redirectByRole(userId) {
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("role, active")
    .eq("id", userId)
    .single();

  if (error) throw error;

  if (!profile.active) {
    await supabaseClient.auth.signOut();
    throw new Error("Questo account è stato disattivato.");
  }

  const destinations = {
    cliente: "/cliente",
    cassa: "/cassa",
    stand: "/stand",
    admin: "/admin"
  };

  window.location.replace(destinations[profile.role] || "/cliente");
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    if (!loginForm.checkValidity()) {
      loginForm.reportValidity();
      return;
    }

    const formData = new FormData(loginForm);
    const loginValue = String(
      formData.get("email") || ""
    ).trim().toLowerCase();
    const password = String(formData.get("password") || "");

    const email = loginValue.includes("@")
      ? loginValue
      : `${loginValue.replaceAll(" ", "")}@operatori.indivino2026.it`;

    setLoading(loginForm, true, "Accesso in corso…");

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      if (!data.user) throw new Error("Utente non disponibile.");

      await redirectByRole(data.user.id);
    } catch (error) {
      console.error("Errore accesso:", error);
      showMessage(translateAuthError(error), "error");
      setLoading(loginForm, false);
    }
  });
}

if (registrationForm) {
  registrationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    if (!registrationForm.checkValidity()) {
      registrationForm.reportValidity();
      return;
    }

    const formData = new FormData(registrationForm);
    const nome = String(formData.get("nome") || "").trim();
    const cognome = String(formData.get("cognome") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");

    setLoading(registrationForm, true, "Creazione in corso…");

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            nome,
            cognome
          }
        }
      });

      if (error) throw error;
      if (!data.user) throw new Error("Registrazione non completata.");

      if (data.session) {
        showMessage("Portafoglio creato. Apertura dell’area cliente…", "success");
        window.setTimeout(() => {
          window.location.replace("/cliente");
        }, 700);
        return;
      }

      showMessage(
        "La conferma email risulta ancora attiva nelle impostazioni Supabase. Disattivala per consentire l’accesso immediato.",
        "error"
      );
    } catch (error) {
      console.error("Errore registrazione:", error);
      showMessage(translateAuthError(error), "error");
    } finally {
      setLoading(registrationForm, false);
    }
  });
}

// Un utente già autenticato che apre login o registrazione viene portato
// direttamente nella propria area.
const { data: sessionData } = await supabaseClient.auth.getSession();
if (sessionData.session?.user) {
  try {
    await redirectByRole(sessionData.session.user.id);
  } catch (error) {
    console.error("Errore reindirizzamento sessione:", error);
  }
}
