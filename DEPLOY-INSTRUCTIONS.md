# MyTrip Dashboard 4.7.0

This package keeps the exact visible versions **Frontend v4.7.0** and **Backend v4.6.0**. It adds the unified account login, all-trips account dashboard, collapsible sticky notes, Sticky Note Diary, colourful Experiences tab, and row-based expense controls.

Existing trips, travellers, assignments, plans, places, expenses, experiences and passwords are preserved.

## Unified account login

- The login page has one common **Username + Password** form. It does not ask the user to choose Administrator or Traveller.
- The backend identifies the account automatically and opens the correct dashboard.
- For an existing installation, the Administrator username is **`administrator`**. The existing Administrator PIN/secret continues to work as its password.
- A traveller's permanent Traveller ID is the username. The existing personal PIN continues to work as the password.
- After login, the account dashboard lists every active trip available to that account.
- Optional shared one-trip access remains collapsed below the common account form.
- Frontend and backend versions are shown on the login page, account dashboard and trip dashboard.
- The redundant **Google backend connected** sentence has been removed; the separate **FRONTEND** and **BACKEND** version badges are the authoritative status.
- The password field has a **Show/Hide** control and a collapsible guide explaining which username and password to use.
- **Save username and password on this device** is optional and should be selected only on a private phone or computer. Clear the checkbox to remove the saved login.
- **Sign out** is prominently placed at the top right in the trip dashboard and account dashboard, including mobile.
- The Administrator can change a traveller's username and password from **Traveller profiles → Open profile → Edit login**. Username changes move every trip assignment to the new login while preserving historical expenses and diary entries.
- Five minutes without activity signs the user out. Closing or restoring the browser page also requires login again.

## Other included upgrades

- A slim **Sticky notes** tab opens a colourful right-side panel.
- The Administrator controls which personal traveller accounts may write sticky notes.
- Active sticky notes remain on the current device. Completing a sticky note saves its full entry in the separate `StickyNoteDiary` Google Sheet.
- Completed sticky notes have separate history and can be reopened or deleted by the Administrator.
- **Experiences** is a separate colourful travel-journal tab with writer names.
- **Expenses** has a row-based statement with **View**, **Row edit**, **Edit**, and Administrator-only **Delete** actions.
- Row edit and full edit save directly to the `Expenses` Google Sheet.
- Traveller-wise expense totals show only people with a positive recorded payment.
- Existing trip photos, print reports, multi-trip traveller accounts and duplicate-profile deletion remain available.

## Step 1 — Update Google Apps Script

The supplied backend must be deployed even if the live page already reports **Backend v4.6.0**. The visible version stays unchanged, but the supplied build adds the unified account-login capability and Sticky Note Diary operations.

1. Open the existing Apps Script project used by MyTrip.
2. Replace the entire `Code.gs` with `backend/Code.gs` from this ZIP.
3. Save and run `setupMyTrip()` once. Existing rows are not deleted.
4. Choose **Deploy → Manage deployments → Edit**.
5. Select **New version**, then click **Deploy**.
6. Keep access as **Anyone** and keep the same `/exec` URL.
7. Open `YOUR-EXEC-URL?action=ping` and confirm it contains `"version":"4.6.0"`, `"accountLogin":true`, `"stickyNoteDiary":true`, and `"travellerCredentialEdit":true`.

## Step 2 — Update GitHub Pages

Replace these repository-root files:

1. `index.html`
2. `app.js`
3. `styles.css`

Keep the existing `config.js` so the connected `/exec` URL is unchanged. Wait about two minutes, use **Clear cache & reload** on the login page, and reopen the site.

Deploy the supplied `backend/Code.gs` for Administrator-controlled traveller username changes, even if the visible backend badge already says `4.6.0`. The visible version remains unchanged.

## Verification checklist

1. Confirm one common Username + Password form appears with no role selector.
2. Confirm **Show/Hide**, optional device saving, and the username/password help panel work on the login page.
3. Sign in as `administrator` using the existing Administrator password and confirm all trips appear.
4. Sign in with a Traveller ID and its personal password and confirm only assigned trips appear.
5. Confirm **Sign out** is the rightmost control in the top header on desktop and mobile.
6. As Administrator, open a Traveller profile, select **Edit login**, and verify the new username/password works.
7. Confirm **Frontend v4.7.0 · Backend v4.6.0** appears inside the app.
8. Open Expenses and test View, Row edit, Edit and Administrator Delete.
9. Complete a sticky note and confirm a row appears in `StickyNoteDiary`.
10. Confirm the colourful Experiences tab is separate from Itinerary.
11. Leave the app idle for five minutes and confirm it returns to login.
