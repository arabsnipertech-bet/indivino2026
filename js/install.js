(() => {
  const installButton =
    document.querySelector("#install-app-button");
  const status =
    document.querySelector("#install-status");
  const iosInstructions =
    document.querySelector("#ios-instructions");
  const androidInstructions =
    document.querySelector("#android-instructions");
  const manualInstructions =
    document.querySelector("#manual-instructions");

  let deferredPrompt = null;

  const isIos =
    /iphone|ipad|ipod/i.test(navigator.userAgent);

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  function showStatus(text, type = "info") {
    status.textContent = text;
    status.className =
      `form-message is-visible is-${type}`;
  }

  if (isStandalone) {
    installButton.disabled = true;
    installButton.textContent = "App già installata";
    showStatus(
      "I Divini Digitali è già installata su questo dispositivo.",
      "success"
    );
    return;
  }

  if (isIos) {
    installButton.classList.add("is-hidden");
    androidInstructions.classList.add("is-hidden");
    iosInstructions.classList.remove("is-hidden");
    showStatus(
      "Su iPhone l’installazione si completa dal menu Condividi di Safari.",
      "info"
    );
  } else {
    installButton.disabled = true;
    installButton.textContent =
      "Preparazione installazione…";
  }

  window.addEventListener(
    "beforeinstallprompt",
    (event) => {
      event.preventDefault();
      deferredPrompt = event;

      installButton.disabled = false;
      installButton.textContent = "Installa l’app";
      manualInstructions.classList.add("is-hidden");
      showStatus(
        "L’app è pronta per essere installata.",
        "success"
      );
    }
  );

  installButton.addEventListener("click", async () => {
    if (!deferredPrompt) {
      manualInstructions.classList.remove("is-hidden");
      showStatus(
        "Il browser non ha mostrato il pulsante automatico. Usa il menu e scegli Installa app o Aggiungi a schermata Home.",
        "info"
      );
      return;
    }

    installButton.disabled = true;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;

    if (choice.outcome === "accepted") {
      showStatus(
        "Installazione avviata correttamente.",
        "success"
      );
      installButton.textContent =
        "Installazione avviata";
    } else {
      showStatus(
        "Installazione annullata. Puoi riprovare quando preferisci.",
        "info"
      );
      installButton.disabled = false;
      installButton.textContent = "Installa l’app";
    }
  });

  window.addEventListener("appinstalled", () => {
    showStatus(
      "I Divini Digitali è stata installata.",
      "success"
    );
    installButton.disabled = true;
    installButton.textContent = "App installata";
  });

  window.setTimeout(() => {
    if (
      !isIos &&
      !deferredPrompt &&
      !isStandalone
    ) {
      installButton.disabled = false;
      installButton.textContent =
        "Mostra istruzioni installazione";
      manualInstructions.classList.remove("is-hidden");
    }
  }, 2500);
})();
