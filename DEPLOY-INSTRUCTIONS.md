# MyTrip Dashboard 4.7.0

This package keeps the exact versions **FE v4.7.0** and **BE v4.6.0**. It adds the unified account login, all-trips account dashboard, collapsible sticky notes, Sticky Note Diary, colourful Experiences tab, and row-based expense controls.

Existing trips, travellers, assignments, plans, places, expenses, experiences and passwords are preserved.

## Unified account login

- The login page has one common **Username + Password** form. It does not ask the user to choose Administrator or Traveller.
- The backend identifies the account automatically and opens the correct dashboard.
- The login screen uses a responsive two-panel secure-access design matching the supplied reference. The complete frame is centred against the full browser viewport, with a wide login panel and text/controls that scale with screen width and height.
- The login uses eye-catching but readable blue, violet, teal, peach and gold gradients. The personal account login and shared one-trip login have distinct colour treatments.
- For an existing installation, the Administrator username is **`administrator`**. The existing Administrator PIN/secret continues to work as its password.
- A traveller's permanent Traveller ID is the username. The existing personal PIN continues to work as the password.
- After login, the account dashboard lists every active trip available to that account.
- Shared one-trip access is always visible below the common account form, with separate Trip code and shared-password fields.
- Frontend and backend versions are shown on the login page, account dashboard and trip dashboard.
- The redundant **Google backend connected** sentence has been removed; compact **FE v** and **BE v** badges are the authoritative status.
- A centred pale-pink capsule clock matching the supplied reference appears in the account and trip headers, with a thick pink outline and dark-magenta bold text. It uses the device's local time, for example **◆ 28th-Aug-2026 (Friday) │ 08:54 PM**, and updates automatically every second.
- Main labels, supporting text, buttons and dashboard summaries use larger, bolder type for easier reading on desktop and mobile.
- The password field has a clear **Show/Hide** control.
- **Remember username on this device** is optional. Only the username is stored. The password is never saved and must be entered for every login.
- Demo, new-trip creation and backend settings remain under the collapsed **Other setup tools** control so the two normal login methods stay uncluttered.
- **Sign out** is prominently placed at the top right in the trip dashboard and account dashboard, including mobile.
- The Administrator can change a traveller's username and password from **Traveller profiles → Open profile → Edit login**. Username changes move every trip assignment to the new login while preserving historical expenses and diary entries.
- The Apps Script editor includes one-time recovery functions for the global Administrator username, password, or both credentials together. Temporary recovery values are deleted after a successful reset.
- The recommended recovery function automatically generates a unique Administrator username and strong temporary password without requiring Script Properties.
- After sign-in, **Change login** appears directly on the Administrator all-trips dashboard and changes only the global Administrator credentials.
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
- In **Traveller profiles**, the Global Administrator can set a separate 0–100 trip-creation limit for each traveller, increase or reduce it later, or enter 0 to disable creation. Assigned trips do not use the quota; existing created trips are preserved if the limit is lowered.
- **Trip Photos** is a separate colourful gallery. Photo files are stored in Google Drive and their caption, owner and timestamps are stored in the `TripPhotos` Google Sheet.
- The Administrator may add, replace or delete any photo, enable or disable traveller uploads for a whole trip, and set a separate 0–50 photo limit for every assigned traveller. A limit of 0 disables photo addition.
- A traveller may add photos only within the assigned limit and may replace or delete only photos personally uploaded by that username. Replacement does not consume another slot. Shared one-trip access is view-only for photos.

## Step 1 — Update Google Apps Script

The supplied backend must be deployed even if the live page already reports **Backend v4.6.0**. The visible version stays unchanged, but the supplied build adds the unified account-login capability and Sticky Note Diary operations.

1. Open the existing Apps Script project used by MyTrip.
2. Replace the entire `Code.gs` with `backend/Code.gs` from this ZIP.
3. Save and run `setupMyTrip()` once. Existing rows are not deleted.
4. Choose **Deploy → Manage deployments → Edit**.
5. Select **New version**, then click **Deploy**.
6. Keep access as **Anyone** and keep the same `/exec` URL.
7. Open `YOUR-EXEC-URL?action=ping` and confirm it contains `"version":"4.6.0"`, `"accountLogin":true`, `"stickyNoteDiary":true`, `"travellerCredentialEdit":true`, `"administratorLoginEdit":true`, `"travellerTripCreation":true`, `"travellerTripCreationQuota":true`, and `"tripPhotoGallery":true`.

## Step 2 — Update GitHub Pages

Replace these repository-root files:

1. `index.html`
2. `app.js`
3. `styles.css`

Keep the existing `config.js` so the connected `/exec` URL is unchanged. Wait about two minutes, use **Clear cache & reload** on the login page, and reopen the site.

Deploy the supplied `backend/Code.gs` for Administrator-controlled traveller username changes, even if the visible backend badge already says `4.6.0`. The visible version remains unchanged.

## Administrator username/password recovery

Recommended method after saving the updated `Code.gs`:

1. Select `generateMyTripAdministratorLogin()` and click **Run**. You may also run `resetMyTripAdministratorLogin()` without creating Script Properties; it automatically uses the same generator.
2. Copy the generated **USERNAME** and **TEMPORARY PASSWORD** from the Execution log.
3. Sign in to MyTrip.
4. Select **⚿ Change login** on the Administrator all-trips dashboard.
5. Choose and save your own permanent username and password.

The generated password is saved only as a secure hash. Restrict Apps Script project-editor access to trusted Administrators.

Optional manual method using **Apps Script → Project Settings → Script properties**:

- To reset only the username, add `MYTRIP_NEW_ADMIN_USERNAME`, then run `resetMyTripAdministratorUsername()`.
- To reset only the password, add `MYTRIP_NEW_ADMIN_SECRET`, then run `resetMyTripAdministratorPin()`.
- To reset both together, add both properties, then run `resetMyTripAdministratorLogin()`.

The username must be 3–40 characters, start with a letter or number, and use only letters, numbers, dots, underscores or hyphens. It cannot duplicate a Traveller username. The password must be 6–64 characters. Successful recovery deletes the temporary properties automatically; no additional deployment is needed after running the function. Deploy this supplied backend once to enable the in-dashboard **Change login** operation.

## Verification checklist

1. Confirm one common Username + Password form appears with no role selector.
2. Confirm the complete colourful login frame is horizontally and vertically centred, its text is comfortably readable, and the normal login panel is approximately half the frame width on desktop.
3. Confirm **Show/Hide**, the username-only remembering option, FE/BE badges and the always-visible **Open one trip with shared access** form work on the login page. Confirm the password field is empty after sign-out or reload.
4. Sign in as `administrator` using the existing Administrator password and confirm all trips appear.
5. Sign in with a Traveller ID and its personal password and confirm only assigned trips appear.
6. Confirm **Sign out** is the rightmost control in the top header on desktop and mobile.
7. As Administrator, open a Traveller profile, select **Edit login**, and verify the new username/password works.
8. Confirm **FE v4.7.0 · BE v4.6.0** and the automatically updating date/time appear inside the app.
9. Open Expenses and test View, Row edit, Edit and Administrator Delete.
10. Complete a sticky note and confirm a row appears in `StickyNoteDiary`.
11. Confirm the colourful Experiences tab is separate from Itinerary.
12. Leave the app idle for five minutes and confirm it returns to login.
13. In Traveller profiles, select **Set trip limit**, enter a positive limit and confirm the traveller can create only that many trips. Enter 0 and confirm creation is disabled.
14. Open a trip as Administrator, select **Travellers → Control access**, set a photo limit, then test add/replace/delete in **Trip Photos**. Confirm the Drive file and `TripPhotos` Sheet row are created.
