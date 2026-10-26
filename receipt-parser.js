/* MyTrip bill suggestions. Pure parsing only; never writes expense records. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MyTripBillParser = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function isoDate(year, month, day) {
    year = Number(year); month = Number(month); day = Number(day);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 1990 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return "";
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  function findDate(text) {
    const labelled = text.split("\n").filter(line => /\bdate\b/i.test(line) && !/expiry|valid till/i.test(line));
    const ordered = labelled.concat(text.split("\n"));
    for (const line of ordered) {
      let match = line.match(/\b(20\d{2}|19\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
      if (match) { const date = isoDate(match[1], match[2], match[3]); if (date) return { date, ambiguous: false }; }
      match = line.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/);
      if (match) {
        const date = isoDate(match[3], match[2], match[1]);
        if (date) return { date, ambiguous: Number(match[1]) <= 12 && Number(match[2]) <= 12 && match[1] !== match[2] };
        // Do not reinterpret an invalid Indian DD/MM date as MM/DD silently.
      }
      match = line.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s/-]+([A-Za-z]{3,9})[\s,/-]+(\d{4}|\d{2})\b/);
      if (match && months[match[2].slice(0, 3).toLowerCase()]) { const date = isoDate(match[3], months[match[2].slice(0, 3).toLowerCase()], match[1]); if (date) return { date, ambiguous: false }; }
      match = line.match(/\b([A-Za-z]{3,9})[\s/-]+(\d{1,2})(?:st|nd|rd|th)?[\s,/-]+(\d{4}|\d{2})\b/);
      if (match && months[match[1].slice(0, 3).toLowerCase()]) { const date = isoDate(match[3], months[match[1].slice(0, 3).toLowerCase()], match[2]); if (date) return { date, ambiguous: false }; }
    }
    return { date: "", ambiguous: false };
  }
  function moneyInLine(line) {
    const values = [];
    const pattern = /(?:₹|\bINR\b|\bRS\.?\s*)?\s*([-+]?\d[\d,]*(?:\.\d{1,2})?)(?![\d.])/gi;
    for (const match of line.matchAll(pattern)) {
      const raw = match[1];
      if (/^-/.test(raw)) continue;
      const number = Number(raw.replace(/,/g, ""));
      if (number > 0 && number < 100000000 && Number.isFinite(number)) values.push(Math.round(number * 100) / 100);
    }
    return values;
  }
  function totalSuggestions(lines) {
    const candidates = [];
    lines.forEach((line, index) => {
      if (/sub[ -]?total|taxable|before tax|cash tender|cash paid|change|balance|discount|round(?:ing)?\s*(?:off|adj)|total\s+(?:qty|quantity|items?|tax|saving)|\b(?:gst|cgst|sgst|igst)\b/i.test(line) && !/grand\s*total|net\s*payable|total\s*(?:amount\s*)?(?:payable|due)/i.test(line)) return;
      let score = 0;
      if (/grand\s*total|total\s*(?:amount\s*)?payable|net\s*(?:amount\s*)?payable|amount\s*due|amount\s*to\s*pay/i.test(line)) score = 100;
      else if (/net\s*(?:amount|total)|total\s*(?:bill|amount)|bill\s*total|total\s*due/i.test(line)) score = 90;
      else if (/\btotal\b/i.test(line)) score = 80;
      else if (/\bpayable\b/i.test(line)) score = 70;
      if (!score) return;
      let amounts = moneyInLine(line), source = line;
      if (!amounts.length && lines[index + 1] && /^(?:INR|Rs\.?|₹)?\s*[\d,.]+\s*$/i.test(lines[index + 1])) { amounts = moneyInLine(lines[index + 1]); source += " " + lines[index + 1]; }
      if (!amounts.length) return;
      candidates.push({ amount: amounts[amounts.length - 1], line: source.slice(0, 180), score, index });
    });
    return candidates.sort((a, b) => b.score - a.score || b.index - a.index).filter((item, index, list) => list.findIndex(other => other.amount === item.amount) === index).slice(0, 5);
  }
  function categoryFor(text) {
    if (/restaurant|\bcafe\b|coffee|bakery|dining|\bfood\b|kitchen|biryani|breakfast|dinner|lunch/i.test(text)) return "Food";
    if (/hotel|resort|homestay|lodging|room\s*(?:rent|charge)|accommodation/i.test(text)) return "Stay";
    if (/\b(?:uber|ola|taxi|rickshaw|cab)\b|parking|toll/i.test(text)) return "Local travel";
    if (/airline|flight|railway|train|bus\s*(?:fare|ticket)|petrol|diesel|fuel/i.test(text)) return "Travel";
    if (/museum|entry\s*(?:fee|ticket)|safari|admission|theme\s*park/i.test(text)) return "Activities";
    if (/supermarket|grocery|retail|shopping|garment|apparel/i.test(text)) return "Shopping";
    return "Other";
  }
  function parse(text) {
    text = String(text || "").replace(/\r\n?/g, "\n").replace(/[\u0000\u200b\f]/g, "").slice(0, 20000).trim();
    const lines = text.split("\n").map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    const dates = findDate(text), totals = totalSuggestions(lines), warnings = [];
    const vendor = (lines.slice(0, 7).find(line => /[a-z]{3}/i.test(line) && !/^(?:tax\s*invoice|invoice|bill\b|receipt\b|gstin|gst\s*no|date\b|phone|mobile|tel\b|cash\s*memo|welcome|thank\s*you|address|table\s*no)/i.test(line) && !/https?:|www\.|@|\b\d{6}\b|\b(?:road|street|pin\s*code)\b/i.test(line)) || "").slice(0, 120);
    const invoice = text.match(/\b(?:invoice|bill|receipt)\s*(?:no\.?|number|#|id)\s*[:#-]?\s*([A-Z0-9][A-Z0-9/_-]{0,59})/i);
    const gst = text.toUpperCase().match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/);
    const foreign = text.match(/\b(USD|EUR|GBP|AUD|SGD|AED)\b|[$€£]/i);
    const currency = foreign ? foreign[0].toUpperCase() : /\bINR\b|\bRs\.?|₹/i.test(text) ? "INR" : "";
    if (!totals.length) warnings.push("No clearly labelled payable total found. Enter the amount yourself.");
    if (totals.length > 1) warnings.push("More than one total was found. Compare the suggested amount with the bill.");
    if (!dates.date) warnings.push("No valid bill date found. Keep or enter the date yourself.");
    if (dates.ambiguous) warnings.push("Date interpreted as DD/MM/YYYY (Indian format). Please check it.");
    if (foreign) warnings.push(`This bill may use ${currency}. The amount has NOT been converted to your trip currency.`);
    if (!text) warnings.push("No readable text found. Try a sharper, upright photo or paste the bill text.");
    return { text, vendor, description: vendor, amount: totals[0] ? totals[0].amount : "", date: dates.date, category: categoryFor(vendor + "\n" + text), invoiceNumber: invoice && !/^(?:date|no|number)$/i.test(invoice[1]) ? invoice[1] : "", gstin: gst ? gst[0] : "", currency, foreignCurrency: Boolean(foreign), totals, warnings };
  }
  function metadataNotes(fields, includeText) {
    const parts = [];
    if (fields.vendor) parts.push("Vendor: " + String(fields.vendor).trim());
    if (fields.invoiceNumber) parts.push("Invoice: " + String(fields.invoiceNumber).trim());
    if (fields.gstin) parts.push("GSTIN: " + String(fields.gstin).trim());
    if (includeText && fields.text) parts.push("Bill text (OCR; check against receipt):\n" + fields.text);
    return parts.join("\n");
  }
  return { parse, isoDate, metadataNotes };
});
