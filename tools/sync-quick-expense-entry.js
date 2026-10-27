"use strict";
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const target = path.join(root, "quick-expense/index.html");
let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const replacements = [
  [
    "<head>",
    "<head>\n  <base href=\"../\">"
  ],
  [
    "<title>MyTrip · Plan, share &amp; split trips together</title>",
    "<title>Quick Expense · MyTrip · No login</title>"
  ],
  [
    "href=\"favicon.svg\"",
    "href=\"quick-expense-icon.svg\""
  ],
  [
    "href=\"manifest.webmanifest\"",
    "href=\"quick-expense/manifest.webmanifest\""
  ],
  [
    "href=\"apple-touch-icon.png\"",
    "href=\"quick-expense-icon-192.png\""
  ],
  [
    "name=\"apple-mobile-web-app-title\" content=\"MyTrip\"",
    "name=\"apple-mobile-web-app-title\" content=\"Quick Expense\""
  ]
];
for (const [from, to] of replacements) {
  if (!html.includes(from)) throw new Error("Main shell marker missing: " + from);
  html = html.replace(from, to);
}
if (process.argv.includes("--check")) {
  if (fs.readFileSync(target, "utf8") !== html) {
    console.error("Quick Expense shell is out of date. Run node tools/sync-quick-expense-entry.js.");
    process.exitCode = 1;
  } else console.log("Quick Expense shell matches the main shell.");
} else fs.writeFileSync(target, html);
