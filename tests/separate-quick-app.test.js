"use strict";
// Run after build-separate-quick-app.js; requires jsdom in the QA environment.
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { JSDOM, VirtualConsole } = process.env.MYTRIP_TEST_DEPENDENCIES ? require(path.join(process.env.MYTRIP_TEST_DEPENDENCIES, "jsdom")) : require("jsdom");
const root = path.resolve(__dirname, "..");
const built = process.env.MYTRIP_SEPARATE_PACKAGE;
if (!built) throw new Error("Set MYTRIP_SEPARATE_PACKAGE to the generated standalone package directory.");
const source = fs.readFileSync(path.join(root, "app.js"), "utf8"), html = fs.readFileSync(path.join(built, "index.html"), "utf8"), loader = fs.readFileSync(path.join(built, "standalone.js"), "utf8");
const token = "t".repeat(43), mainKey = "mytrip_quick_expense_shortcut_v1", ownKey = "mytrip_separate_quick_expense_v1";
const tick = () => new Promise(resolve => setTimeout(resolve, 25));
function setup({ saved = false, standalone = false, compatible = true, search = "", members = ["Alice", "Bob"], splitMembers = "" } = {}) {
  const errors = [], requests = [], vc = new VirtualConsole();
  vc.on("jsdomError", error => { if (!/scrollTo|navigation/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(html, { url: "https://sutartech.github.io/QuickExpense/index.html" + search, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const win = dom.window, observers = [], Observer = win.MutationObserver;
  win.MutationObserver = class extends Observer { constructor(callback) { super(callback); observers.push(this); } };
  win.matchMedia = query => ({ matches: standalone && query.includes("standalone"), addEventListener() {}, removeEventListener() {}, addListener() {} });
  win.scrollTo = () => {}; win.confirm = () => true; win.AbortSignal.timeout = () => new win.AbortController().signal;
  win.MYTRIP_CONFIG = { API_URL: "https://script.google.com/macros/s/TEST/exec" };
  if (saved) win.localStorage.setItem(mainKey, JSON.stringify({ enabled: true, token, tripName: "Mysore", apiUrl: win.MYTRIP_CONFIG.API_URL }));
  const capabilities = Object.fromEntries([...source.matchAll(/\binfo\.(\w+) !== true/g)].map(match => [match[1], true]));
  win.fetch = async (url, options = {}) => {
    if (String(url).includes("/MyTrip/app.js")) return { ok: true, text: async () => compatible ? source : "/* previous build */" };
    const body = JSON.parse(options.body || "{}"); requests.push(body);
    const data = body.action === "ping" ? { ...capabilities, version: "4.32.2" } : body.action === "getQuickExpenseInfo" ? { trip: { name: "Mysore", tripId: "MYS", startDate: "2026-10-24", endDate: "2026-10-28", currency: "INR", splitMembers }, traveller: { name: "Alice", travellerId: "ALICE" }, pass: { id: "PASS", tripWide: true, allowAnyPayer: true, allowEdit: true, recentLimit: 10 }, members, recent: [] } : {};
    return { ok: true, json: async () => ({ ok: true, data }) };
  };
  Object.defineProperty(win.document, "currentScript", { configurable: true, value: win.document.querySelector('script[src^="standalone.js"]') });
  win.eval(loader);
  return { dom, win, document: win.document, requests, errors, async start() { await tick(); if (win.document.getElementById("sharedMyTripApp")) { win.eval(source); await tick(); await tick(); } }, dispose() { observers.forEach(observer => observer.disconnect()); win.close(); } };
}
test("Separate app has a non-overlapping scope, unique identity and a rupee-badge maskable icon", () => {
  const quick = JSON.parse(fs.readFileSync(path.join(built, "manifest.webmanifest"), "utf8")), main = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  const quickManifest = "https://sutartech.github.io/QuickExpense/manifest.webmanifest", mainManifest = "https://sutartech.github.io/MyTrip/manifest.webmanifest";
  const ownScope = new URL(quick.scope, quickManifest), mainScope = new URL(main.scope, mainManifest);
  assert.ok(!ownScope.pathname.startsWith(mainScope.pathname) && !mainScope.pathname.startsWith(ownScope.pathname));
  assert.notEqual(new URL(quick.id, quickManifest).href, new URL(main.id, mainManifest).href);
  assert.equal(quick.name, "Quick Expense"); assert.equal(quick.display, "standalone");
  assert.ok(quick.icons.some(icon => icon.purpose === "maskable"));
  for (const name of ["quick-expense-icon-192.png", "quick-expense-icon-512.png", "quick-expense-maskable-512.png"]) {
    const bytes = fs.readFileSync(path.join(built, name));
    assert.equal(bytes.readUInt32BE(16), name.includes("192") ? 192 : 512); assert.equal(bytes.readUInt32BE(20), name.includes("192") ? 192 : 512);
  }
  assert.ok(!html.includes("<base "), "Own manifest/SW must resolve under the separate repository");
});
test("A separate app with no trip opens link recovery, never account login or nested MyTrip", async () => {
  const app = setup();
  try { await app.start(); assert.ok(app.document.querySelector("#restoreQuickExpenseLink")); assert.ok(app.document.querySelector("#accessScreen").classList.contains("hidden")); assert.equal(app.win.location.pathname, "/QuickExpense/index.html"); assert.ok(!app.document.querySelector("#separateAppInstall").hidden); assert.equal(app.errors.length, 0); }
  finally { app.dispose(); }
});
test("Existing saved quick link opens the separate app without login and gets its own saved trip", async () => {
  const app = setup({ saved: true, search: "?account=1" });
  try {
    await app.start(); assert.ok(app.document.querySelector("#quickExpenseForm"));
    assert.match(app.document.querySelector("#quickExpenseContent").textContent, /Mysore/);
    assert.equal(JSON.parse(app.win.localStorage.getItem(ownKey)).token, token);
    assert.equal(JSON.parse(app.win.localStorage.getItem(mainKey)).token, token);
    assert.ok(!app.requests.some(request => ["login", "getTrip", "listTrips"].includes(request.action)));
    assert.equal(app.win.location.pathname, "/QuickExpense/index.html"); assert.equal(app.errors.length, 0, app.errors.map(error => error.message).join("\n"));
  } finally { app.dispose(); }
});
test("Forgetting the separate trip link does not remove or reuse the main MyTrip link", async () => {
  const app = setup({ saved: true });
  try {
    await app.start(); app.document.querySelector("[data-quick-forget]").click(); await tick();
    assert.equal(JSON.parse(app.win.localStorage.getItem(ownKey)).enabled, false);
    assert.equal(JSON.parse(app.win.localStorage.getItem(mainKey)).token, token);
  } finally { app.dispose(); }
});
test("Standalone installation request is not reported as completed until Android's appinstalled event", async () => {
  const app = setup();
  try {
    await app.start(); let prompts = 0;
    const event = new app.win.Event("beforeinstallprompt", { cancelable: true }); event.prompt = async () => { prompts++; }; event.userChoice = Promise.resolve({ outcome: "accepted" });
    app.win.dispatchEvent(event); app.document.querySelector("#installSeparateApp").click(); await tick();
    assert.equal(prompts, 1); assert.match(app.document.querySelector("#separateInstallStatus").textContent, /Installation requested/);
    assert.equal(app.document.querySelector("#separateAppInstall").hidden, false);
    app.win.dispatchEvent(new app.win.Event("appinstalled")); assert.equal(app.document.querySelector("#separateAppInstall").hidden, true);
  } finally { app.dispose(); }
});
test("Already-running independent app does not show another install banner", async () => {
  const app = setup({ saved: true, standalone: true });
  try { await app.start(); assert.ok(app.document.querySelector("#quickExpenseForm")); assert.equal(app.document.querySelector("#separateAppInstall").hidden, true); assert.equal(app.document.querySelector(".quick-expense-install-card"), null); }
  finally { app.dispose(); }
});
test("Older main frontend is blocked safely rather than redirecting the independent app", async () => {
  const app = setup({ compatible: false });
  try { await app.start(); assert.equal(app.document.querySelector("#sharedMyTripApp"), null); assert.equal(app.document.querySelector("#separateAppNotice").hidden, false); assert.match(app.document.querySelector("#separateAppNotice").textContent, /Upload the supplied MyTrip FE/); assert.equal(app.win.location.pathname, "/QuickExpense/index.html"); }
  finally { app.dispose(); }
});
test("Separate worker never deletes the main MyTrip cache and does not cache account/trip responses", () => {
  const worker = fs.readFileSync(path.join(built, "sw.js"), "utf8");
  assert.ok(worker.includes('key.startsWith("mytrip-quick-separate-")')); assert.ok(!worker.includes('key.startsWith("mytrip-static-")'));
  assert.ok(!worker.includes("script.google.com")); assert.ok(!worker.includes("quickToken")); assert.ok(!worker.includes("credentials:"));
});
test("Bill scanner assets in the separate app still load from the existing MyTrip OCR installation", async () => {
  const app = setup({ saved: true });
  try {
    await app.start();
    app.document.querySelector("#quickExpenseForm [data-scan-bill]").click(); await tick();
    const parserScript = [...app.document.scripts].find(script => script.src.includes("receipt-parser.js"));
    assert.ok(parserScript); assert.equal(new URL(parserScript.src).pathname, "/MyTrip/receipt-parser.js");
    app.win.eval(fs.readFileSync(path.join(root, "receipt-parser.js"), "utf8")); parserScript.dispatchEvent(new app.win.Event("load")); await tick();
    const scannerScript = [...app.document.scripts].find(script => script.src.includes("receipt-scan.js"));
    assert.ok(scannerScript); assert.equal(new URL(scannerScript.src).pathname, "/MyTrip/receipt-scan.js");
    Object.defineProperty(app.document, "currentScript", { configurable: true, value: scannerScript });
    app.win.eval(fs.readFileSync(path.join(root, "receipt-scan.js"), "utf8")); scannerScript.dispatchEvent(new app.win.Event("load")); await tick();
    assert.ok(app.document.querySelector(".bill-scan-layer"));
    assert.ok(![...app.document.scripts].some(script => script.src.includes("tesseract")), "OCR engine stays lazy");
    app.win.MyTripReceiptScanner.cancel(); assert.equal(app.errors.length, 0);
  } finally { app.dispose(); }
});
test("A shared-link expense can include two family profiles and exclude the third", async () => {
  const app = setup({ saved: true, members: ["Family A", "Family B", "Family C"] });
  try {
    await app.start(); const form = app.document.querySelector("#quickExpenseForm");
    form.elements.amount.value = "300"; form.elements.label.value = "Dinner";
    form.querySelector('input[name="sharedUnit"][value="2"]').checked = false;
    form.dispatchEvent(new app.win.Event("submit", { bubbles: true, cancelable: true })); await tick();
    const request = app.requests.find(item => item.action === "quickAddExpense");
    assert.ok(request); assert.equal(request.record.sharedBy, "Family A|Family B");
    assert.equal(request.record.paidBy, "Family A"); assert.equal(request.record.amount, 300);
    assert.equal(request.quickToken, token); assert.equal(request.password, undefined);
  } finally { app.dispose(); }
});

test("Configured family groups exclude the payer family and preserve whole-family selection", async () => {
 const app=setup({saved:true,members:["A","A2","B","B2","C","C2"],splitMembers:"A+A2|B+B2|C+C2"});
 try {await app.start();const f=app.document.querySelector("#quickExpenseForm");
 assert.equal(f.querySelectorAll('[name="sharedUnit"]').length,3);
 f.elements.amount.value="100.01";f.elements.label.value="Two-family dinner";f.elements.paidBy.value="C";
 f.querySelector('[name="sharedUnit"][value="2"]').checked=false;
 f.dispatchEvent(new app.win.Event("change",{bubbles:true}));
 assert.match(f.querySelector('.quick-exact-shares').textContent,/50.01/);
 f.dispatchEvent(new app.win.Event("submit",{bubbles:true,cancelable:true}));await tick();
 const req=app.requests.find(r=>r.action==='quickAddExpense');
 assert.equal(req.record.sharedBy,"A|A2|B|B2");assert.equal(req.record.paidBy,"C");assert.equal(req.record.amount,100.01);
 }finally{app.dispose();}
});
