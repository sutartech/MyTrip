# MyTrip Google Backend 4.31.6 Setup

The supplied backend is required when the existing deployment is older than **v4.31.6** or reports a missing capability. This build adds per-link Quick Expense history visibility and edit/view-only enforcement while retaining Access & Audit, scheduled/revocable links, email-only OTP, batched Google Sheet updates, one organised MyTrip Drive root and original photos up to 20 MB with fast thumbnails.

Frontend **v4.65.0** and backend **v4.31.6** add the unified colourful icon family, responsive Administrator Control Centre, simplified trip management, overflow protection, lighter long-list rendering and a branded installable no-login Quick Expense shortcut. The Administrator can make each link’s past expenses view-only or editable and expose the latest 5, 10, 50 or all link entries.

- One common username/password login that identifies the account automatically
- One all-trips dashboard for each signed-in account
- `StickyNoteDiary` Google Sheet support
- Administrator-controlled sticky-note writing
- Google Sheet saving for full and inline expense edits
- Global Administrator-controlled numeric trip-creation limits for every traveller account
- A Drive-backed `TripPhotos` gallery with trip-wide switches and per-traveller upload limits
- A scheduled, Administrator-controlled moving announcement for each trip
- A 1–30 day completed-trip rating grace period for Complimentary Pro accounts; Protected/Paid Pro is never downgraded
- Email-OTP password reset for accounts whose email has already been verified
- Mobile numbers remain saved and may identify an account for password login, but mobile verification and SMS are not used
- One live spreadsheet under `MyTrip Dashboard`, with `Photos` and `Backups` subfolders in the same Drive root
- An `AccessLog` Google Sheet containing safe audit metadata only—never passwords, OTPs, raw link tokens, IP addresses or GPS

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
10. Test `YOUR-EXEC-URL?action=ping`. It must return backend `4.31.6` with `quickExpenseHistoryControls: true`, `accessAudit: true`, `quickExpenseTripWide: true`, `quickExpenseValiditySchedule: true`, `emailOnlyOtp: true`, `passwordResetOtp: true`, `batchedSheetIO: true`, `singleDriveRoot: true`, `originalPhotos20MB: true`, `quickExpenseNoExpiry: true`, and the existing MyTrip capabilities.

## Access & Audit

- Run `setupMyTrip()` once after replacing `Code.gs`; it creates the new `AccessLog` sheet safely.
- Sign in as Global Administrator and open **All trips → Access & Audit**, **Security → Open Access & Audit**, or **Print & Export → Access & audit**.
- Records begin after backend v4.31.5 is deployed. Existing Change History is included, but earlier sign-ins cannot be reconstructed.
- Shared/no-login identity is not authentication and is shown as unverified. Account sign-ins are shown as verified.

## Email verification and password reset

- All OTPs use Google Apps Script `MailApp`; no Twilio, SMS provider, API key or mobile verification is required.
- A mobile number may still be stored and used with the account password, but it never receives an OTP and never displays a verification badge.
- The Administrator enables email OTP separately for each traveller. A successful email OTP adds the email-verification timestamp; changing the email clears its verified status.
- **Forgot password** accepts a username, saved mobile number or email, but always sends the reset OTP to that account's previously verified email.
- Password-reset OTPs expire after 10 minutes, allow five attempts and invalidate older sessions when the password changes.

## Trip creation and photo controls

- Open **Traveller profiles → Set trip limit** and enter the maximum number of trips that account may create (0–100). Enter 0 to disable creation. The Administrator can raise or lower the limit later; assigned trips do not count and existing trips are never deleted.
- Inside a trip, open **Trip Photos** to enable or disable traveller uploads for that trip.
- Open **Travellers → Control access** and enter a whole-number photo limit from 0 to 50. Enter 0 to disable that traveller.
- Photo originals up to 20 MB are stored in the Apps Script owner’s Google Drive. The dashboard uses thumbnails for speed, while the `TripPhotos` Sheet stores the Drive link, caption, traveller ownership and timestamps.
- Travellers can replace or delete their own images only. Administrators can manage every image. Shared trip-password access can view but cannot upload.

## Drive and data organisation

- `setupMyTrip()` creates or reuses one **MyTrip Dashboard** Drive folder and places the one live spreadsheet inside it.
- Photos are organised below **MyTrip Dashboard/Photos** and backup spreadsheet copies below **MyTrip Dashboard/Backups**.
- Existing spreadsheet and folder IDs are preserved when moved, so live data and links continue working.
- Normal dashboard changes use the one live spreadsheet. Backup files are safety copies, not additional live databases.
- Sheet header repairs and credential updates are batched to reduce Apps Script calls as history grows.

## Trip announcement and rating rule

- Open a trip as Administrator and select **Announcement** in the Global Administrator access bar.
- Enter any message, choose Warning/Information/Good news, movement speed, and optional display dates.
- Turn on **Require rating after trip completion** and keep the grace period at 7 days, or choose 1–30 days.
- In **All trips → Traveller profiles → Pro plan**, choose **Complimentary Pro** only for accounts that may be rating-downgraded. Choose **Protected/Paid Pro** for accounts that must never be affected.
- A late Overall rating restores Complimentary Pro after that traveller has completed all overdue required trip ratings. No trip data is deleted.

## First login after updating

- Existing Administrator: username **`administrator`** plus the existing Administrator PIN/secret as the password.
- Existing traveller: permanent Traveller ID as username plus the existing personal PIN as the password.
- The login screen does not contain an Administrator/Traveller selector.
- Use **Show** to check the password while typing. The optional **Remember username on this device** choice stores only the username. MyTrip never saves the password, which must be entered for every login.
- Passwords are not readable after creation. A user with a verified email can use **Forgot password**; the Administrator can still reset a traveller from the Traveller profile.
- The Administrator may change both credentials from **Traveller profiles → Open profile → Edit login**. The current username must be typed to confirm the change, and the replacement username must be unique.
- A changed traveller username is automatically updated in all trip assignments; historical expenses and diary entries are preserved.

## Recover the global Administrator login

Recommended simple recovery:

1. Select `generateMyTripAdministratorLogin()` in Apps Script and click **Run**. No Script Properties are required.
2. Copy the generated username and temporary password from the **Execution log**.
3. Sign in and select **⚿ Change login** on the Administrator all-trips dashboard.
4. Save your preferred permanent username and password.

Running `resetMyTripAdministratorLogin()` with no Script Properties also generates the login automatically. The generated password is stored only as a secure hash; keep Apps Script project-editor access restricted.

Optional manual recovery functions are also available. Open **Apps Script → Project Settings → Script properties** and use the required option:

- Username only: add `MYTRIP_NEW_ADMIN_USERNAME`, then run `resetMyTripAdministratorUsername()`.
- Password only: add `MYTRIP_NEW_ADMIN_SECRET`, then run `resetMyTripAdministratorPin()`.
- Both username and password: add both properties, then run `resetMyTripAdministratorLogin()`.

The existing password is not readable. A reset replaces it with a new hash. The username must be unique and valid; the password must contain 6–64 characters. Temporary recovery properties are removed automatically after success. Once this updated script is saved, later recovery does not require another web-app deployment.

Do not create a new Apps Script project or spreadsheet. Updating the existing project preserves the same data and web-app URL.
