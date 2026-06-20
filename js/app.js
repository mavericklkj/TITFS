// Bootstrap
(async function () {
  await DB.open();
  await UI.refresh();
  UI.go("trades");

  document.querySelectorAll(".tab").forEach(tab =>
    tab.addEventListener("click", () => UI.go(tab.dataset.view)));
  document.getElementById("fab").addEventListener("click", () => UI.newTrade());

  // Service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // Install prompt
  let deferred;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferred = e;
    const b = document.getElementById("installBtn");
    b.hidden = false;
    b.onclick = async () => { deferred.prompt(); deferred = null; b.hidden = true; };
  });
})();