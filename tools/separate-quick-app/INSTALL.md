# Install Quick Expense separately from MyTrip

This is a separate installation shell, not a new database or another copy of
the expense logic. It uses the existing MyTrip frontend and Google backend.
The icon is the same colourful MyTrip arrow, with a small superimposed ₹ badge.

## First update the existing MyTrip website

Upload the supplied main MyTrip FE v4.67.10 frontend. Keep the working Apps Script
/exec URL in config.js. Deploy BE v4.32.2 so the no-login form can display
family groups; existing links remain valid. No new sheet is needed.
The shared app.js must support standalone mode; the shell checks this before
loading it, so an older build cannot silently send you back to MyTrip.

## Create the separate GitHub Pages app

1. In your sutartech GitHub account create a PUBLIC repository named QuickExpense.
   Do not delete or rename MyTrip. Do not upload these files inside MyTrip.
2. Extract MyTrip-QuickExpense-Separate-App.zip. All runtime files are at its
   top level: upload them directly to the new QuickExpense repository. There
   are no folders to create. INSTALL.md is optional.
3. In the NEW repository open Settings > Pages. Choose Deploy from a branch,
   select main and /(root), then Save. Use the actual Pages URL shown there.
   With this account/name, the planned address is
   https://sutartech.github.io/QuickExpense/ (it is not created by this ZIP).
4. Open the published address in Android Chrome, not inside WhatsApp or Gmail.
5. If prompted, paste the complete ACTIVE Quick Expense link from MyTrip once.
   No username/password/OTP is needed. On the same browser it can initially
   reuse a saved MyTrip quick link; after opening it keeps its own selected trip.
6. Tap Install Quick Expense, or Chrome menu > Install and create shortcut /
   Add to Home screen > Install. Confirm the name Quick Expense and the ₹ badge.
7. Keep the normal MyTrip app. The two addresses/scopes and installed identities
   are different. Remove an OLD incorrect Quick Expense shortcut only if needed.

If Chrome offers only Create shortcut, that is not a native PWA installation.
Send the displayed Chrome installation screen; do not send the private link.
Android must confirm Add/Install. A physical Android install is not verified here.

## Security and limitations

- The app preserves the Administrator's link validity, pause, view/edit and
  history limits. Installing it does not expand those permissions.
- Treat a shared link as an access key. Do not publish the private link in a
  repository, manifest, screenshot or support message.
- The separate shell stores no account password. Forgetting its saved trip
  does not erase the MyTrip app's saved quick link or revoke the original URL.
- Camera, receipts and bill OCR keep using the existing MyTrip implementation.
  The main ocr folder is NOT uploaded again to this separate repository.
- Both paths are still on the same origin. Browser site data/permissions may be
  shared, even though installation scopes do not overlap. Avoid clearing all
  site data. A dedicated subdomain/origin remains the strongest isolation.
- The shell caches layout code only, not backend responses or receipt images.
  First opening and reading/saving trip data require an internet connection.
- Do not host this package below /MyTrip/; that would recreate the nested-scope
  problem. No new repository/domain has been created or published automatically.
