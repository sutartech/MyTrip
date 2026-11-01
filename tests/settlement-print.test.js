"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../app.css"), "utf8");
function section(name, next) {
  const start = source.indexOf(`  function ${name}(`), end = source.indexOf(`\n  ${next}`, start);
  assert.ok(start >= 0 && end > start, `Extract ${name}`);
  return source.slice(start, end);
}
function fixture() {
  const names = ["A", "A2", "B", "B2", "C", "C2"];
  const state = { printPerson: "A", data: { trip: { name: "Print QA", splitMembers: "A+A2|B+B2|C+C2" }, expenses: [{ amount: 300, paidBy: "C" }], settlements: [] } };
  const access = { admin: true, expenses: true, print: true, shown: true };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const context = vm.createContext({ state, canPrintReports: () => access.print, canViewExpenses: () => access.expenses, isAdmin: () => access.admin, settleShown: () => access.shown, visibleTripMembers: () => names.map(name => ({ name })), esc, displayDate: value => value, money: new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }) });
  vm.runInContext(section("splitGroups", "function expenseShareUnits") + section("expenseShareUnits", "function openSplitMembers") + section("settleUpPlan", "function settleShown") + section("renderSettlementPrint", "function buildPrintArea"), context);
  return { state, access, context };
}
test("Printed pending transfers use the same actual settlement calculation as the screen", () => {
  const { context } = fixture(), plan = context.settleUpPlan(), html = context.renderSettlementPrint();
  assert.equal(plan.total, 300); assert.equal(plan.transfers.length, 2);
  for (const transfer of plan.transfers) assert.ok(html.includes(`<td>${transfer.from}</td><td>${transfer.to}</td><td>₹100.00</td><td><b>PENDING</b>`));
  assert.match(html, /Remaining payments<\/small><b>₹200.00/);
  assert.match(html, /No settlement payments have been recorded yet/);
  assert.match(html, /Entire trip · after recorded settlements/);
});
test("Partial payments print their receipt details and only leave the unpaid balance pending", () => {
  const { state, context } = fixture();
  state.data.settlements = [{ fromPerson: "A2", toPerson: "C2", amount: 40, paidOn: "2026-11-01", method: "UPI", reference: "UTR-123", settledBy: "Admin", note: "Part payment" }];
  const plan = context.settleUpPlan(), html = context.renderSettlementPrint();
  assert.equal(plan.total, 300); assert.equal(plan.transfers.find(row => row.from === "A family").amount, 60);
  assert.match(html, /Remaining payments<\/small><b>₹160.00/);
  for (const text of ["2026-11-01", "UPI", "UTR-123", "Confirmed by Admin", "Part payment", "SETTLED"]) assert.ok(html.includes(text));
  assert.match(html, /Still owes ₹60.00/); assert.match(html, /Repayments recorded<\/small><b>₹40.00/);
});
test("Fully settled reports show ALL SETTLED while preserving the payment history", () => {
  const { state, context } = fixture();
  state.data.settlements = [{ fromPerson: "A", toPerson: "C", amount: 100 }, { fromPerson: "B", toPerson: "C", amount: 100 }];
  const html = context.renderSettlementPrint();
  assert.match(html, /ALL SETTLED/); assert.match(html, /No pending payments/);
  assert.match(html, /Remaining payments<\/small><b>₹0.00/);
  assert.match(html, /Total repayments recorded/); assert.match(html, /2 payments/);
  state.data.settlements.pop();
  assert.ok(!context.renderSettlementPrint().includes("ALL SETTLED"), "Undoing a recorded payment reopens the balance");
});
test("Print respects expense permission, report permission and hidden settlement visibility", () => {
  const { access, context } = fixture();
  access.expenses = false; assert.equal(context.renderSettlementPrint(), "");
  access.expenses = true; access.print = false; assert.equal(context.renderSettlementPrint(), "");
  access.print = true; access.admin = false; access.shown = false; assert.equal(context.renderSettlementPrint(), "");
  access.shown = true; assert.match(context.renderSettlementPrint(), /Who owes whom/);
  access.shown = false; access.admin = true; assert.match(context.renderSettlementPrint(), /Who owes whom/);
});
test("Settlement print escapes payment metadata and keeps dated history in order", () => {
  const { state, context } = fixture();
  state.data.settlements = [{ fromPerson: "A", toPerson: "C", amount: 10, paidOn: "2026-11-02", reference: "<script>bad</script>", method: "<UPI>", note: "<img src=x onerror=bad()>", settledBy: "<admin>" }, { fromPerson: "B", toPerson: "C", amount: 20, paidOn: "2026-11-01" }];
  const html = context.renderSettlementPrint();
  assert.ok(!html.includes("<script>") && !html.includes("<img"));
  for (const text of ["&lt;script&gt;", "&lt;UPI&gt;", "&lt;img", "&lt;admin&gt;"]) assert.ok(html.includes(text));
  assert.ok(html.indexOf("<td>2026-11-01</td>") < html.indexOf("<td>2026-11-02</td>"));
});
test("Selected-family and paise shares stay exact in the printed outstanding total", () => {
  const { state, context } = fixture();
  state.data.expenses = [{ amount: 100.01, paidBy: "C", sharedBy: "A|B" }];
  state.data.settlements = [{ fromPerson: "A", toPerson: "C", amount: 0.01 }];
  const plan = context.settleUpPlan(), html = context.renderSettlementPrint();
  assert.equal(plan.people.find(person => person.lead === "A").owed, 50.01);
  assert.equal(plan.people.find(person => person.lead === "B").owed, 50);
  assert.match(html, /Trip expenses<\/small><b>₹100.01/);
  assert.match(html, /Remaining payments<\/small><b>₹100.00/);
});
test("Empty trips do not falsely claim that a payment has been settled", () => {
  const { state, context } = fixture(); state.data.expenses = [];
  const html = context.renderSettlementPrint();
  assert.match(html, /No expenses or settlements recorded/); assert.ok(!html.includes("ALL SETTLED"));
});
test("Separate settlement print denies direct attempts to bypass visibility or print permission", () => {
  const { access, context } = fixture(), printed = [], messages = [];
  Object.assign(context, { state: context.state, document: { body: { dataset: {} } }, toast: message => messages.push(message), print: () => printed.push(true), buildPrintArea: () => {}, addEventListener: () => {}, removeEventListener: () => {}, setTimeout: () => {}, canViewItinerary: () => true });
  vm.runInContext(section("printReport", "async function refreshTrip"), context);
  access.admin = false; access.shown = false; context.printReport("settlements"); assert.equal(printed.length, 0);
  access.shown = true; access.print = false; context.printReport("settlements"); assert.equal(printed.length, 0);
  access.print = true; access.expenses = false; context.printReport("settlements"); assert.equal(printed.length, 0);
  access.expenses = true; context.printReport("settlements"); assert.equal(printed.length, 1);
  assert.equal(context.document.body.dataset.print, "settlements"); assert.equal(messages.length, 3);
});
test("Settlement is appended to the report and isolated from itinerary-only printing", () => {
  assert.ok(section("buildPrintArea", "function updatePrintArea").includes("${expenseSection}${renderSettlementPrint()}"));
  assert.match(source, /data-print="settlements"/);
  assert.match(css, /body\[data-print=itinerary\] \.print-settlements \{ display: none; \}/);
  assert.match(css, /body\[data-print=settlements\] \.print-expenses/);
  assert.match(css, /body\.print-plan-nowrap \.print-settlements \.print-expense-table td/);
});
