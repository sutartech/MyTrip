# MyTrip Google Backend 4.6.0 Account Setup

The supplied backend is required even when the existing deployment already reports **v4.6.0**. This build adds:

- One common username/password login that identifies the account automatically
- One all-trips dashboard for each signed-in account
- `StickyNoteDiary` Google Sheet support
- Administrator-controlled sticky-note writing
- Google Sheet saving for full and inline expense edits
- Global Administrator-controlled numeric trip-creation limits for every traveller account
- A Drive-backed `TripPhotos` gallery with trip-wide switches and per-traveller upload limits

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
10. Test `YOUR-EXEC-URL?action=ping`. It must return backend `4.6.0` with `accountLogin: true`, `stickyNoteDiary: true`, `travellerCredentialEdit: true`, `administratorLoginEdit: true`, `travellerTripCreation: true`, `travellerTripCreationQuota: true` and `tripPhotoGallery: true`.

## Trip creation and photo controls

- Open **Traveller profiles → Set trip limit** and enter the maximum number of trips that account may create (0–100). Enter 0 to disable creation. The Administrator can raise or lower the limit later; assigned trips do not count and existing trips are never deleted.
- Inside a trip, open **Trip Photos** to enable or disable traveller uploads for that trip.
- Open **Travellers → Control access** and enter a whole-number photo limit from 0 to 50. Enter 0 to disable that traveller.
- Photo files are created in the Apps Script owner’s Google Drive. The `TripPhotos` Sheet stores the Drive link, caption, traveller ownership and timestamps.
- Travellers can replace or delete their own images only. Administrators can manage every image. Shared trip-password access can view but cannot upload.

## First login after updating

- Existing Administrator: username **`administrator`** plus the existing Administrator PIN/secret as the password.
- Existing traveller: permanent Traveller ID as username plus the existing personal PIN as the password.
- The login screen does not contain an Administrator/Traveller selector.
- Use **Show** to check the password while typing. The optional **Remember username on this device** choice stores only the username. MyTrip never saves the password, which must be entered for every login.
- Passwords are not readable after creation. If a traveller forgets the personal password, the Administrator must reset it from the Traveller profile.
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
