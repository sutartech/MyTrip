# MyTrip Google Backend 4.6.0 Account Setup

The supplied backend is required even when the existing deployment already reports **v4.6.0**. This build adds:

- One common username/password login that identifies the account automatically
- One all-trips dashboard for each signed-in account
- `StickyNoteDiary` Google Sheet support
- Administrator-controlled sticky-note writing
- Google Sheet saving for full and inline expense edits

Existing data and passwords are preserved.

## Deploy

1. Open the Apps Script project currently used by MyTrip.
2. Replace its complete `Code.gs` with `backend/Code.gs` from this package.
3. Click **Save**.
4. Select `setupMyTrip` and click **Run** once.
5. Approve the requested Spreadsheet and Drive permissions.
6. Wait for successful completion. Missing sheets and columns are added without deleting existing rows.
7. Choose **Deploy → Manage deployments → Edit**.
8. Select **New version** and click **Deploy**.
9. Keep web-app access as **Anyone** and retain the same `/exec` URL.
10. Test `YOUR-EXEC-URL?action=ping`. It must return backend `4.6.0` with `accountLogin: true` and `stickyNoteDiary: true`.

## First login after updating

- Existing Administrator: username **`administrator`** plus the existing Administrator PIN/secret as the password.
- Existing traveller: permanent Traveller ID as username plus the existing personal PIN as the password.
- The login screen does not contain an Administrator/Traveller selector.

Do not create a new Apps Script project or spreadsheet. Updating the existing project preserves the same data and web-app URL.
