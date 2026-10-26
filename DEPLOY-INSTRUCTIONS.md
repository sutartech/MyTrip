# MyTrip Dashboard 4.67.1

This package contains **FE v4.67.1** and **BE v4.32.1**. It keeps all v4.67.0 features and corrects the two-icon Android setup: keep the MyTrip app and add a distinct ₹ Quick Expense home-screen shortcut. It no longer treats a saved trip link or standalone window as proof that Android created a second icon.

The backend is unchanged in this frontend patch. If your live backend still shows v4.31.2, update/deploy the included v4.32.1 Code.gs first. Also keep config.js pointing to your Apps Script `/exec` URL, never the GitHub webpage.

## What was completed in this release

See **FEATURE-CHECKLIST-v4.67.0.md** for the feature-by-feature audit and validation limits.

- **Scan bill text** works on demand in Add expense, the no-login Quick Expense form, and saved receipt views. Read printed English bill photos locally, review payable amount/date/vendor/category/invoice/GST, then copy selected fields into a draft. Nothing auto-saves.
- Quick Expense has a dedicated `quick-expense/` install/launch path, separate ₹ icon and no-login link-recovery screen. **Add second home icon** is always available, including inside an existing app window. New shared links use the dedicated path and old root-page links redirect safely. The installer shows both icons, can open Chrome on Android, and offers private-link copy/manual shortcut instructions without uninstalling MyTrip. Android can still suppress a second native install prompt; a separate home-screen shortcut is the supported fallback.
- Offline entries cannot cross into another account or trip. New quick-link expenses can also queue; retry still checks the link's current status. Receipt photos themselves need an online upload.
- System Health can create backups, enable/pause nightly backups, and safely repair missing structure. The response card measures the full round trip, not just server processing.
- “Edit own” uses a server-stamped account ID on new records. Old records retain a name-based compatibility fallback. Full section editing does not grant Administrator-only deletion or security controls.
- Login state is now tab-scoped. Only username is remembered persistently; legacy persistent login secrets are cleared. Browser session-restore behaviour is browser-controlled; the idle timeout remains authoritative.

Upload **all files/folders**, including `receipt-parser.js`, `receipt-scan.js`, the complete `ocr/` folder and the complete `quick-expense/` folder. Do not upload only app.js and Code.gs.

For Android setup, use **ANDROID-QUICK-EXPENSE.md**. For a new real installation check, remove an old incorrect Quick Expense shortcut once and install again from the current link. Do not clear site storage after linking unless you are ready to paste the link again.

The Administrator can also schedule each no-login Quick Expense link with an **Active from** and **Valid until** date, disable it immediately, later re-enable the exact same already-shared URL, extend or shorten its period, or generate a new link that retires the older active link. Expenses support **Take photo** and **Choose photo / file** receipt controls on phones and computers.

Existing trips, travellers, assignments, plans, places, expenses, experiences and passwords are preserved.

## Quick Expense Links during a trip

- Recommended: open **Expenses → Manage links** and use the highlighted **Trip-wide shared link → Create trip-wide link**. This creates one common no-login link for the trip and always displays a required **Paid by** selector containing assigned travellers.
- The trip-wide form also includes optional **Entered by**. This records the name declared by the link user for audit, but the interface clearly states that it is not identity-verified because no login is required.
- Open the trip as Global Administrator, select **Expenses → Manage links**, and create a no-login link for a traveller account.
- To let the link user record a payment in anyone’s name, tick **Allow expense in the name of any traveller**. Leave it unticked when **Paid by** must stay locked to the link owner.
- Choose **Active from** and **Valid until**, or **Keep valid until Administrator disables it**, then set the maximum new entries per day and correction window. **Manage period** changes the same shared URL; **Disable/Enable** blocks or restores that same URL. **Generate new** immediately disables the older active link for that traveller.
- Share the generated link privately. The raw link token is shown only at creation; the Google Sheet stores only its SHA-256 hash.
- Anyone holding the link can open it without signing in. When the Administrator enabled the new option, the page shows a required **Paid by** selector containing only travellers assigned to that trip; otherwise the payer stays locked to the link owner.
- On the no-login page, select **Install on phone**. Android uses the native install prompt when available; otherwise the page shows the Chrome and iPhone Safari home-screen steps. The installed MyTrip icon then opens that exact Quick Expense form directly, without username, password or OTP.
- Only one direct Quick Expense shortcut is retained per phone. Installing another trip's link replaces the saved shortcut on that phone. Select **Forget on this phone** before handing a shared device to somebody else.
- The expense saves in the same `Expenses` Google Sheet and appears in totals, settlement, printouts and the full dashboard. The `source` and `quickPassId` columns preserve the audit path.
- The link user may edit/delete only entries created by that same link and only during the Administrator-set correction window. The Administrator retains normal full expense control. Personal links retain their account owner; trip-wide entries retain the shared pass ID and optional self-declared Entered by name.
- Disable a lost or forwarded link immediately. Disabling the trip, expiry or link revocation stops either link type. Removing a traveller, disabling that account or disabling that traveller’s expense access additionally stops their personal link; the separate trip-wide link stays under its own Administrator control.

## Unified account login

- The login page has one common account form. It accepts a **username, registered mobile number or registered email** and does not ask the user to choose Administrator or Traveller.
- Users may sign in with their password or select **Send OTP instead**. OTPs are single-use, expire after 10 minutes, allow five attempts, are limited to five requests per account per hour, and create a temporary server-validated session instead of storing the account password in the browser.
- OTP works through Google Apps Script `MailApp` and is email-only. A saved mobile number can still identify an account for password login; if recovery starts with that mobile number, the OTP goes to the account's verified email.
- The Global Administrator controls the mobile number, email address and OTP-enabled setting for every traveller under **Traveller profiles → Edit details**. The Administrator manages their own values under **Change login**.
- Mobile numbers and email addresses must be unique across accounts, preventing the wrong profile from opening.
- A green **Email verified** badge appears only after that user successfully enters an email OTP. Mobile numbers have no verification badge. Editing the email removes its badge until the new email is verified; the Administrator cannot manually grant it.
- **Forgot password** is self-service for accounts with a verified email. The reset OTP expires after 10 minutes, and changing the password invalidates older sessions.
- The backend identifies the account automatically and opens the correct dashboard.
- The login screen uses a responsive two-panel secure-access design matching the supplied reference. The complete frame is centred against the full browser viewport, with a wide login panel and text/controls that scale with screen width and height.
- The login uses eye-catching but readable blue, violet, teal, peach and gold gradients. The personal account login and shared one-trip login have distinct colour treatments.
- For an existing installation, the Administrator username is **`administrator`**. The existing Administrator PIN/secret continues to work as its password.
- A traveller's permanent Traveller ID is the username. The existing personal PIN continues to work as the password.
- After login, the account dashboard lists every active trip available to that account.
- Shared one-trip access is always visible below the common account form, with separate Trip code and shared-password fields.
- Frontend and backend versions are shown on the login page, account dashboard and trip dashboard.
- The redundant **Google backend connected** sentence has been removed; compact **FE v** and **BE v** badges are the authoritative status.
- A centred pale-pink capsule clock matching the supplied reference appears in the account and trip headers, with a thick pink outline and dark-magenta bold text. It uses the device's local time, for example **◆ 28th-Aug-2026 (Friday) │ 08:54 PM**, and updates automatically without unnecessary every-second repainting.
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

## Administrator Access & Audit

- Open **All trips → Access & Audit**, or use **Security → Open Access & Audit** inside a trip. It is also available in **Print & Export**.
- Filter by activity type, trip and period; search names, usernames, devices or actions; export the filtered result as CSV.
- Account sign-ins are verified by the backend. Shared trip-password and no-login Quick Expense activity is clearly labelled separately; any optional name entered on a no-login form remains self-declared.
- The view records activity after backend v4.31.5 is deployed. Earlier data changes already in Change History are merged, but past sign-ins cannot be reconstructed.
- `setupMyTrip()` creates the `AccessLog` sheet without deleting existing data.

## Other included upgrades

- **Speed build:** sign-in performs the backend capability check concurrently instead of adding another full wait before login.
- Frequently updated sheet fields and header repairs use batched reads/writes to reduce Apps Script calls.
- `sw.js` keeps only versioned MyTrip layout files in a controlled same-site cache, so repeat visits open immediately. Passwords, Google Sheet responses, Drive photos and Apps Script requests are never cached by it.
- Print reports are built only when Print is selected, long lists use progressive browser rendering, view controls use one delegated event handler, the clock updates only when needed, and web fonts load without blocking the first screen.
- **Quick Find** searches every permitted itinerary, place, expense, photo, experience and traveller from one panel. It now sits in the Administrator/Traveller access banner so it cannot overlap the live date and time; it also opens with `Ctrl + K` / `Command + K`.
- Search results never expose a feature hidden for that Traveller ID.
- A slim animated progress bar appears during backend work, requests have a safe timeout, and the header shows clear online/offline status.
- Mobile navigation uses larger horizontally scrollable buttons instead of compressing eight unreadable tabs into one row.
- Keyboard focus, Escape-to-close, skip-to-content, reduced-motion support, larger touch targets and a Back to top button improve accessibility.
- `favicon.svg` gives MyTrip its own colourful browser-tab identity.
- `repair.html` is a standalone recovery page for stale cache/service-worker problems, especially when MyTrip works in Incognito but the normal browser opens an old or different dashboard.
- The Overview changes automatically according to the device's local date: **Trip preparation** before departure, **Today’s Journey** during the trip, and **Trip memories** after completion.
- Overview action shortcuts are shown once only in one colourful row immediately above the Trip Photo. Duplicate Add plan, Add place, Add expense and other journey-panel shortcuts have been removed.
- During an active trip, Today’s Journey shows the next itinerary item, a Google Maps navigation link, the remaining plan for the day, today’s spending, the most urgent active sticky reminder, and quick buttons for allowed actions.
- The preparation view shows days to departure, planned days, saved places, active reminders and the photo-gallery status. The completed view summarises spending, experiences, photos and visited places.
- These panels use only existing MyTrip data and follow every Administrator permission. They require no paid travel API, GPS tracking or backend update.
- A slim **Sticky notes** tab opens a colourful right-side panel.
- The Administrator controls which personal traveller accounts may write sticky notes.
- Active sticky notes remain on the current device. Completing a sticky note saves its full entry in the separate `StickyNoteDiary` Google Sheet.
- Completed sticky notes have separate history and can be reopened or deleted by the Administrator.
- **Experiences** is a separate colourful travel-journal tab with writer names.
- **Expenses** has a row-based statement with **View**, **Row edit**, **Edit**, and Administrator-only **Delete** actions.
- Row edit and full edit save directly to the `Expenses` Google Sheet.
- **Paste & Import** accepts itinerary or expense text copied from WhatsApp, email, Notes or a document. It recognises common dates, times, amounts, categories and payer names on the device, then shows an editable review screen before anything is saved.
- Mixed text can be separated with `ITINERARY` and `EXPENSES` headings. Possible duplicates are identified and left unticked. Every confirmed itinerary and expense row is saved through the existing backend to its corresponding Google Sheet.
- Traveller-wise expense totals show only people with a positive recorded payment.
- Existing trip photos, print reports, multi-trip traveller accounts and duplicate-profile deletion remain available.
- In **Traveller profiles**, the Global Administrator can set a separate 0–100 trip-creation limit for each traveller, increase or reduce it later, or enter 0 to disable creation. Assigned trips do not use the quota; existing created trips are preserved if the limit is lowered.
- **Trip Photos** is a separate colourful gallery. Original files up to 20 MB are stored in Google Drive, lightweight thumbnails load in the dashboard, and caption, owner and timestamps are stored in the `TripPhotos` Google Sheet.
- The Administrator may add, replace or delete any photo, enable or disable traveller uploads for a whole trip, and set a separate 0–50 photo limit for every assigned traveller. A limit of 0 disables photo addition.
- A traveller may add photos only within the assigned limit and may replace or delete only photos personally uploaded by that username. Replacement does not consume another slot. Shared one-trip access is view-only for photos.
- `setupMyTrip()` organises the one live spreadsheet, photos and backup copies under one **MyTrip Dashboard** Drive root without changing existing file IDs.

## Step 1 — Update Google Apps Script

Deploy the supplied backend when the live page reports an older version than **Backend v4.32.1**, or when a required backend capability is missing.

1. Open the existing Apps Script project used by MyTrip.
2. Replace the entire `Code.gs` with `backend/Code.gs` from this ZIP.
3. Save and run `setupMyTrip()` once. Existing rows are not deleted.
4. Choose **Deploy → Manage deployments → Edit**.
5. Select **New version**, then click **Deploy**.
6. Keep access as **Anyone** and keep the same `/exec` URL.
7. Open `YOUR-EXEC-URL?action=ping` and confirm it contains `"version":"4.32.1"`, `"granularPermissions":true`, `"systemHealth":true`, `"sectionLoading":true`, `"offlineExpenseQueue":true`, `"quickExpenseHistoryControls":true`, `"accessAudit":true`, `"emailOnlyOtp":true`, `"batchedSheetIO":true`, and `"singleDriveRoot":true`.

## Step 2 — Update GitHub Pages

Replace these repository-root files:

1. `index.html`
2. `app.js`
3. `app.css`
4. `favicon.svg`
5. `repair.html`
6. `sw.js`
7. `manifest.webmanifest`

Keep the existing `config.js` so the connected `/exec` URL is unchanged. Wait about two minutes, open `repair.html` once to remove any older broad service worker, then reopen the site. The new controlled speed cache registers automatically after the page opens.

Deploy the supplied `backend/Code.gs` whenever the live backend is older than `4.32.1` or the ping check reports a missing capability.

## Email-only OTP

Email OTP needs no external service. There is no mobile verification and no SMS provider configuration. Mobile numbers remain optional contact/login identifiers and must be unique when saved. All login, verification and password-reset OTPs are delivered only to the account's registered email.

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
8. Confirm **FE v4.67.1 · BE v4.32.1** and the automatically updating date/time appear inside the app.
9. Open Expenses and test View, Row edit, Edit and Administrator Delete.
10. Complete a sticky note and confirm a row appears in `StickyNoteDiary`.
11. Confirm the colourful Experiences tab is separate from Itinerary.
12. Leave the app idle for five minutes and confirm it returns to login.
13. In Traveller profiles, select **Set trip limit**, enter a positive limit and confirm the traveller can create only that many trips. Enter 0 and confirm creation is disabled.
14. Open a trip as Administrator, select **Travellers → Control access**, set a photo limit, then test add/replace/delete in **Trip Photos**. Confirm the Drive file and `TripPhotos` Sheet row are created.
15. Change a test trip's dates to before, during and after today's date. Confirm Overview changes respectively to **Trip preparation**, **Today’s Journey** and **Trip completed**, while hidden traveller features remain hidden.
16. Open **Quick Find** or press `Ctrl + K` / `Command + K`. Search a place, expense and traveller, and confirm each result opens the correct permitted section.
17. On mobile, swipe the bottom navigation sideways and confirm every permitted tab remains large and readable.
18. Temporarily disconnect the internet and confirm the header shows **Offline** without hiding already loaded trip information.
19. If the normal browser opens an old or different dashboard, open `https://saradasutar.github.io/MyTrip/repair.html`, select **Repair cache and reopen MyTrip**, then sign in again.
20. Reopen MyTrip once more and confirm the login screen appears immediately from the controlled static cache; verify that passwords are still blank and live trip data still comes from Apps Script.
21. Open Itinerary or Expenses, select **Paste & import**, paste several sample rows, correct one preview field, leave a possible duplicate unticked, and confirm accepted rows appear in the correct Google Sheet tabs.
22. Open **All trips → Access & Audit**. Test an account sign-in, a failed sign-in and a no-login Quick Expense entry; confirm each appears with the correct verified/unverified badge, filters and CSV export.
