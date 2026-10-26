# MyTrip release check

Run before uploading:

```text
node tools/verify-release.js
```

The automated check verifies JavaScript syntax, all manifests, FE/BE version alignment, cache-busting, required assets, backend capabilities, System Health, section loading, secure offline queuing, receipt OCR assets, the separate Quick Expense scope/start URL and 24 behavioural regression tests.

Optional QA checks (requires jsdom@26, tesseract.js@7 and sharp in the test environment):

```text
node --test tests/receipt-scan-dom.test.js
node tests/ocr-image-smoke.js
```

If index.html is edited, regenerate the secondary entry before verification:

```text
node tools/sync-quick-expense-entry.js
```

For deployment:

1. Replace Google Apps Script `Code.gs`, save, run `setupMyTrip()`, and deploy a new Web App version.
2. Confirm `YOUR-EXEC-URL?action=ping` reports `4.32.1`.
3. Upload all frontend files and the complete `quick-expense/` and `ocr/` folders, plus `receipt-parser.js` and `receipt-scan.js`.
4. Use **Clear cache & update** once.
5. Open a no-login Quick Expense link and choose **Install on phone**. Android creates a separate Quick Expense icon.
