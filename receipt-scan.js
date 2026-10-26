/* Loaded only after Scan bill text is pressed. OCR runs in a local Web Worker. */
(function () {
  "use strict";
  let active = null, libraryPromise = null;
  const base = new URL("./", document.currentScript.src);
  function loadEngine() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => { script.remove(); libraryPromise = null; reject(new Error("The scanner files could not load. Reconnect and try again, or paste the bill text.")); }, 25000);
      script.src = new URL("ocr/vendor/tesseract.min.js", base).href;
      script.onload = () => { clearTimeout(timer); if (window.Tesseract) resolve(window.Tesseract); else { libraryPromise = null; reject(new Error("Scanner engine missing. Upload the complete ocr folder.")); } };
      script.onerror = () => { clearTimeout(timer); script.remove(); libraryPromise = null; reject(new Error("Scanner unavailable. Upload the complete ocr folder, then try again.")); };
      document.head.appendChild(script);
    });
    return libraryPromise;
  }
  function open(options = {}) {
    if (active) active();
    const previousFocus = document.activeElement, oldOverflow = document.body.style.overflow;
    const layer = document.createElement("div"); layer.className = "bill-scan-layer";
    layer.innerHTML = `<section class="bill-scan-card" role="dialog" aria-modal="true" aria-labelledby="billScanTitle" tabindex="-1"><header><div><span>MYTRIP · ON-DEVICE SCANNER</span><h2 id="billScanTitle">Scan bill text</h2><p>Read → review → copy into the expense. Nothing is saved automatically.</p></div><button type="button" data-scan-close aria-label="Close bill scanner">×</button></header><div class="bill-scan-body"><div class="bill-scan-source"><div class="bill-scan-image"><img alt="Bill to read" hidden><p data-empty>Choose a clear, upright bill photo</p></div><div class="bill-scan-tools"><label class="bill-choose">Choose bill photo<input type="file" accept="image/jpeg,image/png,image/webp" hidden data-scan-file></label><button type="button" data-scan-rotate>↻ Rotate</button><button type="button" data-scan-run>Scan photo</button></div><p class="bill-scan-privacy">Printed English bills · JPEG, PNG or WebP up to 20 MB. OCR runs on this device; no bill is sent to an OCR service. Scanner files load only when you scan. Your normal receipt upload is unchanged.</p><div class="bill-scan-progress" role="status" aria-live="polite"><progress max="100" value="0"></progress><b data-scan-status>Choose a photo, or paste text below.</b></div><p class="bill-scan-error" role="alert" hidden></p><label class="bill-scan-raw">Extracted / pasted bill text<textarea rows="7" maxlength="20000" data-scan-text placeholder="Extracted text appears here. You can also paste bill text from another app."></textarea></label><button class="bill-read-text" type="button" data-scan-parse>Read pasted / corrected text</button></div><form class="bill-scan-review"><div class="bill-review-heading"><span>YOUR REVIEW</span><h3>Suggested expense details</h3><p>Select only the fields you want to change. Always check the payable total.</p></div><div class="bill-scan-warnings" role="status"></div><label class="bill-scan-field"><span><input type="checkbox" data-use="description"> Description / vendor</span><input name="description" maxlength="180" placeholder="Vendor or description"></label><label class="bill-scan-field"><span><input type="checkbox" data-use="amount"> Payable amount</span><input name="amount" type="number" inputmode="decimal" min="0.01" max="99999999.99" step="0.01" placeholder="Check the bill total"><select data-total-candidates aria-label="Other detected totals" hidden></select></label><div class="bill-scan-pair"><label class="bill-scan-field"><span><input type="checkbox" data-use="date"> Bill date</span><input name="date" type="date"></label><label class="bill-scan-field"><span><input type="checkbox" data-use="category"> Category</span><select name="category"></select></label></div><details class="bill-scan-extra" open><summary>Invoice / GST details</summary><label>Vendor name<input name="vendor" maxlength="120"></label><div class="bill-scan-pair"><label>Invoice number<input name="invoiceNumber" maxlength="60"></label><label>GSTIN<input name="gstin" maxlength="20"></label></div><label class="bill-scan-check"><input type="checkbox" name="includeMetadata"> Add vendor / invoice / GST details to Notes</label><label class="bill-scan-check"><input type="checkbox" name="includeText"> Also keep extracted text in Notes (within the Notes limit)</label></details><p class="bill-scan-hint">Paid by and shared travellers are never guessed or changed by the scanner.</p><div class="bill-scan-actions"><button type="button" data-scan-close>Cancel</button><button type="submit" data-scan-apply>Use selected details</button></div><p class="bill-scan-save-note">Then use the expense form’s Save button to store the record.</p></form></div></section>`;
    document.body.appendChild(layer); document.body.style.overflow = "hidden";
    const card = layer.querySelector("section"), review = layer.querySelector("form"), raw = layer.querySelector("[data-scan-text]"), img = layer.querySelector("img"), status = layer.querySelector("[data-scan-status]"), errorBox = layer.querySelector(".bill-scan-error"), progress = layer.querySelector("progress");
    const inertNodes = [...document.querySelectorAll("#modal, #dashboard, #accountHub, #quickExpenseScreen")].map(node => [node, node.inert]); inertNodes.forEach(([node]) => { node.inert = true; });
    const categories = options.categories || ["Food", "Stay", "Travel", "Local travel", "Activities", "Shopping", "Other"];
    categories.forEach(value => review.elements.category.add(new Option(value, value)));
    let file = null, fileUrl = "", angle = 0, worker = null, closed = false, generation = 0, busy = false, stopTimer = 0, attachFile = false;
    const setError = message => { errorBox.textContent = message || ""; errorBox.hidden = !message; };
    const setBusy = value => { busy = value; layer.querySelectorAll("[data-scan-run],[data-scan-rotate],[data-scan-file],[data-scan-parse],[data-scan-apply]").forEach(button => { button.disabled = value; }); raw.disabled = value; };
    const close = () => {
      if (closed) return; closed = true; generation++; clearTimeout(stopTimer);
      if (worker) { worker.terminate().catch(() => {}); worker = null; }
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      document.removeEventListener("keydown", keyHandler, true); layer.remove(); document.body.style.overflow = oldOverflow;
      inertNodes.forEach(([node, inert]) => { node.inert = inert; });
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
      if (active === close) active = null;
    };
    active = close;
    function keyHandler(event) {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...card.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary")].filter(node => !node.hidden && node.offsetParent !== null);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === card)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      event.stopImmediatePropagation();
    }
    document.addEventListener("keydown", keyHandler, true);
    layer.querySelectorAll("[data-scan-close]").forEach(button => button.addEventListener("click", close));
    card.focus();
    function choose(next, attach = true) {
      if (!next || closed || busy) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) throw new Error("Use a JPEG, PNG or WebP bill photo. PDF and HEIC scans are not supported yet.");
      if (next.size > 20 * 1024 * 1024) throw new Error("Please choose a bill photo smaller than 20 MB.");
      file = next; attachFile = attach; angle = 0; if (fileUrl) URL.revokeObjectURL(fileUrl); fileUrl = URL.createObjectURL(file);
      img.src = fileUrl; img.hidden = false; img.style.transform = ""; layer.querySelector("[data-empty]").hidden = true;
      setError(""); status.textContent = "Photo ready. Tap Scan photo."; progress.value = 0;
    }
    layer.querySelector("[data-scan-file]").addEventListener("change", event => { try { choose(event.target.files[0]); } catch (error) { setError(error.message); } });
    layer.querySelector("[data-scan-rotate]").addEventListener("click", () => { if (!file) return; angle = (angle + 90) % 360; img.style.transform = `rotate(${angle}deg)`; status.textContent = "Rotation selected. Scan the photo again."; });
    function showSuggestions(text, confidence) {
      const suggestions = window.MyTripBillParser.parse(text);
      raw.value = suggestions.text;
      ["description", "amount", "date", "category", "vendor", "invoiceNumber", "gstin"].forEach(name => { review.elements[name].value = suggestions[name] ?? ""; });
      ["description", "amount", "date", "category"].forEach(name => { const value = suggestions[name]; const use = layer.querySelector(`[data-use="${name}"]`); use.checked = Boolean(value) && !(name === "amount" && suggestions.foreignCurrency) && options.canApply !== false; });
      const warnings = suggestions.warnings.slice();
      if (Number.isFinite(confidence) && confidence < 65) warnings.unshift("Low text recognition confidence. Review every field or retake the photo.");
      if (suggestions.date && options.tripStart && suggestions.date < options.tripStart || suggestions.date && options.tripEnd && suggestions.date > options.tripEnd) warnings.push("Bill date is outside this trip. Quick Expense links only accept dates within the trip.");
      const box = layer.querySelector(".bill-scan-warnings"); box.replaceChildren();
      warnings.forEach(message => { const p = document.createElement("p"); p.textContent = "! " + message; box.appendChild(p); });
      const candidates = layer.querySelector("[data-total-candidates]"); candidates.replaceChildren(); candidates.hidden = suggestions.totals.length < 2;
      suggestions.totals.forEach(item => candidates.add(new Option(`${item.amount.toFixed(2)} · ${item.line}`, String(item.amount))));
      review.elements.includeMetadata.checked = Boolean(suggestions.invoiceNumber || suggestions.gstin);
      status.textContent = suggestions.text ? `Text ready${Number.isFinite(confidence) ? ` · OCR confidence ${Math.round(confidence)}% (not field accuracy)` : ""}. Review the suggestions.` : "No readable text. Try another photo or paste the text.";
    }
    layer.querySelector("[data-total-candidates]").addEventListener("change", event => { review.elements.amount.value = event.target.value; });
    layer.querySelector("[data-scan-parse]").addEventListener("click", () => { setError(""); showSuggestions(raw.value); });
    async function imageForScan() {
      await img.decode();
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h || w * h > 60000000) throw new Error("This image is too large to scan safely. Choose a smaller bill photo.");
      const scale = Math.min(2, 2000 / w, 3600 / h);
      const width = Math.max(1, Math.round(w * scale)), height = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas"), swap = angle === 90 || angle === 270;
      canvas.width = swap ? height : width; canvas.height = swap ? width : height;
      const context = canvas.getContext("2d"); context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.translate(canvas.width / 2, canvas.height / 2); context.rotate(angle * Math.PI / 180); context.drawImage(img, -width / 2, -height / 2, width, height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png")); canvas.width = canvas.height = 0;
      if (!blob) throw new Error("This browser could not prepare the bill image."); return blob;
    }
    layer.querySelector("[data-scan-run]").addEventListener("click", async () => {
      if (!file || busy) { if (!file) setError("Choose a bill photo first, or paste its text below."); return; }
      const task = ++generation; setBusy(true); setError(""); status.textContent = "Loading the on-device scanner… First use may take longer."; progress.value = 3;
      let timeoutReject;
      const timeout = new Promise((_, reject) => { timeoutReject = reject; });
      stopTimer = setTimeout(() => timeoutReject(new Error("The scan took too long on this device. Try a smaller image or paste the bill text.")), 90000);
      const run = async () => {
        const engine = await loadEngine(); if (closed || generation !== task) return null;
        const prepared = await imageForScan();
        const current = await engine.createWorker("eng", 1, {
          workerPath: new URL("ocr/vendor/worker.min.js", base).href,
          corePath: new URL("ocr/core", base).href,
          langPath: new URL("ocr/lang", base).href,
          cachePath: "mytrip-receipt-eng-v1", cacheMethod: "write", workerBlobURL: false,
          logger: message => { if (closed || task !== generation) return; const reading = message.status === "recognizing text"; progress.value = reading ? 35 + Math.round(65 * Number(message.progress || 0)) : 15; status.textContent = reading ? `Reading the bill… ${Math.round(Number(message.progress || 0) * 100)}%` : "Preparing the OCR engine…"; }
        });
        if (closed || task !== generation) { await current.terminate(); return null; }
        worker = current;
        await worker.setParameters({ preserve_interword_spaces: "1" });
        return worker.recognize(prepared);
      };
      try {
        const result = await Promise.race([run(), timeout]);
        if (!closed && task === generation && result) { progress.value = 100; showSuggestions(result.data.text, result.data.confidence); }
      } catch (error) { if (!closed && task === generation) { generation++; setError(error.message || "Could not read this image. Try another photo or paste text."); status.textContent = "The expense has not been changed."; } }
      finally { clearTimeout(stopTimer); if (worker) { const current = worker; worker = null; current.terminate().catch(() => {}); } if (!closed) setBusy(false); }
    });
    review.addEventListener("submit", event => {
      event.preventDefault(); setError("");
      if (busy || options.canApply === false) return;
      const fields = Object.fromEntries(new FormData(review).entries()), selected = {};
      layer.querySelectorAll("[data-use]").forEach(input => { if (input.checked) selected[input.dataset.use] = fields[input.dataset.use]; });
      if ("amount" in selected && (!selected.amount || !Number.isFinite(Number(selected.amount)) || Number(selected.amount) <= 0)) return setError("Check the payable amount or untick that field.");
      if ("date" in selected && (!selected.date || !window.MyTripBillParser.isoDate(...selected.date.split("-")))) return setError("Choose a valid bill date or untick that field.");
      if ("date" in selected && (options.tripStart && selected.date < options.tripStart || options.tripEnd && selected.date > options.tripEnd)) return setError("The date must be within this trip for Quick Expense. Correct it or untick Bill date to keep your form’s date.");
      if ("description" in selected && !selected.description.trim()) return setError("Enter a description or untick that field.");
      if (fields.includeMetadata || fields.includeText) selected.notes = window.MyTripBillParser.metadataNotes({ ...(fields.includeMetadata ? fields : {}), text: raw.value }, Boolean(fields.includeText));
      if (!Object.keys(selected).length) return setError("Select at least one detail to copy, or Cancel.");
      try { options.onApply?.(selected, attachFile ? file : null); close(); } catch (error) { setError(error.message); }
    });
    if (options.canApply === false) { review.querySelector("[data-scan-apply]").hidden = true; layer.querySelector(".bill-scan-save-note").textContent = "View-only access: text can be read and copied, but expense fields cannot be changed."; }
    if (options.file) { try { choose(options.file); } catch (error) { setError(error.message); } }
    else if (options.loadReceipt) {
      setBusy(true); status.textContent = "Opening the saved receipt securely…";
      Promise.resolve().then(options.loadReceipt).then(saved => { if (closed) return; setBusy(false); choose(saved, false); }).catch(error => { if (closed) return; setBusy(false); setError(error.message || "Cannot open the saved bill. Choose the original photo instead."); status.textContent = "Choose the original bill photo, or paste text."; });
    }
    return close;
  }
  window.MyTripReceiptScanner = { open, cancel: () => active?.() };
})();
