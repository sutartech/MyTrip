"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.resolve(__dirname, ".."), backend = fs.readFileSync(path.join(root, "backend/Code.gs"), "utf8"), frontend = fs.readFileSync(path.join(root, "app.js"), "utf8");
function server() {
  const tables = { CashLoans: [], CashReturns: [], Expenses: [{ id: "expense", tripId: "T1", amount: 300 }], Settlements: [] }, logs = [];
  const context = vm.createContext({ console: { log() {}, warn() {}, error() {} }, Utilities: { formatDate: () => "2026-11-01" }, Session: { getScriptTimeZone: () => "Asia/Kolkata" } });
  vm.runInContext(backend, context);
  context.objectsFromSheet = name => (tables[name] || []).map(row => ({ ...row }));
  context.ensureSheet_ = () => {};
  context.appendObject = (name, row) => { if (!tables[name]) tables[name] = []; tables[name].push({ ...row }); };
  context.writeRowById = (name, id, row) => { const index = tables[name].findIndex(item => item.id === id); assert.ok(index >= 0); tables[name][index] = { ...row }; };
  context.afterMutation = (...args) => logs.push(args);
  context.withLock = fn => fn(); context.jsonResponse = value => value;
  context.verifyAccess = () => "traveller";
  context.permissionsFor = () => ({ viewExpenses: true, addExpense: true, editExpenseOwn: true });
  context.stickyNoteAccessLevel = () => "view"; context.autoLogActivity_ = () => {};
  return { context, tables, logs };
}
const loan = (overrides = {}) => ({ id: "L1", lender: "Ravi", borrower: "Sarada", amount: 2000, borrowedOn: "2026-10-25", method: "Cash", createdByAccount: "traveller:SAR", ...overrides });
const payment = (overrides = {}) => ({ id: "R1", loanId: "L1", amount: 500, paidOn: "2026-10-26", method: "Cash", ...overrides });
test("Borrowing and partial/final returns are persisted separately from trip spending", () => {
  const { context: c, tables } = server(); c.addCashLoan("T1", loan()); c.addCashReturn("T1", payment());
  assert.equal(c.cashReturnedCents_("T1", "L1"), 50000);
  c.addCashReturn("T1", payment({ id: "R2", amount: 1500 })); assert.equal(c.cashReturnedCents_("T1", "L1"), 200000);
  assert.equal(tables.Expenses.length, 1); assert.equal(tables.Expenses[0].amount, 300); assert.equal(tables.Settlements.length, 0);
});
test("A return cannot exceed the outstanding borrowing, including after another return", () => {
  const { context: c } = server(); c.addCashLoan("T1", loan()); c.addCashReturn("T1", payment());
  assert.throws(() => c.addCashReturn("T1", payment({ id: "R2", amount: 1500.01 })), /exceeds the outstanding/);
  c.addCashReturn("T1", payment({ id: "R2", amount: 1500 }));
  assert.throws(() => c.addCashReturn("T1", payment({ id: "R3", amount: 0.01 })), /exceeds the outstanding/);
});
test("Borrowing and return retries reuse IDs without double-counting rows", () => {
  const { context: c, tables } = server(); c.addCashLoan("T1", loan()); c.addCashLoan("T1", loan()); c.addCashReturn("T1", payment()); c.addCashReturn("T1", payment());
  assert.equal(tables.CashLoans.length, 1); assert.equal(tables.CashReturns.length, 1);
  assert.throws(() => c.addCashLoan("T2", loan()), /another trip/);
  assert.throws(() => c.addCashReturn("T2", payment()), /another trip/);
});
test("Cross-trip borrowing references cannot be used to record or edit a return", () => {
  const { context: c } = server(); c.addCashLoan("T1", loan());
  assert.throws(() => c.addCashReturn("T2", payment()), /not found in the selected trip/);
  assert.throws(() => c.updateCashLoan_("T2", "L1", loan(), "admin"), /not found/);
});
test("Corrections cannot reduce borrowing below returns or move it after an existing return", () => {
  const { context: c, tables } = server(); c.addCashLoan("T1", loan()); c.addCashReturn("T1", payment());
  assert.throws(() => c.updateCashLoan_("T1", "L1", loan({ amount: 499 }), "admin"), /less than the returns/);
  assert.throws(() => c.updateCashLoan_("T1", "L1", loan({ borrowedOn: "2026-10-27" }), "admin"), /after an existing return/);
  c.updateCashLoan_("T1", "L1", loan({ amount: 1500, createdByAccount: "spoofed" }), "admin");
  assert.equal(tables.CashLoans[0].amount, 1500); assert.equal(tables.CashLoans[0].createdByAccount, "traveller:SAR");
});
test("Return correction excludes its original amount from the maximum and keeps its borrowing reference", () => {
  const { context: c, tables } = server(); c.addCashLoan("T1", loan()); c.addCashReturn("T1", payment());
  c.updateCashReturn_("T1", "R1", payment({ amount: 2000, loanId: "OTHER" }), "admin");
  assert.equal(tables.CashReturns[0].amount, 2000); assert.equal(tables.CashReturns[0].loanId, "L1");
  assert.throws(() => c.updateCashReturn_("T1", "R1", payment({ amount: 2000.01 }), "admin"), /exceeds/);
});
test("Dates and amounts reject invalid days, future transactions, extra decimals and self-borrowing", () => {
  const { context: c } = server();
  for (const row of [loan({ lender: "SARADA" }), loan({ amount: -1 }), loan({ amount: 1.001 }), loan({ borrowedOn: "2026-02-31" }), loan({ borrowedOn: "2026-11-02" })]) assert.throws(() => c.addCashLoan("T1", row));
  c.addCashLoan("T1", loan()); assert.throws(() => c.addCashReturn("T1", payment({ paidOn: "2026-10-24" })), /before the cash was borrowed/);
});
test("Actual mutation dispatch enforces expense permission and stamps the authenticated owner", () => {
  const { context: c, tables } = server();
  const request = record => ({ postData: { contents: JSON.stringify({ action: "addCashLoan", tripId: "T1", travellerId: "SAR", username: "sar", pin: "test", record }) } });
  c.permissionsFor = () => ({ viewExpenses: true, addExpense: false });
  let result = c.doPost(request(loan())); assert.equal(result.ok, false); assert.equal(tables.CashLoans.length, 0);
  c.permissionsFor = () => ({ viewExpenses: true, addExpense: true });
  result = c.doPost(request(loan({ createdByAccount: "administrator:spoof" }))); assert.equal(result.ok, true, result.error);
  assert.equal(tables.CashLoans[0].createdByAccount, "traveller:SAR");
});
test("Edit-own cash permissions reject someone else's loan and permit the authenticated owner", () => {
  const { context: c } = server(); c.addCashLoan("T1", loan());
  assert.equal(c.assertTravellerMayEditRecord_("T1", "CashLoans", "L1", "SAR", { editExpenseOwn: true }), true);
  assert.throws(() => c.assertTravellerMayEditRecord_("T1", "CashLoans", "L1", "OTHER", { editExpenseOwn: true }), /created with this traveller/);
});
test("Hidden expense access purges both cash collections during section refresh", () => {
  const { context: c } = server(); c.permissionsFor = () => ({ viewExpenses: false }); c.getTripRow = () => ({ tripId: "T1" });
  const data = c.getTripSectionBundle_("T1", "traveller", "SAR", "sticky"); assert.equal(data.cashLoans.length, 0); assert.equal(data.cashReturns.length, 0);
});
function front() {
  const state = { demoMode: true, data: { cashLoans: [loan()], cashReturns: [payment()], trip: { splitMembers: "Sarada|Ravi|Other" }, expenses: [{ amount: 300, paidBy: "Ravi" }], settlements: [] } };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const c = vm.createContext({ state, backendInfo: null, uniqById: rows => rows, canViewExpenses: () => true, canPrintReports: () => true, esc, displayDate: String, money: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }) });
  const start = frontend.indexOf("  function cashLedgerReady("), end = frontend.indexOf("  function cashLedgerContents(", start); vm.runInContext(frontend.slice(start, end), c);
  const printStart = frontend.indexOf("  function renderCashLoanPrint("), printEnd = frontend.indexOf('\n  document.addEventListener("toggle"', printStart); vm.runInContext(frontend.slice(printStart, printEnd), c);
  return { c, state };
}
test("Cash model and print show borrowed, returned and the exact remaining amount", () => {
  const { c, state } = front(); const model = c.cashLoanModel(); assert.equal(model.outstandingCents, 150000);
  let html = c.renderCashLoanPrint(); assert.match(html, /₹1,500.00/); assert.match(html, /Sarada owes Ravi/);
  state.data.cashReturns.push(payment({ id: "R2", amount: 1500 })); html = c.renderCashLoanPrint(); assert.match(html, /RETURNED FULLY/);
  state.data.cashLoans[0].note = "<script>bad</script>"; assert.ok(!c.renderCashLoanPrint().includes("<script>"));
});
test("Old backends are gated without blocking existing expense features", () => {
  const { c, state } = front(); state.demoMode = false; assert.equal(c.cashLedgerReady(), false); assert.equal(c.renderCashLoanPrint(), "");
  state.cashLedgerAvailable = true; assert.equal(c.cashLedgerReady(), true);
});
test("Cash mutations never enter the offline expense queue after a network failure", async () => {
  let queued = 0;
  const c = vm.createContext({ navigator: { onLine: true }, apiUrlReady: () => true, apiUrl: "test", QUEUEABLE: new Set(["updateRecord", "deleteRecord", "addExpense"]), inFlightAdds: new Map(), requestAt: async () => { throw new Error("Failed to fetch"); }, queueOffline: () => { queued++; return { queued: true }; }, setTimeout: () => {} });
  const start = frontend.indexOf("  async function api("), end = frontend.indexOf("\n  /* Offline queue", start); vm.runInContext(frontend.slice(start, end), c);
  for (const [action, payload] of [["addCashLoan", { record: { id: "L" } }], ["addCashReturn", { record: { id: "R" } }], ["updateRecord", { sheet: "CashLoans" }], ["deleteRecord", { sheet: "CashReturns" }]]) await assert.rejects(c.api(action, payload), /Failed to fetch/);
  assert.equal(queued, 0);
  c.navigator.onLine = false; await assert.rejects(c.api("addCashLoan", { record: { id: "L" } }), /internet connection/); assert.equal(queued, 0);
});
