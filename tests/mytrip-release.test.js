"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const parser = require("../receipt-parser.js");
const root = path.resolve(__dirname, "..");
const backendSource = fs.readFileSync(path.join(root, "backend/Code.gs"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
function backend() { const context = vm.createContext({ console: { log() {}, warn() {}, error() {} } }); vm.runInContext(backendSource, context); return context; }
function frontendFunction(name, next) {
  const start = appSource.indexOf(`  function ${name}(`);
  const end = appSource.indexOf(`\n  ${next}`, start);
  assert.ok(start >= 0 && end > start, `Test extraction for ${name}`);
  return appSource.slice(start, end);
}
test("OCR chooses grand total, not tax, subtotal, cash or change", () => {
  const bill = parser.parse("SEA VIEW RESTAURANT\nInvoice No: A/129\nDate 25/10/2026\nSub total 1000.00\nCGST 25.00\nSGST 25.00\nGrand Total Rs. 1,050.00\nCash Tendered 2000\nChange 950");
  assert.equal(bill.amount, 1050); assert.equal(bill.vendor, "SEA VIEW RESTAURANT"); assert.equal(bill.date, "2026-10-25"); assert.equal(bill.invoiceNumber, "A/129"); assert.equal(bill.category, "Food");
});
test("OCR reads Indian grouped totals and labels on the previous line", () => { assert.equal(parser.parse("TOTAL\n₹1,23,456.75").amount, 123456.75); });
test("OCR does not invent a total from item prices, phone numbers or tax", () => { assert.equal(parser.parse("CAFE\nPhone 9988776655\n2 coffee 200.00\nSub total 200.00\nGST 10.00").amount, ""); });
test("OCR ignores Total items / quantity", () => { assert.equal(parser.parse("CAFE\nTotal items 4\nTotal 500.00").amount, 500); });
test("OCR validates leap days and invalid calendar dates", () => { assert.equal(parser.isoDate(2026, 2, 31), ""); assert.equal(parser.isoDate(2024, 2, 29), "2024-02-29"); assert.equal(parser.parse("Date 31/02/2026").date, ""); });
test("OCR handles numeric and month-name dates", () => { assert.equal(parser.parse("Date 2026-10-25").date, "2026-10-25"); assert.equal(parser.parse("25 Oct 2026").date, "2026-10-25"); assert.equal(parser.parse("October 25, 2026").date, "2026-10-25"); });
test("OCR warns about ambiguous dates and multiple totals", () => { const result = parser.parse("05/06/2026\nTotal 90\nNet payable 95"); assert.equal(result.date, "2026-06-05"); assert.ok(result.warnings.some(message => /DD\/MM/.test(message))); assert.ok(result.warnings.some(message => /More than one/.test(message))); });
test("Foreign amounts are flagged, not converted", () => { const result = parser.parse("CAFE\nTOTAL USD 100.50"); assert.equal(result.amount, 100.5); assert.equal(result.foreignCurrency, true); assert.match(result.warnings.join(" "), /NOT been converted/); });
test("Invoice and GST details can be retained without raw OCR text", () => { const result = parser.parse("HOTEL\nBill No: K/88\nGSTIN 29ABCDE1234F1Z5\nTOTAL 2500"); assert.equal(result.gstin, "29ABCDE1234F1Z5"); const notes = parser.metadataNotes(result, false); assert.match(notes, /Invoice: K\/88/); assert.ok(!notes.includes("Bill text")); });
test("Empty and malicious-looking OCR stays plain data", () => { assert.equal(parser.parse("").amount, ""); assert.equal(parser.parse("<script>alert(1)</script>\nTOTAL 45").amount, 45); assert.ok(parser.parse("").warnings.length); });
test("Permission levels enforce view, add, own-edit and full-edit independently", () => { const context = backend(); for (const [level, view, add, own, all] of [["hidden", false, false, false, false], ["view", true, false, false, false], ["add", true, true, false, false], ["edit-own", true, true, true, false], ["full", true, true, true, true]]) { const result = context.featureCapabilities_(level); assert.equal(result.view, view); assert.equal(result.add, add); assert.equal(result.editOwn, own); assert.equal(result.editAll, all); } });
test("Edit own uses server-stamped account identity, not a spoofed display name", () => { const context = backend(); context.recordsForTrip = () => [{ id: "E1", createdByAccount: "traveller:OTHER", createdBy: "Alice" }]; context.getTravellerAccount = () => ({ travellerId: "ALICE", name: "Alice" }); assert.throws(() => context.assertTravellerMayEditRecord_("T1", "Expenses", "E1", "ALICE", { editExpenseOwn: true, editExpenseAll: false }), /created with this traveller account/); });
test("Edit own accepts the correct account and rejects view/add-only", () => { const context = backend(); context.recordsForTrip = () => [{ id: "E1", createdByAccount: "traveller:ALICE" }]; assert.equal(context.assertTravellerMayEditRecord_("T1", "Expenses", "E1", "ALICE", { editExpenseOwn: true }), true); assert.throws(() => context.assertTravellerMayEditRecord_("T1", "Expenses", "E1", "ALICE", { editExpenseOwn: false }), /view\/add only/); });
test("Full edit still works; editing cannot change the owner stamp", () => { const context = backend(); assert.equal(context.assertTravellerMayEditRecord_("T1", "Expenses", "E1", "ALICE", { editExpenseAll: true }), true); const part = backendSource.slice(backendSource.indexOf("function updateRecord("), backendSource.indexOf("function deleteRecord(")); assert.ok(!part.includes("'createdByAccount'")); });
test("Quick-link history limits support 5 / 10 / 50 / All", () => { const context = backend(); assert.equal(context.quickExpenseRecentLimit_(5), 5); assert.equal(context.quickExpenseRecentLimit_(10), 10); assert.equal(context.quickExpenseRecentLimit_(50), 50); assert.equal(context.quickExpenseRecentLimit_("ALL"), 0); const rows = Array.from({ length: 60 }, (_, index) => ({ id: String(index), quickPassId: "P1", createdAt: new Date(2026, 0, index + 1).toISOString() })); context.recordsForTrip = () => rows; for (const [limit, count] of [[5, 5], [10, 10], [50, 50], ["ALL", 60]]) assert.equal(context.quickExpenseRecent_({ id: "P1", tripId: "T1", recentLimit: limit }).length, count); });
test("Quick-link info exposes configured families without changing the existing link", () => { const context = backend(); context.quickExpensePassForToken_ = () => ({ pass: { id: "P1", tripId: "T1" }, trip: { tripId: "T1", splitMembers: "A+A2|B+B2|C+C2" }, account: {}, tripWide: true }); context.quickExpenseSafePass_ = () => ({}); context.quickExpenseMemberNames_ = () => ["A", "A2", "B", "B2", "C", "C2"]; context.quickExpenseRecent_ = () => []; const info = context.getQuickExpenseInfo("test-link"); assert.equal(info.trip.splitMembers, "A+A2|B+B2|C+C2"); assert.equal(info.members.length, 6); });
test("Quick form selects whole configured families and keeps non-sharing profiles out", () => { const context = vm.createContext({ quickExpenseInfo: { trip: { splitMembers: "A+A2|B+B2|C+C2" }, members: ["A", "A2", "B", "B2", "C", "C2", "Observer"] } }); vm.runInContext(frontendFunction("quickExpenseShareGroups", "function quickExpenseShareFields"), context); assert.deepEqual(Array.from(context.quickExpenseShareGroups(), group => Array.from(group)), [["A", "A2"], ["B", "B2"], ["C", "C2"]]); context.quickExpenseInfo.trip.splitMembers = ""; assert.equal(context.quickExpenseShareGroups().length, 7); });
test("One two-family expense changes allocated shares, not trip spending; settlement payments are separate", () => { const state = { data: { trip: { splitMembers: "A+A2|B+B2|C+C2" }, expenses: [{ amount: 3000, paidBy: "A", sharedBy: "" }, { amount: 1200, paidBy: "A", sharedBy: "A|A2|B|B2" }], settlements: [] } }; const context = vm.createContext({ state, visibleTripMembers: () => ["A", "A2", "B", "B2", "C", "C2"].map(name => ({ name })) }); vm.runInContext(frontendFunction("splitGroups", "function expenseShareUnits") + frontendFunction("expenseShareUnits", "function openSplitMembers") + frontendFunction("settleUpPlan", "function settleShown"), context); let result = context.settleUpPlan(), byName = Object.fromEntries(result.people.map(person => [person.name, person])); assert.equal(result.total, 4200); assert.equal(byName["A family"].owed, 1600); assert.equal(byName["B family"].owed, 1600); assert.equal(byName["C family"].owed, 1000); assert.deepEqual(Array.from(result.transfers, row => [row.from, row.to, row.amount]).sort(), [["B family", "A family", 1600], ["C family", "A family", 1000]]); state.data.settlements = [{ fromPerson: "B family", toPerson: "A family", amount: 1600 }, { fromPerson: "C family", toPerson: "A family", amount: 1000 }]; result = context.settleUpPlan(); assert.equal(result.total, 4200); assert.equal(result.transfers.length, 0); });
test("A no-login receipt cannot escape its active link or allowed history", () => { const context = backend(); context.quickExpensePassForToken_ = () => ({ pass: { id: "P1" }, trip: { tripId: "T1" } }); context.quickExpenseRecent_ = () => [{ id: "visible" }]; context.getExpenseReceiptForScan_ = (tripId, id) => ({ tripId, id }); assert.throws(() => context.quickGetExpenseReceipt_("token", "hidden"), /outside the history/); assert.equal(context.quickGetExpenseReceipt_("token", "visible").tripId, "T1"); context.quickExpensePassForToken_ = () => { throw new Error("Link paused"); }; assert.throws(() => context.quickGetExpenseReceipt_("token", "visible"), /Link paused/); });
test("Saved receipt reads are trip-bound and reject missing / oversized files", () => { const context = backend(); let checked = false; context.assertRecordBelongsToTrip = () => { checked = true; }; context.recordsForTrip = () => [{ id: "E1", receiptFileId: "F1" }]; context.DriveApp = { getFileById: id => { assert.equal(id, "F1"); return { isTrashed: () => false, getSize: () => 7000000 }; } }; assert.throws(() => context.getExpenseReceiptForScan_("T1", "E1"), /too large/); assert.equal(checked, true); context.recordsForTrip = () => [{ id: "E1" }]; assert.throws(() => context.getExpenseReceiptForScan_("T1", "E1"), /No stored receipt/); });
test("Lightweight sticky refresh does not fetch expense/photo lists", () => { const context = backend(), calls = []; context.permissionsFor = () => ({ viewExpenses: true, viewItinerary: true, viewExperiences: true, viewPlaces: true, viewTravellers: true }); context.getTripRow = () => ({ tripId: "T1", name: "Trip", adminHash: "secret" }); context.recordsForTrip = (sheet) => { calls.push(sheet); return []; }; const result = context.getTripSectionBundle_("T1", "administrator", "", "sticky"); assert.ok(result.trip); assert.equal(result.trip.adminHash, undefined); assert.deepEqual(calls.sort(), ["StickyNoteDiary", "StickyNotes"]); });
test("Hidden sections are explicitly purged during section refresh", () => { const context = backend(); context.permissionsFor = () => ({ viewExpenses: false, viewItinerary: false, viewExperiences: false, viewPlaces: false, viewTravellers: false }); context.getTripRow = () => ({ tripId: "T1", budget: 9000 }); context.recordsForTrip = () => []; const result = context.getTripSectionBundle_("T1", "traveller", "A", "photos"); assert.equal(result.trip.budget, undefined); assert.equal(result.expenses.length, 0); assert.equal(result.itinerary.length, 0); assert.equal(result.members.length, 0); });
test("Offline payloads omit account passwords", () => { const context = vm.createContext({}); vm.runInContext(frontendFunction("safeQueuedPayload", "function queueOffline"), context); const result = context.safeQueuedPayload({ tripId: "T1", password: "secret", pin: "1234", adminPin: "1111", administratorSecret: "hidden", record: { amount: 99 } }); assert.equal(result.password, undefined); assert.equal(result.pin, undefined); assert.equal(result.record.amount, 99); });
test("Offline changes are bound to their original trip/account or exact quick token", () => { const state = { authenticated: true, data: { trip: { tripId: "T1" } }, accountUsername: "Alice" }; const context = vm.createContext({ state, quickExpenseToken: "active-token", quickExpenseInfo: {} }); vm.runInContext(frontendFunction("queueEntryForCurrentAccess", "async function flushOfflineQueue"), context); assert.equal(context.queueEntryForCurrentAccess({ action: "addExpense", owner: "alice", payload: { tripId: "T1" } }), true); assert.equal(context.queueEntryForCurrentAccess({ action: "addExpense", owner: "bob", payload: { tripId: "T1" } }), false); assert.equal(context.queueEntryForCurrentAccess({ action: "addExpense", owner: "alice", payload: { tripId: "T2" } }), false); assert.equal(context.queueEntryForCurrentAccess({ action: "quickAddExpense", payload: { quickToken: "other-token" } }), false); assert.equal(context.queueEntryForCurrentAccess({ action: "quickAddExpense", payload: { quickToken: "active-token" } }), true); });
test("OCR is not included in the initial HTML or service-worker precache", () => { const html = fs.readFileSync(path.join(root, "index.html"), "utf8"), sw = fs.readFileSync(path.join(root, "sw.js"), "utf8"); assert.ok(!html.includes('src="receipt-scan.js')); assert.ok(!html.includes('src="ocr/')); assert.ok(!sw.slice(0, sw.indexOf('self.addEventListener("install"')).includes('"./ocr/')); });
test("Quick Expense keeps its own installed identity and does not hijack normal MyTrip", () => { const normal = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8")), quick = JSON.parse(fs.readFileSync(path.join(root, "quick-expense.webmanifest"), "utf8")); assert.notEqual(normal.id, quick.id); assert.match(quick.start_url, /quick-expense-home=1/); const line = appSource.split("\n").find(row => row.includes("const quickExpenseHomeLaunch")); assert.ok(!line.includes("standaloneDisplayMode")); assert.match(appSource, /Link your Quick Expense icon/); });
test("New shared links use the Quick Expense page/manifest and preserve their private token", () => {
  for (const baseURI of ["https://example.test/MyTrip/", "https://example.test/MyTrip/index.html"]) {
    const context = vm.createContext({ URL, quickExpenseStandalone: false, document: { baseURI }, apiUrlReady: () => true, apiUrl: "https://script.google.com/macros/s/TEST/exec" });
    vm.runInContext(frontendFunction("quickExpensePublicLink", "function quickExpenseDefaultExpiry"), context);
    const link = new URL(context.quickExpensePublicLink("a".repeat(43)));
    assert.equal(link.pathname, "/MyTrip/quick-expense/index.html");
    assert.equal(link.searchParams.get("quick-expense"), "1");
    assert.equal(link.searchParams.get("api"), "https://script.google.com/macros/s/TEST/exec");
    assert.equal(new URLSearchParams(link.hash.slice(1)).get("qe"), "a".repeat(43));
    assert.ok(!link.searchParams.has("qe"), "Bearer token must stay out of server request parameters");
  }
});
test("Saved links and app-style windows never masquerade as confirmed Android installation", () => {
  for (const saved of [null, { token: "a".repeat(43) }]) {
    const context = vm.createContext({ URLSearchParams, quickExpenseStandalone: false, readQuickExpenseShortcut: () => saved, quickExpenseToken: "a".repeat(43), standaloneDisplayMode: () => true, quickExpenseInstallHelp: false, location: { search: "", pathname: "/MyTrip/quick-expense/index.html" }, esc: String });
    vm.runInContext(frontendFunction("quickExpenseInstallCard", "function useQuickExpenseBranding"), context);
    const card = context.quickExpenseInstallCard({ trip: { name: "Mysore" } });
    assert.match(card, /data-quick-install/); assert.match(card, /Add second home icon/);
    assert.ok(!/is installed|✓ Installed/.test(card));
  }
  const source = appSource.slice(appSource.indexOf("async function installQuickExpenseOnPhone"), appSource.indexOf('addEventListener("appinstalled"'));
  assert.ok(!source.includes("standaloneDisplayMode"), "Existing standalone windows must still reach second-icon setup");
});
test("Only username is remembered persistently; sessions use tab storage", () => { assert.ok(appSource.includes("sessionStorage.setItem(sessionKey")); assert.ok(!appSource.includes("localStorage.setItem(sessionKey")); assert.ok(appSource.includes("localStorage.removeItem(sessionKey)")); });

test("Paise allocations conserve spending and settle tiny balances exactly", () => {
 const state = { data: { trip: { splitMembers: "A+A2|B+B2|C+C2" }, expenses: [{amount:100,paidBy:"C",sharedBy:""}], settlements:[] } };
 const context=vm.createContext({state,visibleTripMembers:()=>["A","A2","B","B2","C","C2"].map(name=>({name}))});
 vm.runInContext(frontendFunction("splitGroups","function expenseShareUnits")+frontendFunction("expenseShareUnits","function openSplitMembers")+frontendFunction("settleUpPlan","function settleShown"),context);
 let plan=context.settleUpPlan(), people=Object.fromEntries(plan.people.map(p=>[p.lead,p]));
 assert.equal(people.A.owed,33.34);assert.equal(people.B.owed,33.33);assert.equal(people.C.owed,33.33);
 assert.equal(Math.round(plan.people.reduce((s,p)=>s+p.owed,0)*100),10000);
 state.data.expenses=[{amount:0.01,paidBy:"C",sharedBy:"A|A2"}];plan=context.settleUpPlan();
 assert.equal(plan.total,0.01);assert.equal(plan.transfers.length,1);assert.equal(plan.transfers[0].amount,0.01);
 state.data.settlements=[{fromPerson:"A",toPerson:"C",amount:0.01}];assert.equal(context.settleUpPlan().transfers.length,0);
});
test("Sharing buckets count each bill once regardless of payer and selected filters", () => {
 const expenses=[{amount:3000,sharedBy:"",paidBy:"A"},{amount:1200.01,sharedBy:"A|A2|B|B2",paidBy:"C"},{amount:900,sharedBy:"B|B2",paidBy:"B"}];
 const state={expenseSharingFilter:"some",data:{trip:{splitMembers:"A+A2|B+B2|C+C2"},expenses}};
 const context=vm.createContext({state,shareUnits:()=>[["A","A2"],["B","B2"],["C","C2"]]});
 vm.runInContext(frontendFunction("expenseShareUnits","function openSplitMembers"),context);
 let totals=context.expenseSharingTotals();assert.equal(totals.all.cents,300000);assert.equal(totals.some.cents,120001);assert.equal(totals.one.cents,90000);
 assert.equal(Object.values(totals).reduce((sum,b)=>sum+b.count,0),3);
 assert.equal(Object.values(totals).reduce((sum,b)=>sum+b.cents,0),510001);
 assert.equal(context.filterExpensesBySharing(expenses).length,1);assert.equal(context.filterExpensesBySharing(expenses)[0].paidBy,"C");
 for(const kind of ["all","some","one"])assert.equal(context.filterExpensesBySharing(expenses,kind).length,1);
 assert.equal(context.filterExpensesBySharing(expenses,"any").length,3);
 assert.equal(context.filterExpensesBySharing(expenses.filter(e=>e.paidBy==="A"),"some").length,0);
 expenses.push({amount:0.02,sharedBy:"B",paidBy:"A"});totals=context.expenseSharingTotals();assert.equal(totals.one.cents,90002);
});
