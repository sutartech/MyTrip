"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
function code(name, next, asynchronous = false) {
  const start = source.indexOf(`  ${asynchronous ? "async " : ""}function ${name}(`), end = source.indexOf(`\n  ${next}`, start);
  assert.ok(start >= 0 && end > start, `Extract ${name}`); return source.slice(start, end);
}
function balances() {
  const state = { data: { trip: { splitMembers: "A|B|C" }, expenses: [{ id: "bill", amount: 300, paidBy: "C" }], settlements: [{ id: "p1", fromPerson: "A", toPerson: "C", amount: 100 }, { id: "p2", fromPerson: "B", toPerson: "C", amount: 100 }] } };
  const context = vm.createContext({ state, visibleTripMembers: () => ["A", "B", "C"].map(name => ({ name })) });
  vm.runInContext(code("splitGroups", "function expenseShareUnits") + code("expenseShareUnits", "function openSplitMembers") + code("settleUpPlan", "function settleShown"), context);
  return { state, context };
}
test("A forgotten bill reopens only its new shares and retains every previous repayment", () => {
  const { state, context } = balances(); assert.equal(context.settleUpPlan().transfers.length, 0);
  state.data.expenses.push({ id: "late", amount: 60, paidBy: "A" });
  const plan = context.settleUpPlan(); assert.equal(plan.total, 360);
  assert.deepEqual(Array.from(plan.transfers, row => [row.from, row.to, row.amount]).sort(), [["B", "A", 20], ["C", "A", 20]]);
  assert.equal(state.data.settlements.length, 2);
});
test("Reducing an already-settled bill calculates refunds, including after deleting the final bill", () => {
  const { state, context } = balances(); state.data.expenses[0].amount = 150;
  assert.deepEqual(Array.from(context.settleUpPlan().transfers, row => [row.from, row.to, row.amount]), [["C", "A", 50], ["C", "B", 50]]);
  state.data.expenses = [];
  assert.deepEqual(Array.from(context.settleUpPlan().transfers, row => [row.from, row.to, row.amount]), [["C", "A", 100], ["C", "B", 100]]);
  assert.equal(context.settleUpPlan().total, 0);
});
test("A former non-member payer still owes refunds after their last expense is removed", () => {
  const { state, context } = balances(); state.data.expenses = [];
  state.data.settlements = ["A", "B", "C"].map(name => ({ fromPerson: name, toPerson: "Former payer", amount: 100 }));
  const plan = context.settleUpPlan(); assert.equal(plan.transfers.length, 3);
  assert.equal(plan.people.reduce((sum, person) => sum + person.net, 0), 0);
  assert.ok(plan.transfers.every(row => row.from === "Former payer" && row.amount === 100));
});
function saving(api) {
  const state = { accessRole: "administrator", accountUsername: "admin", travellerId: "", data: { trip: { tripId: "T1" }, settlements: [] } };
  const context = vm.createContext({ state, financialMutationRevision: 0, api, authPayload: () => ({ tripId: "T1", username: "admin" }), mergeTripSection: latest => { state.data.settlements = latest.settlements; } });
  vm.runInContext(code("persistVerifiedSettlement", "async function saveForm", true), context);
  return { state, context };
}
test("A settlement is confirmed only after the persisted payment can be read back", async () => {
  const record = { id: "P1", fromPerson: "A", toPerson: "C", amount: 100 }, calls = [];
  const { state, context } = saving(async (action, payload) => { calls.push(action); return action === "addSettlement" ? payload.record : { settlements: [{ ...record, reference: "BANK-123" }] }; });
  const saved = await context.persistVerifiedSettlement({ dataset: {} }, record);
  assert.deepEqual(calls, ["addSettlement", "getTrip"]); assert.equal(saved.reference, "BANK-123"); assert.equal(state.data.settlements.length, 1);
});
test("A failed read-back does not mark a missing payment settled", async () => {
  const { state, context } = saving(async action => action === "addSettlement" ? {} : { settlements: [] });
  await assert.rejects(context.persistVerifiedSettlement({ dataset: {} }, { id: "P1", fromPerson: "A", toPerson: "C", amount: 100 }), /did not return a matching saved settlement/);
  assert.equal(state.data.settlements.length, 0);
});
test("Retry after a network failure reuses the same payment ID and cannot add a second row", async () => {
  const rows = new Map(), ids = []; let reads = 0;
  const { context } = saving(async (action, payload) => {
    if (action === "addSettlement") { ids.push(payload.record.id); if (!rows.has(payload.record.id)) rows.set(payload.record.id, { ...payload.record }); return payload.record; }
    if (!reads++) throw new Error("network"); return { settlements: [...rows.values()] };
  });
  const form = { dataset: {} }, payment = { id: "first", fromPerson: "A", toPerson: "C", amount: 100 };
  await assert.rejects(context.persistVerifiedSettlement(form, payment), /could not be reloaded/);
  await context.persistVerifiedSettlement(form, { ...payment, id: "new-generated-id" });
  assert.deepEqual(ids, ["first", "first"]); assert.equal(rows.size, 1);
});
test("An older section response cannot erase a repayment saved while the request was in flight", async () => {
  let resolve, merges = 0;
  const state = { tab: "expenses", accessRole: "administrator", accountUsername: "admin", travellerId: "", sectionLoadedAt: {}, data: { trip: { tripId: "T1" }, settlements: [] } };
  const context = vm.createContext({ state, financialMutationRevision: 0, sectionRequest: "", apiUrlReady: () => true, navigator: { onLine: true }, api: () => new Promise(done => { resolve = done; }), authPayload: () => ({}), document: { body: { classList: { add() {}, remove() {} } } }, mergeTripSection: () => { merges++; state.data.settlements = []; }, render() {}, hydrateShell() {}, updatePrintArea() {}, window: { scrollY: 0, scrollTo() {} } });
  vm.runInContext(code("loadTripSection", "function isAdmin", true), context);
  const pending = context.loadTripSection("expenses");
  context.financialMutationRevision++; state.data.settlements.push({ id: "saved-payment", amount: 100 }); resolve({ settlements: [] });
  await pending; assert.equal(merges, 0); assert.equal(state.data.settlements[0].id, "saved-payment");
});
test("Reopening a cached trip reloads real repayment history before showing Up to date", async () => {
  const actions = [], phases = [], paid = { id: "settled", amount: 100 };
  const state = { accountUsername: "admin", accessRole: "administrator", travellerId: "", tab: "expenses", data: null };
  const cached = { meta: { role: "administrator", loginMode: "admin" }, data: { trip: { tripId: "T1" }, settlements: [] } };
  const context = vm.createContext({ state, financialMutationRevision: 0, readCachedTrip: () => cached, closeModal() {}, openTrip: async data => { assert.equal(data._settlementSnapshotCached, true); state.data = data; }, syncPill: value => phases.push(value), api: async action => { actions.push(action); return action === "getTrip" ? { trip: { tripId: "T1" }, settlements: [paid] } : { expenses: [] }; }, mergeTripSection: data => { if (data.settlements) state.data.settlements = data.settlements; }, cacheTripBundle() {}, loadStickyNotes() {}, hydrateShell() {}, render() {}, updatePrintArea() {}, window: { scrollY: 0, scrollTo() {} }, toast: value => { throw new Error(value); }, navigator: { onLine: true } });
  vm.runInContext(code("openListedTrip", "/** Administrator:", true), context);
  await context.openListedTrip("T1", "test", false, "administrator"); await Promise.resolve();
  assert.deepEqual(actions, ["getTrip"]); assert.equal(state.data.settlements[0].id, "settled"); assert.ok(phases.includes("done"));
});
