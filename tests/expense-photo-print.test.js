"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8"), css = fs.readFileSync(path.join(__dirname, "../app.css"), "utf8");
function fixture() {
  const storage = new Map(), state = { data: { trip: { tripId: "T1", photoUrl: "https://drive.google.com/file/d/cover-id/view" }, photos: Array.from({ length: 7 }, (_, index) => ({ id: "photo-" + index, photoUrl: `https://drive.google.com/file/d/file-${index}/view`, caption: "Memory " + index })) } };
  const context = vm.createContext({ state, URL, document: { addEventListener() {} }, tripSettingOn: value => value === true || value === "TRUE", printAreaDirty: false, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, canViewExpenses: () => true, esc: value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;") });
  vm.runInContext(source.slice(source.indexOf("  function tripCollagePhotoChoices("), source.indexOf("  async function prepareExpensePrintPhotos(")), context);
  return { state, storage, context };
}
test("Default expense header uses at most five distinct 360px Drive thumbnails", () => {
  const { context: c } = fixture(), html = c.renderExpensePrintCollage();
  assert.equal((html.match(/<img /g) || []).length, 5); assert.equal((html.match(/sz=w360/g) || []).length, 5);
  assert.ok(!html.includes("w1600")); assert.match(html, /loading="eager"/);
});
test("Cover and gallery copies of the same Drive photo appear only once", () => {
  const { state, context: c } = fixture(); state.data.photos.unshift({ id: "same", photoUrl: "https://drive.google.com/thumbnail?id=cover-id&sz=w1600" });
  assert.equal(c.expensePrintPhotoChoices().length, 8);
  assert.equal(c.expensePrintPhotoChoices().filter(photo => photo.url.includes("cover-id")).length, 1);
});
test("Selection, disabled state and empty selection are remembered for this trip only", () => {
  const { state, context: c } = fixture(); c.saveExpensePrintPhotoSettings({ enabled: true, ids: ["gallery:photo-2", "gallery:photo-4"] });
  assert.equal((c.renderExpensePrintCollage().match(/<img /g) || []).length, 2);
  assert.ok(c.renderExpensePrintCollage().includes("file-2") && !c.renderExpensePrintCollage().includes("cover-id"));
  c.saveExpensePrintPhotoSettings({ enabled: false, ids: ["gallery:photo-2"] }); assert.equal(c.renderExpensePrintCollage(), "");
  c.saveExpensePrintPhotoSettings({ enabled: true, ids: [] }); assert.equal(c.renderExpensePrintCollage(), "");
  state.data.trip.tripId = "T2"; assert.equal(c.expensePrintPhotoSettings().ids.length, 5);
});
test("Fewer available photos do not get duplicated; missing photos leave no empty collage", () => {
  const { state, context: c } = fixture(); state.data.photos = []; assert.equal((c.renderExpensePrintCollage().match(/<img /g) || []).length, 1);
  state.data.trip.photoUrl = ""; assert.equal(c.renderExpensePrintCollage(), "");
});
test("Captions stay escaped and unsupported URL schemes are excluded", () => {
  const { state, context: c } = fixture(); state.data.trip.photoUrl = "javascript:bad()";
  state.data.photos = [{ id: "x", photoUrl: "https://example.test/photo.jpg", caption: '<img onerror="bad()">' }];
  assert.equal(c.expensePrintPhotoChoices().length, 1); assert.ok(!c.renderExpensePrintCollage().includes('alt="<img')); assert.ok(c.renderExpensePrintCollage().includes("&lt;img"));
});
test("Preference changes still work when browser storage is unavailable", () => {
  const { context: c } = fixture(); c.localStorage = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
  c.saveExpensePrintPhotoSettings({ enabled: false, ids: [] }); assert.equal(c.renderExpensePrintCollage(), "");
});
test("Collage is scoped to expense printing and uses normal document flow only once", () => {
  assert.ok(source.includes('document.body.dataset.print === "expenses" ? renderExpensePrintCollage() :'));
  assert.ok(css.includes("body[data-print=expenses] .print-cover-photo{display:none}"));
  assert.ok(css.includes("height:26mm")); assert.ok(css.includes("break-after:avoid;position:static"));
});
test("Photo readiness waits for load/error and removes failed tiles before printing", async () => {
  const events = [], tiles = [], images = [true, false].map((ok, index) => {
    const listeners = {}, tile = { removed: false, remove() { this.removed = true; } }; tiles.push(tile);
    return { complete: false, naturalWidth: 0, listeners, addEventListener: (name, fn) => { listeners[name] = fn; events.push(name); }, removeEventListener() {}, closest: () => tile, success: ok, index };
  });
  const collage = { querySelector: () => tiles.some(tile => !tile.removed), remove() { this.removed = true; } };
  const c = vm.createContext({ Promise, setTimeout, clearTimeout, state: { demoMode: true }, toast() {}, $: () => collage });
  const start = source.indexOf("  async function prepareExpensePrintPhotos("), end = source.indexOf('\n  document.addEventListener("change"', start); vm.runInContext(source.slice(start, end), c);
  let done = false; const pending = c.prepareExpensePrintPhotos(images).then(() => { done = true; });
  await Promise.resolve(); assert.equal(done, false);
  images[0].listeners.load(); images[1].listeners.error(); await pending;
  assert.equal(tiles[0].removed, false); assert.equal(tiles[1].removed, true); assert.equal(done, true);
});
test("Failed public links use authenticated small thumbnails and reuse the in-memory copy", async () => {
  let calls = 0;
  const c = vm.createContext({ Promise, setTimeout, clearTimeout, state: { demoMode: false, data: { trip: { tripId: "T1" } } }, backendInfo: { printPhotoThumbnails: true }, tripPhotoFeatureReady: () => true, authPayload: value => ({ ...value, tripId: "T1", pin: "test" }), api: async (action, payload) => { calls++; assert.equal(action, "getPrintPhotoThumbnails"); assert.equal(payload.tripId, "T1"); assert.deepEqual(Array.from(payload.photoIds), ["P1"]); return { photos: [{ photoId: "P1", type: "image/jpeg", data: "dGlueQ==" }] }; }, toast() { assert.fail("Valid fallback should load"); }, $: () => ({ querySelector: () => true }) });
  const start = source.indexOf("  const expensePrintThumbnailCache"), end = source.indexOf('\n  document.addEventListener("change"', start); vm.runInContext(source.slice(start, end), c);
  const image = () => {
    const listeners = {}, tile = { remove() { assert.fail("Loaded thumbnail must remain"); } };
    return { complete: true, naturalWidth: 0, dataset: { printDriveId: "D1", printPhotoId: "P1" }, addEventListener(name, fn) { listeners[name] = fn; }, removeEventListener(name) { delete listeners[name]; }, closest: () => tile, set src(value) { this.url = value; this.complete = false; queueMicrotask(() => { const fn = listeners[value.startsWith("data:") ? "load" : "error"]; if (fn) fn(); }); } };
  };
  const first = image(); await c.prepareExpensePrintPhotos([first]); assert.match(first.url, /^data:image\/jpeg;base64,/);
  await c.prepareExpensePrintPhotos([image()]); assert.equal(calls, 1);
  assert.ok(source.includes('img.hasAttribute("data-print-thumbnail")'));
});
const backend = fs.readFileSync(path.join(__dirname, "../backend/Code.gs"), "utf8");
function thumbnailServer() {
  const reads = [], c = vm.createContext({ Utilities: { base64Encode: bytes => Buffer.from(bytes).toString("base64") }, console: { error() {} } }); vm.runInContext(backend, c);
  c.getTripRow = () => ({ tripId: "T1", photoFileId: "cover", photoUrl: "https://drive.google.com/file/d/private/view" });
  c.recordsForTrip = (table, tripId) => { assert.equal(table, "TripPhotos"); assert.equal(tripId, "T1"); return [{ id: "P1", fileId: "gallery" }, { id: "link", photoUrl: "https://drive.google.com/file/d/private/view" }]; };
  c.DriveApp = { getFileById(id) { reads.push(id); return { isTrashed: () => false, getMimeType: () => "image/jpeg", getThumbnail: () => ({ getContentType: () => "image/jpeg", getBytes: () => [1, 2, 3] }) }; } };
  return { c, reads };
}
test("Backend reads only uploaded photos belonging to the requested trip, without opening arbitrary Drive links", () => {
  const { c, reads } = thumbnailServer(); const result = c.getPrintPhotoThumbnails_("T1", ["trip-cover", "P1", "other-trip-photo", "link"]);
  assert.deepEqual(reads, ["cover", "gallery"]); assert.equal(result.photos[0].data, "AQID"); assert.match(result.photos[2].error, /not found/); assert.match(result.photos[3].error, /external link/);
  assert.throws(() => c.getPrintPhotoThumbnails_("T1", Array(6).fill("P1")), /at most five/);
});
test("Backend omits unavailable and oversized thumbnails and never fetches or changes originals", () => {
  const { c } = thumbnailServer(); c.DriveApp.getFileById = () => ({ isTrashed: () => false, getMimeType: () => "image/jpeg", getThumbnail: () => null });
  assert.match(c.getPrintPhotoThumbnails_("T1", ["P1"]).photos[0].error, /not generated/);
  c.DriveApp.getFileById = () => ({ isTrashed: () => false, getMimeType: () => "image/jpeg", getThumbnail: () => ({ getContentType: () => "image/jpeg", getBytes: () => new Array(1000001) }) });
  assert.match(c.getPrintPhotoThumbnails_("T1", ["P1"]).photos[0].error, /small printable/);
  const fn = backend.slice(backend.indexOf("function getPrintPhotoThumbnails_(")); assert.ok(!/getBlob|setSharing|setTrashed|createFile/.test(fn));
});
test("Actual thumbnail request requires both authenticated trip access and expense printing permission", () => {
  const { c, reads } = thumbnailServer(); c.jsonResponse = value => value; c.verifyAccess = () => { throw Error("Invalid trip access"); }; c.permissionsFor = () => ({ viewExpenses: true, printReports: true });
  const request = { postData: { contents: JSON.stringify({ action: "getPrintPhotoThumbnails", tripId: "T1", pin: "test", photoIds: ["P1"] }) } };
  assert.equal(c.doPost(request).ok, false); assert.equal(reads.length, 0);
  c.verifyAccess = () => "traveller";
  for (const permissions of [{ viewExpenses: false, printReports: true }, { viewExpenses: true, printReports: false }, { viewExpenses: true }]) { c.permissionsFor = () => permissions; assert.equal(c.doPost(request).ok, false); }
  assert.equal(reads.length, 0); c.permissionsFor = () => ({ viewExpenses: true, printReports: true }); assert.equal(c.doPost(request).ok, true); assert.deepEqual(reads, ["gallery"]);
});
