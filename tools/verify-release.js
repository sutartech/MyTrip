"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const required = [
  "index.html", "app.css", "app.js", "sw.js", "config.js",
  "manifest.webmanifest", "quick-expense.webmanifest", "quick-expense-install.html",
  "quick-expense/index.html", "quick-expense/install.html", "quick-expense/manifest.webmanifest",
  "receipt-parser.js", "receipt-scan.js", "ocr/vendor/tesseract.min.js", "ocr/vendor/worker.min.js",
  "ocr/core/tesseract-core-lstm.wasm.js", "ocr/core/tesseract-core-simd-lstm.wasm.js",
  "ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js", "ocr/lang/eng.traineddata.gz",
  "favicon.svg", "icon-192.png", "icon-512.png", "quick-expense-icon-192.png", "quick-expense-icon-512.png"
];
let failed = false;
function check(ok, message) { console.log(`${ok ? "✓" : "✗"} ${message}`); if (!ok) failed = true; }
required.forEach(file => {
  const full = path.join(root, file);
  check(fs.existsSync(full) && fs.statSync(full).size > 0, `${file} exists and is not empty`);
});
for (const file of ["app.js", "sw.js", "config.js", "receipt-parser.js", "receipt-scan.js"]) {
  try { new vm.Script(read(file), { filename: file }); check(true, `${file} syntax`); }
  catch (error) { check(false, `${file} syntax: ${error.message}`); }
}
for (const file of ["manifest.webmanifest", "quick-expense.webmanifest", "quick-expense/manifest.webmanifest"]) {
  try { JSON.parse(read(file)); check(true, `${file} JSON`); }
  catch (error) { check(false, `${file} JSON: ${error.message}`); }
}
const app = read("app.js"), html = read("index.html"), sw = read("sw.js"), config = read("config.js");
const fe = (app.match(/frontendVersion\\s*=\\s*"([^"]+)"/) || [])[1];
const be = (app.match(/requiredBackendVersion\\s*=\\s*"([^"]+)"/) || [])[1];
check(Boolean(fe), `frontend version is declared (${fe || "missing"})`);
check(Boolean(be), `minimum backend compatibility version is declared (${be || "missing"})`);
check(html.includes(`app.js?v=${fe}`) && html.includes(`app.css?v=${fe}`), "HTML cache-bust versions match frontend");
check(sw.includes(`mytrip-static-v${fe}`) && sw.includes(`app.js?v=${fe}`) && sw.includes(`app.css?v=${fe}`), "service-worker cache and asset versions match frontend");
check(config.includes("https://script.google.com/macros/s/") && config.includes("/exec"), "Google Apps Script endpoint is configured");
const quick = JSON.parse(read("quick-expense/manifest.webmanifest")), normal = JSON.parse(read("manifest.webmanifest"));
check(quick.id !== normal.id, "Quick Expense has a separate PWA identity");
check(quick.start_url.includes("quick-expense-home=1"), "Quick Expense starts at its no-login form");
check(new URL(quick.scope, "https://test.example/MyTrip/quick-expense/manifest.webmanifest").pathname === "/MyTrip/quick-expense/", "Quick Expense has its own narrow scope");
const child = require("child_process");
check(child.spawnSync(process.execPath, ["tools/sync-quick-expense-entry.js", "--check"], { cwd: root, stdio: "inherit" }).status === 0, "Quick Expense HTML entry matches the main shell");
try { require("zlib").gunzipSync(fs.readFileSync(path.join(root, "ocr/lang/eng.traineddata.gz"))); check(true, "English OCR model is a valid gzip asset"); }
catch { check(false, "English OCR model is corrupt"); }
for (const file of ["quick-expense/install.html", "quick-expense-install.html"]) {
  for (const [, code] of read(file).matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)) {
    try { new vm.Script(code, { filename: file }); }
    catch (error) { check(false, `${file} inline script: ${error.message}`); }
  }
}
const tests = [
  "tests/mytrip-release.test.js", "tests/receipt-scan-dom.test.js", "tests/separate-quick-app.test.js",
  "tests/entry-transparency.test.js", "tests/settlement-print.test.js", "tests/settlement-reopen.test.js"
];
check(tests.every(file => fs.existsSync(path.join(root, file))), "all configured regression test files exist");
if (failed) process.exit(1);
console.log("\\nFrontend release verification passed. Apps Script backend source is external to this repository and is not syntax-tested here.");
