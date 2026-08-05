(() => {
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register(
          "/service-worker.js",
          {
            scope: "/",
            updateViaCache: "none"
          }
        );

        await registration.update();
      } catch (error) {
        console.warn("Service worker non registrato:", error);
      }
    });
  }
})();
