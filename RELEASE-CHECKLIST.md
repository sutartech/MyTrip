# MyTrip release and maintenance checklist

**Current frontend baseline:** 4.99.0  
**Backend compatibility declared by the frontend:** 4.32.2 recommended; 4.32.1 minimum compatible.

## Before publishing a frontend update

Run the release checks from the repository root:

```bash
node tools/sync-quick-expense-entry.js
node tools/verify-release.js
node --test tests/mytrip-release.test.js tests/receipt-scan-dom.test.js tests/separate-quick-app.test.js tests/entry-transparency.test.js tests/settlement-print.test.js tests/settlement-reopen.test.js
```

The release verifier checks required files, JavaScript syntax, PWA manifest JSON, cache-busting/version alignment, the configured Apps Script endpoint, Quick Expense's separate PWA identity and narrow scope, generated-entry consistency, and OCR asset integrity. The behavioural suites cover release-critical permissions, receipts, quick-entry routing, expense transparency and settlement/print flows. Run optional image/OCR smoke tests only in an environment with their documented dependencies.

## Deployment sequence

1. Back up the current GitHub repository state and the Google Drive spreadsheet/backend assets.
2. Publish the complete frontend repository to the GitHub Pages branch. Keep `config.js` pointed at the existing, correct Apps Script `/exec` URL.
3. Do **not** redeploy Apps Script for a frontend-only change. If backend source is intentionally changed, deploy a new Web App version separately.
4. Sign in as administrator and confirm System Health reports a connected backend, expected sheets/columns, working Drive access and acceptable round-trip time.
5. Confirm the backend ping reports 4.32.2 where deployed; 4.32.1 is the declared minimum compatibility fallback.
6. Open a normal account session and a shared-trip session. Confirm role-based access, trip data, traveller permissions, itinerary, expenses, balances, receipts, photos, sticky notes and print/export.
7. Test a Quick Expense link in a private browser window, including pause/resume, history visibility, correction window and the separate install flow.
8. Confirm offline expense retry/review works without exposing credentials. Reconnect and verify the queued record appears once.
9. Use **Clear cache & update** once on desktop and mobile. Reopen both the main app and Quick Expense PWA.

## Monthly unattended-use safeguards

Before leaving the app unchanged for an extended period:

- Confirm the administrator can still sign in and that recovery email/OTP delivery works.
- Confirm the latest automatic/manual backup is visible and perform one restore-readiness check without overwriting live data.
- Confirm the Apps Script deployment URL is still the configured URL and the deployment owner/account remains active.
- Review Google account storage/quota and Apps Script execution limits; this frontend cannot prevent provider-side quota exhaustion.
- Keep at least one administrator account and a second trusted recovery route. Do not share admin credentials.
- Retain a local copy of the current frontend and backend source/deployment notes.

## Important boundaries

- This repository contains the frontend. The Apps Script backend source is external and is not syntax-tested by the frontend verifier.
- A successful static build or GitHub Pages publish does not prove live spreadsheet writes, email delivery, Drive permissions, triggers or backup restoration. Those require the live checks above.
- Offline expense text is protected for retry, but receipt images are not held in the offline queue.
- OCR suggestions require human review; handwriting, non-English scripts and poor-quality scans are not guaranteed.
- Quick Expense installation is browser/PWA dependent; use the manual home-screen fallback if the browser suppresses the install prompt.
- No availability, booking, native push, unlimited quota or independent security-audit guarantee is implied.
