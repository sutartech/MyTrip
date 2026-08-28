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
- **Sign out** is at the top left on desktop, in the mobile top bar, and in the account dashboard header.
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
7. Open `YOUR-EXEC-URL?action=ping` and confirm it contains `"version":"4.6.0"`, `"accountLogin":true`, and `"stickyNoteDiary":true`.

## Step 2 — Update GitHub Pages

Replace these repository-root files:

1. `index.html`
2. `app.js`
3. `styles.css`

Keep the existing `config.js` so the connected `/exec` URL is unchanged. Wait about two minutes, use **Clear cache & reload** on the login page, and reopen the site.

## Verification checklist

1. Confirm one common Username + Password form appears with no role selector.
2. Sign in as `administrator` using the existing Administrator password and confirm all trips appear.
3. Sign in with a Traveller ID and its personal password and confirm only assigned trips appear.
4. Confirm **Frontend v4.7.0 · Backend v4.6.0** appears inside the app.
5. Open Expenses and test View, Row edit, Edit and Administrator Delete.
6. Complete a sticky note and confirm a row appears in `StickyNoteDiary`.
7. Confirm the colourful Experiences tab is separate from Itinerary.
8. Leave the app idle for five minutes and confirm it returns to login.
