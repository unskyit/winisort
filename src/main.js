import { WiniSortApplication } from "./core/app.js";

function registerPwaServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (
    window.location.protocol !== "https:" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .catch(() => {});
  });
}

function bootstrap() {
  const rootEl = document.getElementById("app-root");
  if (!rootEl) return;
  const app = new WiniSortApplication(rootEl);
  window.__WINISORT_APP__ = app;
  app.init();
  registerPwaServiceWorker();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
