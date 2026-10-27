"use strict";
// Build a tiny second install shell from the SAME MyTrip HTML and shared code.
const fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error("Pass an absolute destination directory outside the MyTrip runtime folder.");
const main = process.env.MYTRIP_PREVIEW_MAIN_BASE || "https://sutartech.github.io/MyTrip/", version = "4.67.14";
const source = fs.readFileSync(path.join(root, "index.html"), "utf8");
let html = source
  .replace("<title>MyTrip · Plan, share &amp; split trips together</title>", "<title>Quick Expense · MyTrip · No login</title>")
  .replace('href="favicon.svg"', 'href="quick-expense-icon.svg"')
  .replace('href="apple-touch-icon.png"', 'href="quick-expense-icon-192.png"')
  .replace('name="apple-mobile-web-app-title" content="MyTrip"', 'name="apple-mobile-web-app-title" content="Quick Expense"')
  .replace(`href="app.css?v=${version}"`, `href="${main}app.css?v=${version}"`)
  .replace("</head>", `  <link rel="stylesheet" href="standalone.css?v=${version}">\n  <meta name="referrer" content="no-referrer">\n</head>`)
  .replace(`<script defer src="config.js?v=${version}"></script>`, `<script defer src="${main}config.js?v=${version}"></script>`)
  .replace(`<script defer src="app.js?v=${version}"></script>`, `<script defer src="standalone.js?v=${version}" data-main-base="${main}" data-version="${version}"></script>`)
  .replace('<a class="brand" href="./"><i>↗</i> mytrip</a>', '<a class="brand" href="./index.html?quick-expense-home=1"><img src="quick-expense-icon.svg" alt=""><span>Quick Expense</span></a>')
  .replace('<a class="quick-expense-login-link" href="./?account=1">Account sign in</a>', `<a class="quick-expense-login-link" href="${main}" target="_blank" rel="noopener">Open MyTrip ↗</a>`)
  .replace('<main id="quickExpenseContent">', '<p class="separate-app-notice" id="separateAppNotice" role="alert" hidden></p><main id="quickExpenseContent">')
  .replace('</div></main>', '</div></main><details class="separate-app-install" id="separateAppInstall"><summary>Install Quick Expense / home-screen help</summary><div class="separate-install-body"><img src="quick-expense-icon.svg" alt="MyTrip icon with small rupee badge"><div><strong>Install Quick Expense</strong><span>Separate from MyTrip · no account login</span></div><button type="button" id="installSeparateApp">Install Quick Expense</button><p id="separateInstallStatus" role="status" aria-live="polite">Open this address in Chrome and confirm the ₹ Quick Expense installation.</p></div></details>');
if (!html.includes('data-version="' + version + '"') || html.includes('src="app.js?v=')) throw new Error("Main shell/version changed. Update the generator.");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "index.html"), html);
const manifest = { name: "Quick Expense", short_name: "Quick Expense", description: "MyTrip expense entry without account login. Active Administrator-approved shared link required.", id: "./", start_url: "./index.html?quick-expense-home=1", scope: "./", display: "standalone", orientation: "any", background_color: "#F6FBFA", theme_color: "#0E817A", icons: [{ src: "quick-expense-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "quick-expense-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "quick-expense-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] };
fs.writeFileSync(path.join(output, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
for (const name of ["standalone.js", "standalone.css", "sw.js", "INSTALL.md"]) fs.copyFileSync(path.join(__dirname, "separate-quick-app", name), path.join(output, name));
for (const name of ["quick-expense-icon.svg", "quick-expense-icon-192.png", "quick-expense-icon-512.png"]) fs.copyFileSync(path.join(root, name), path.join(output, name));
(async () => {
  const sharp = process.env.MYTRIP_BUILD_DEPENDENCIES ? require(path.join(process.env.MYTRIP_BUILD_DEPENDENCIES, "sharp")) : require("sharp");
  const centered = await sharp(path.join(root, "quick-expense-icon-512.png")).resize(384, 384).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: "#102a43" } }).composite([{ input: centered, left: 64, top: 64 }]).png().toFile(path.join(output, "quick-expense-maskable-512.png"));
  console.log("Separate Quick Expense app prepared at " + output);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
