"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, ".."), frontend = fs.readFileSync(path.join(root, "app.js"), "utf8"), backend = fs.readFileSync(path.join(root, "backend/Code.gs"), "utf8");
function server() {
  const trip = { tripId: "T1", name: "Journey", startDate: "2026-10-24", endDate: "2026-10-28", photoUrl: "https://example.test/cover.jpg", photoFileId: "cover-file" }, photos = Array.from({ length: 6 }, (_, i) => ({ id: "P" + i, tripId: i === 5 ? "T2" : "T1", fileId: "file-" + i })), writes = [], reads = [];
  const c = vm.createContext({ console: { error() {} }, Utilities: { base64Encode: () => "dGlueQ==" } }); vm.runInContext(backend, c);
  c.getTripRow = id => { assert.equal(id, "T1"); return { ...trip }; };
  c.recordsForTrip = (table, id) => { assert.equal(table, "TripPhotos"); return photos.filter(photo => photo.tripId === id); };
  c.ensureTripColumn = () => {}; c.updateCellById = (table, id, field, value) => { writes.push({ field, value }); trip[field] = value; };
  c.afterMutation = () => {}; c.autoLogActivity_ = () => {}; c.getTripBundle = () => ({ trip: { ...trip } }); c.withLock = fn => fn(); c.jsonResponse = value => value;
  c.verifyAccess = () => "administrator"; c.permissionsFor = () => ({ viewExpenses: false, printReports: false });
  c.DriveApp = { getFileById(id) { reads.push(id); return { isTrashed: () => false, getMimeType: () => "image/jpeg", getThumbnail: () => ({ getContentType: () => "image/jpeg", getBytes: () => [1] }) }; } };
  const request = (action, extra = {}) => c.doPost({ postData: { contents: JSON.stringify({ action, tripId: "T1", pin: "test", ...extra }) } });
  return { c, trip, writes, reads, request };
}
test("Administrator saves one shared header selection and print default in existing trip columns", () => {
  const { trip, request } = server();
  const result = request("updateTrip", { trip: { headerCollageEnabled: "TRUE", headerPhotoIds: JSON.stringify(["gallery:P3", "gallery:P1", "trip-cover", "gallery:P0"]), headerCollagePrintDefault: "TRUE" } });
  assert.equal(result.ok, true, result.error); assert.equal(trip.headerCollageEnabled, "TRUE"); assert.equal(trip.headerCollagePrintDefault, "TRUE");
  assert.deepEqual(JSON.parse(result.data.headerPhotoIds), ["gallery:P3", "gallery:P1", "trip-cover", "gallery:P0"]);
});
test("Invalid, duplicate, excessive and cross-trip photo selections cannot partially update trip settings", () => {
  const { request, writes } = server();
  for (const ids of [["gallery:P5"], ["gallery:P0", "gallery:P0"], Array(6).fill("gallery:P1"), ["https://drive.google.com/file/d/private/view"], []]) {
    const result = request("updateTrip", { trip: { headerCollageEnabled: "TRUE", headerPhotoIds: ids } }); assert.equal(result.ok, false);
  }
  assert.equal(request("updateTrip", { trip: { headerCollagePrintDefault: "invalid" } }).ok, false); assert.equal(writes.length, 0);
});
test("Travellers can view the selected shared header but cannot change it or retrieve unselected photos", () => {
  const { c, trip, request, writes, reads } = server(); Object.assign(trip, { headerCollageEnabled: "TRUE", headerPhotoIds: '["gallery:P1"]' }); c.verifyAccess = () => "traveller";
  assert.equal(request("updateTrip", { trip: { headerCollageEnabled: "FALSE" } }).ok, false); assert.equal(writes.length, 0);
  assert.equal(request("getTripHeaderThumbnails", { photoIds: ["P0"] }).ok, false); assert.equal(reads.length, 0);
  assert.equal(request("getTripHeaderThumbnails", { photoIds: ["P1"] }).ok, true); assert.deepEqual(reads, ["file-1"]);
  trip.headerCollageEnabled = "FALSE"; assert.equal(request("getTripHeaderThumbnails", { photoIds: ["P1"] }).ok, false);
  c.verifyAccess = () => { throw Error("Invalid access"); }; assert.equal(request("getTripHeaderThumbnails", { photoIds: ["P1"] }).ok, false);
});
function front() {
  const state = { data: { trip: { tripId: "T1", photoUrl: "https://example.test/cover.jpg", headerCollageEnabled: "TRUE", headerPhotoIds: '["gallery:P3","gallery:P1","trip-cover","gallery:P0"]', headerCollagePrintDefault: "TRUE" }, photos: Array.from({ length: 4 }, (_, i) => ({ id: "P" + i, photoUrl: "https://example.test/" + i + ".jpg", caption: 'Photo <' + i + '>' })) } };
  const c = vm.createContext({ state, URL, document: { addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} }, isAdmin: () => false, canViewExpenses: () => false, tripSettingOn: value => value === true || value === "TRUE", esc: value => String(value).replaceAll("<", "&lt;").replaceAll('"', "&quot;") });
  vm.runInContext(frontend.slice(frontend.indexOf("  function tripCollagePhotoChoices("), frontend.indexOf("  const expensePrintThumbnailCache")), c);
  return { c, state };
}
test("Header is independent of expense access and preserves the saved photo order with escaped captions", () => {
  const { c, state } = front(); assert.equal(c.expensePrintPhotoChoices().length, 0); assert.equal(c.tripHeaderCollagePhotos().length, 4);
  let html = c.renderTripHeaderCollage(); assert.equal((html.match(/<img /g) || []).length, 4); assert.ok(html.indexOf("/3.jpg") < html.indexOf("/1.jpg")); assert.ok(html.includes("Photo &lt;3>")); assert.ok(!html.includes("Choose header photos"));
  state.data.photos = state.data.photos.filter(photo => photo.id !== "P1"); assert.equal(c.tripHeaderCollagePhotos().length, 3);
  state.data.trip.headerCollageEnabled = "FALSE"; assert.equal(c.renderTripHeaderCollage(), "");
});
test("Printing can use the exact shared header or a separate photo choice, and can omit photos", () => {
  const { c, state } = front(); c.canViewExpenses = () => true;
  assert.equal(c.expensePrintPhotoSettings().source, "header"); let html = c.renderExpensePrintCollage(); assert.ok(html.indexOf("/3.jpg") < html.indexOf("/1.jpg")); assert.equal((html.match(/<img /g) || []).length, 4);
  c.saveExpensePrintPhotoSettings({ enabled: true, source: "custom", ids: ["gallery:P2"] }); assert.equal((c.renderExpensePrintCollage().match(/<img /g) || []).length, 1); assert.ok(c.renderExpensePrintCollage().includes("/2.jpg"));
  c.saveExpensePrintPhotoSettings({ enabled: false, source: "header", ids: [] }); assert.equal(c.renderExpensePrintCollage(), "");
  assert.ok(frontend.includes('document.body.dataset.print === "full" && tripSettingOn(state.data.trip.headerCollagePrintDefault)'));
  state.data.trip.headerCollageEnabled = "FALSE"; assert.equal(c.renderTripPhotoPrintCollage(c.tripHeaderCollagePhotos()), "");
});

test("A backend upgraded during the same session unlocks the header despite stale ping capabilities", () => {
  const c = vm.createContext({ state: { demoMode: false }, backendInfo: { version: "4.32.2" }, backendVersion: "4.32.5" });
  const versionStart = frontend.indexOf("  function backendVersionAtLeast("), versionEnd = frontend.indexOf("  function backendUpgradeError(", versionStart);
  vm.runInContext(frontend.slice(versionStart, versionEnd), c);
  const start = frontend.indexOf("  function tripPhotoFeatureReady("), end = frontend.indexOf("  function showTripHeaderPhotoSettings(", start); vm.runInContext(frontend.slice(start, end), c);
  assert.equal(c.tripPhotoFeatureReady("tripHeaderCollage", "4.32.5"), true);
  assert.equal(c.tripPhotoFeatureReady("printPhotoThumbnails", "4.32.4"), true);
  c.backendVersion = "4.32.2"; assert.equal(c.tripPhotoFeatureReady("tripHeaderCollage", "4.32.5"), false);
  c.state.tripHeaderCollageAvailable = true; assert.equal(c.tripPhotoFeatureReady("tripHeaderCollage", "4.32.5"), true);
});
test("Trip normalization retains photo capabilities and section refresh updates them", () => {
  const c = vm.createContext({ state: { sectionLoadedAt: {} }, uniqById: rows => rows, setProfilePhotos() {} });
  const start = frontend.indexOf("  function normalize("), end = frontend.indexOf("  let financialMutationRevision", start); vm.runInContext(frontend.slice(start, end), c);
  c.state.data = c.normalize({ trip: { tripId: "T1" }, tripHeaderCollage: true, printPhotoThumbnails: true });
  assert.equal(c.state.tripHeaderCollageAvailable, true); assert.equal(c.state.printPhotoThumbnailsAvailable, true);
  c.mergeTripSection({ tripHeaderCollage: false, printPhotoThumbnails: false, section: "photos" }); assert.equal(c.state.tripHeaderCollageAvailable, false);
  c.state.data = c.normalize({ trip: { tripId: "T2" } }); assert.equal(c.state.tripHeaderCollageAvailable, false);
});
