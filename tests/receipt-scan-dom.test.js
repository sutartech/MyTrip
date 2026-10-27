"use strict";
// Optional DOM integration tests. Install jsdom@26 in the QA environment.
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { JSDOM, VirtualConsole } = process.env.MYTRIP_TEST_DEPENDENCIES ? require(path.join(process.env.MYTRIP_TEST_DEPENDENCIES, "jsdom")) : require("jsdom");
const root = path.resolve(__dirname, "..");
const tick = () => new Promise(resolve => setTimeout(resolve, 15));
function setup(url = "https://example.test/MyTrip/") {
  const errors = [], requests = [];
  const vc = new VirtualConsole(); vc.on("jsdomError", error => { if (!/navigation|scrollTo/.test(error.message)) errors.push(error); });
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const win = dom.window;
  const observers = [], Observer = win.MutationObserver;
  win.MutationObserver = class extends Observer { constructor(callback) { super(callback); observers.push(this); } };
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} });
  win.scrollTo = () => {}; win.confirm = () => true; win.MYTRIP_CONFIG = { API_URL: "" };
  win.fetch = async url => { requests.push(String(url)); return { ok: false, json: async () => ({}) }; };
  win.URL.createObjectURL = () => "blob:receipt-test"; win.URL.revokeObjectURL = () => {};
  win.eval(fs.readFileSync(path.join(root, "app.js"), "utf8"));
  return { dom, win, document: win.document, errors, requests, dispose() { win.MyTripReceiptScanner?.cancel(); observers.forEach(observer => observer.disconnect()); win.close(); } };
}
function loadScanner(win) {
  win.eval(fs.readFileSync(path.join(root, "receipt-parser.js"), "utf8"));
  Object.defineProperty(win.document, "currentScript", { configurable: true, value: { src: "https://example.test/MyTrip/receipt-scan.js?v=4.67.10" } });
  win.eval(fs.readFileSync(path.join(root, "receipt-scan.js"), "utf8"));
}
const billText = "SEA VIEW CAFE\nInvoice No: A-129\nDate 25/10/2026\nSubtotal 1000\nGST 50\nGrand Total INR 1050.00";
test("Full dashboard starts without loading OCR, Control Centre and Health render", async () => {
  const app = setup();
  try {
    assert.equal(app.win.MyTripReceiptScanner, undefined);
    assert.ok(![...app.document.scripts].some(script => /receipt-scan|tesseract/.test(script.src)));
    app.document.querySelector("#previewDemoButton").click(); await tick();
    assert.ok(app.document.querySelector(".admin-command-center"));
    assert.ok(app.document.querySelector("#systemHealthButton"));
    app.document.querySelector("#systemHealthButton").click(); await tick();
    assert.equal(app.document.querySelectorAll(".health-grid article").length, 8);
    assert.ok(app.document.querySelector("#healthNightly"));
    assert.equal(app.errors.length, 0, app.errors.map(error => error.message).join("\n"));
  } finally { app.dispose(); }
});
test("Quick Add → expense → parse → review applies only to draft, not backend", async () => {
  const app = setup();
  try {
    app.document.querySelector("#previewDemoButton").click(); await tick();
    const trip = app.document.querySelector('[data-open-admin-trip="GOA26"]') || app.document.querySelector("[data-open-admin-trip]");
    trip.click(); await tick();
    app.document.querySelector("#globalQuickAdd").click(); await tick();
    assert.ok(app.document.querySelector('[data-quick-add="import"]'));
    app.document.querySelector('[data-quick-add="expense"]').click(); await tick();
    const form = app.document.querySelector('[data-form="expense"]'); assert.ok(form);
    const payer = form.elements.paidBy.value;
    loadScanner(app.win);
    form.querySelector("[data-scan-bill]").click(); await tick();
    const text = app.document.querySelector("[data-scan-text]"); assert.ok(text);
    text.value = billText;
    app.document.querySelector("[data-scan-parse]").click();
    assert.equal(form.elements.amount.value, "", "No automatic field write before review");
    assert.equal(app.document.querySelector('.bill-scan-review [name="amount"]').value, "1050");
    const review = app.document.querySelector(".bill-scan-review");
    review.dispatchEvent(new app.win.Event("submit", { bubbles: true, cancelable: true }));
    assert.equal(form.elements.amount.value, "1050"); assert.equal(form.elements.label.value, "SEA VIEW CAFE"); assert.equal(form.elements.date.value, "2026-10-25"); assert.equal(form.elements.paidBy.value, payer);
    assert.equal(app.document.querySelector(".bill-scan-layer"), null);
    assert.equal(app.requests.filter(url => /script\.google/.test(url)).length, 0);
    assert.equal(app.errors.length, 0, app.errors.map(error => error.message).join("\n"));
    await tick(); await tick();
  } finally { app.dispose(); }
});
test("Every main MyTrip dashboard tab renders without a crash", async () => {
  const app = setup();
  try {
    app.document.querySelector("#previewDemoButton").click(); await tick();
    (app.document.querySelector('[data-open-admin-trip="GOA26"]') || app.document.querySelector("[data-open-admin-trip]")).click(); await tick();
    for (const tab of ["overview", "itinerary", "experiences", "photos", "places", "expenses", "people", "checklist", "print", "help"]) {
      app.document.querySelector(`#mainNav [data-tab="${tab}"]`).click(); await tick();
      assert.equal(app.document.querySelector("#view .crash-card"), null, `Crash on ${tab}`);
      assert.ok(app.document.querySelector("#view").textContent.trim().length > 20, `Empty ${tab}`);
    }
    assert.equal(app.errors.length, 0, app.errors.map(error => error.message).join("\n"));
  } finally { app.dispose(); }
});
test("Cancel and view-only scanning never apply fields; foreign amount is unticked", () => {
  const app = setup(); loadScanner(app.win); let applied = 0;
  try {
    app.win.MyTripReceiptScanner.open({ onApply() { applied++; } });
    app.document.querySelector("[data-scan-text]").value = "CAFE\nTOTAL USD 60";
    app.document.querySelector("[data-scan-parse]").click();
    assert.equal(app.document.querySelector('[data-use="amount"]').checked, false);
    app.document.querySelector("[data-scan-close]").click(); assert.equal(applied, 0);
    app.win.MyTripReceiptScanner.open({ canApply: false, onApply() { applied++; } });
    assert.equal(app.document.querySelector("[data-scan-apply]").hidden, true);
    app.win.MyTripReceiptScanner.cancel(); assert.equal(applied, 0);
    assert.equal(app.document.querySelector("#modal").inert, undefined);
  } finally { app.dispose(); }
});
test("Raw OCR text is not interpreted as HTML", () => {
  const app = setup(); loadScanner(app.win);
  try {
    app.win.MyTripReceiptScanner.open({});
    app.document.querySelector("[data-scan-text]").value = '<img src=x onerror="window.pwned=1">CAFE\nTOTAL 90';
    app.document.querySelector("[data-scan-parse]").click();
    assert.equal(app.win.pwned, undefined); assert.equal(app.document.querySelectorAll(".bill-scan-review img").length, 0);
  } finally { app.dispose(); }
});
test("Quick Expense icon with no saved trip shows no-login link recovery, not account sign-in", async () => {
  const app = setup("https://example.test/MyTrip/quick-expense/index.html?quick-expense-home=1");
  try {
    await tick(); assert.ok(app.document.querySelector("#restoreQuickExpenseLink"));
    assert.equal(app.document.querySelector("#accessScreen").classList.contains("hidden"), true);
    assert.equal(app.document.querySelector("#quickExpenseScreen").classList.contains("hidden"), false);
  } finally { app.dispose(); }
});
test("Dedicated Android installer keeps trip link and distinguishes installation request from completion", async () => {
  const html = fs.readFileSync(path.join(root, "quick-expense/install.html"), "utf8");
  const token = "a".repeat(43);
  const dom = new JSDOM(html, { url: `https://example.test/MyTrip/quick-expense/install.html#qe=${token}`, runScripts: "outside-only" });
  try {
    const win = dom.window; [...win.document.scripts].forEach(script => { if (!script.src) win.eval(script.textContent); });
    assert.equal(JSON.parse(win.localStorage.getItem("mytrip_quick_expense_shortcut_v1")).token, token);
    assert.equal(win.document.querySelectorAll(".two-icons article").length, 2);
    assert.ok(!win.document.querySelector("#status").textContent.includes("Installed successfully"));
    const manifest = win.document.querySelector('link[rel="manifest"]').href;
    assert.equal(manifest, "https://example.test/QuickExpense/manifest.webmanifest");
    const event = new win.Event("beforeinstallprompt", { cancelable: true }); event.prompt = async () => {}; event.userChoice = Promise.resolve({ outcome: "accepted" });
    win.dispatchEvent(event); win.document.querySelector("#install").click(); await tick();
    assert.match(win.document.querySelector("#status").textContent, /separate Quick Expense app/);
    assert.ok(!win.document.querySelector("#status").textContent.includes("Installed successfully"));
  } finally { dom.window.close(); }
});
test("Second-icon shortcut flow retains MyTrip and copies the exact no-login expense link", async () => {
  const html = fs.readFileSync(path.join(root, "quick-expense/install.html"), "utf8"), token = "q".repeat(43), api = "https://script.google.com/macros/s/TEST/exec";
  const dom = new JSDOM(html, { url: `https://example.test/MyTrip/quick-expense/install.html?api=${encodeURIComponent(api)}#qe=${token}`, runScripts: "outside-only" });
  try {
    const win = dom.window; let copied = "";
    Object.defineProperty(win.navigator, "userAgent", { value: "Mozilla/5.0 (Linux; Android 14) Chrome/140" });
    Object.defineProperty(win.navigator, "clipboard", { value: { async writeText(text) { copied = text; } } });
    win.localStorage.setItem("mytrip_saved_username_v2", "family-user");
    [...win.document.scripts].forEach(script => { if (!script.src) win.eval(script.textContent); });
    const launch = new URL(win.document.querySelector("#openExpense").href);
    assert.equal(launch.pathname, "/QuickExpense/index.html");
    assert.equal(launch.searchParams.get("quick-expense"), "1");
    assert.equal(launch.searchParams.get("api"), api);
    assert.equal(new URLSearchParams(launch.hash.slice(1)).get("qe"), token);
    const chrome = win.document.querySelector("#openChrome");
    assert.ok(!chrome.classList.contains("hidden"));
    const intentData = chrome.getAttribute("href").slice("intent://".length).split("#Intent;")[0];
    assert.equal("https://" + intentData, launch.href, "Chrome intent preserves URL fragment");
    assert.match(chrome.href, /package=com\.android\.chrome/);
    win.document.querySelector("#install").click();
    assert.match(win.document.querySelector("#status").textContent, /Keep MyTrip/);
    assert.ok(!win.document.querySelector("#steps").classList.contains("hidden"));
    win.document.querySelector("#copyLink").click(); await tick();
    assert.equal(copied, launch.href);
    assert.equal(win.localStorage.getItem("mytrip_saved_username_v2"), "family-user");
    assert.equal(JSON.parse(win.localStorage.getItem("mytrip_quick_expense_shortcut_v1")).apiUrl, api);
  } finally { dom.window.close(); }
});
test("Installer does not claim ready when the private link is absent or invalid", () => {
  const html = fs.readFileSync(path.join(root, "quick-expense/install.html"), "utf8");
  const dom = new JSDOM(html, { url: "https://example.test/MyTrip/quick-expense/install.html?api=https://evil.test/#qe=bad", runScripts: "outside-only" });
  try {
    const win = dom.window; [...win.document.scripts].forEach(script => { if (!script.src) win.eval(script.textContent); });
    assert.equal(win.document.querySelector("#install").disabled, true);
    assert.equal(win.document.querySelector("#copyLink").disabled, true);
    assert.equal(new URL(win.document.querySelector("#openExpense").href).searchParams.has("api"), false);
    assert.match(win.document.querySelector("#status").textContent, /No trip link saved/);
  } finally { dom.window.close(); }
});
test("Storage-blocked installer retains a direct private shortcut but does not request a broken native install", async () => {
  const html = fs.readFileSync(path.join(root, "quick-expense/install.html"), "utf8"), token = "z".repeat(43);
  const dom = new JSDOM(html, { url: `https://example.test/MyTrip/quick-expense/install.html#qe=${token}`, runScripts: "outside-only" });
  try {
    const win = dom.window; let prompts = 0;
    Object.defineProperty(win, "localStorage", { get() { throw new Error("Blocked"); } });
    [...win.document.scripts].forEach(script => { if (!script.src) win.eval(script.textContent); });
    assert.equal(new URL(win.document.querySelector("#openExpense").href).hash, "#qe=" + token);
    assert.match(win.document.querySelector("#status").textContent, /storage is unavailable/);
    const event = new win.Event("beforeinstallprompt", { cancelable: true }); event.prompt = async () => { prompts++; }; event.userChoice = Promise.resolve({ outcome: "accepted" });
    win.dispatchEvent(event); win.document.querySelector("#install").click(); await tick();
    assert.equal(prompts, 0);
    win.document.querySelector("#copyLink").click(); await tick();
    assert.equal(win.document.querySelector("#privateLink").value.includes("#qe=" + token), true);
    assert.equal(win.document.querySelector("#privateLink").classList.contains("hidden"), false);
  } finally { dom.window.close(); }
});
test("Sharing totals and filters work on desktop and mobile without changing trip totals", async () => {
 for(const phone of [false,true]){
  const app=setup();
  try{
   app.win.matchMedia=query=>({matches:phone&&query==='(max-width: 760px)',addEventListener(){},removeEventListener(){},addListener(){}});
   app.document.querySelector('#previewDemoButton').click();await tick();
   (app.document.querySelector('[data-open-admin-trip="GOA26"]')||app.document.querySelector('[data-open-admin-trip]')).click();await tick();
   app.document.querySelector('#mainNav [data-tab="expenses"]').click();await tick();
   const view=app.document.querySelector('#view');
   assert.equal(view.querySelector('[data-sharing-panel]').open,false);
   view.querySelector('[data-sharing-panel]>summary').click();await tick();
   assert.equal(view.querySelector('[data-sharing-panel]').open,true);
   assert.equal(view.querySelectorAll('.sharing-common-card').length,1);
   assert.equal(view.querySelectorAll('[data-expense-sharing-select]').length,1);
   assert.equal(view.querySelector('.family-division').open,false);
   const before=Array.from(view.querySelectorAll('.sharing-common-card strong'),x=>x.textContent);
   assert.equal(view.querySelector('.expense-share-badge.all'),null,'ordinary all-share expenses stay quiet');
   const select=view.querySelector('[data-expense-sharing-select]');select.value='set:A';select.dispatchEvent(new app.win.Event('change',{bubbles:true}));await tick();
   assert.equal(view.querySelector('[data-expense-sharing-select]').value,'set:A');
   assert.deepEqual(Array.from(view.querySelectorAll('.sharing-common-card strong'),x=>x.textContent),before);
   for(const badge of view.querySelectorAll('.expense-share-badge'))assert.ok(badge.classList.contains('one'));
   const reset=view.querySelector('[data-expense-sharing-select]');reset.value='any';reset.dispatchEvent(new app.win.Event('change',{bubbles:true}));await tick();
   assert.equal(view.querySelector('.expense-share-badge.all'),null);
   assert.equal(app.errors.length,0,app.errors.map(e=>e.message).join('\n'));
  }finally{app.dispose();}
 }
});

test("Who paid opens its saved bills and sharing rules remain collapsed", async () => {
  const app = setup();
  try {
    app.document.querySelector("#previewDemoButton").click(); await tick();
    (app.document.querySelector('[data-open-admin-trip="GOA26"]') || app.document.querySelector("[data-open-admin-trip]")).click(); await tick();
    app.document.querySelector('#mainNav [data-tab="expenses"]').click(); await tick();
    const guide = app.document.querySelector('.expense-sharing-guide');
    assert.ok(guide && !guide.open);
    const payer = app.document.querySelector('.expense-payer-breakdown');
    assert.ok(payer && payer.querySelectorAll('li').length > 0);
    assert.equal(payer.open, false);
    payer.querySelector('summary').click();
    assert.equal(payer.open, true);
    assert.equal(app.errors.length, 0, app.errors.map(error => error.message).join('\n'));
  } finally { app.dispose(); }
});
