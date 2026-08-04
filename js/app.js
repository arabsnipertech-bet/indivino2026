(() => {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch((error) => {
        console.warn("Service worker non registrato:", error);
      });
    });
  }

  const logoutButton = document.querySelector("#logout-button");
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      window.location.href = "/login";
    });
  }
})();
