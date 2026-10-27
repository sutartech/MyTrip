/* Separate install shell. Expense permissions and records remain in MyTrip. */
(() => {
  "use strict";
  const loader = document.currentScript;
  const mainBase = new URL(loader.dataset.mainBase);
  const version = loader.dataset.version;
  const banner = document.getElementById("separateAppInstall");
  const button = document.getElementById("installSeparateApp");
  const status = document.getElementById("separateInstallStatus");
  const notice = document.getElementById("separateAppNotice");
  const running = () => Boolean(navigator.standalone || window.matchMedia?.("(display-mode: standalone)").matches);
  let prompt = null;
  window.MYTRIP_CONFIG = { ...(window.MYTRIP_CONFIG || {}), QUICK_EXPENSE_STANDALONE: true, QUICK_EXPENSE_ASSET_BASE: mainBase.href };
  const inMainScope = location.origin === mainBase.origin && location.pathname.startsWith(mainBase.pathname);
  if (inMainScope) {
    button.disabled = true;
    notice.hidden = false;
    notice.textContent = "Wrong upload location. Publish this package in a separate QuickExpense repository, not inside MyTrip. Restore the main MyTrip index.html if it was overwritten.";
    return;
  }
  if (/Android/i.test(navigator.userAgent) && location.protocol === "https:") {
    const chrome = document.createElement("a"); chrome.className = "separate-open-chrome";
    chrome.textContent = "Open in Chrome";
    chrome.href = "intent://" + location.href.slice("https://".length) + "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" + encodeURIComponent(location.href) + ";end";
    chrome.style.cssText = "display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 16px;border:1px solid #0e817a;border-radius:12px;background:#fff;color:#096e67;font-weight:850;text-decoration:none";
    (banner.querySelector(".separate-install-body") || banner).appendChild(chrome);
  }
  if (running()) banner.hidden = true;
  addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); prompt = event;
    button.textContent = "Install Quick Expense";
    status.textContent = "Ready for its own Android installation. Keep the MyTrip app too.";
  });
  button.addEventListener("click", async () => {
    if (!prompt) {
      status.textContent = "In Chrome tap ⋮ → Install and create shortcut / Add to Home screen → Install. Confirm Quick Expense and the small ₹ badge. Create shortcut is only a shortcut.";
      return;
    }
    const event = prompt; prompt = null;
    try {
      await event.prompt(); const choice = await event.userChoice;
      status.textContent = choice.outcome === "accepted" ? "Installation requested. Wait for Android to confirm the new Quick Expense app." : "Installation cancelled. You can try again from Chrome’s menu.";
    } catch { status.textContent = "Open this separate app address in Chrome and use its Install menu."; }
  });
  addEventListener("appinstalled", () => { banner.hidden = true; });
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register(new URL("./sw.js", location.href), { scope: "./", updateViaCache: "none" }).catch(() => {
      status.textContent = "The app cache could not start. Check sw.js was uploaded here, then reopen this page in Chrome.";
    });
  }
  function failure(message) {
    notice.hidden = false; notice.textContent = message;
    const slot = document.getElementById("quickExpenseContent");
    if (slot) slot.textContent = "Your trips and expenses have not been changed. Update the MyTrip frontend first, then reload this separate app.";
  }
  // Check the shared build before executing it: an old MyTrip build would
  // ignore standalone mode and redirect this app back into the nested scope.
  const sharedScript = new URL("app.js?v=" + encodeURIComponent(version), mainBase);
  fetch(sharedScript.href, { cache: "no-cache", credentials: "omit", signal: AbortSignal.timeout(20000) })
    .then(async response => {
      if (!response.ok) throw new Error("Shared MyTrip app.js could not load.");
      const source = await response.text();
      if (!source.includes("const quickExpenseStandalone = config.QUICK_EXPENSE_STANDALONE === true")) throw new Error("Upload the supplied MyTrip FE " + version + " app.js before using the separate app.");
      const script = document.createElement("script");
      script.src = sharedScript.href; script.id = "sharedMyTripApp";
      script.onerror = () => failure("MyTrip app.js could not start. Check the connection and the main frontend upload.");
      document.head.appendChild(script);
    }).catch(error => failure(error.message || "The shared MyTrip frontend is unavailable."));
})();
