# MyTrip and Quick Expense: two home-screen icons

Frontend v4.67.1 · Backend v4.32.1 (backend unchanged in this patch).

Keep the existing MyTrip app. The second Quick Expense icon can be a direct
Android home-screen shortcut; a second native PWA installation is optional.
Both open the same trip records, subject to the Administrator's link controls.

## What changed

- New shared links open the dedicated Quick Expense page and use its ₹ icon.
- Old root-page expense links redirect there, retaining the private link token.
- A saved trip link or app-style window no longer produces a false Installed label.
- Add second home icon stays available even inside an existing app window.
- The setup page shows both icons and provides Open Chrome, private-link copy,
  and Create shortcut instructions. It does not tell you to uninstall MyTrip.
- The copied direct link retains the trip token in its fragment, not a server
  query parameter. It opens expense entry, never the account-login page.
- Invalid/missing links and blocked browser storage have explicit recovery paths.

## Apply this update

Upload the frontend files from this ZIP, including index.html, app.js, app.css,
sw.js, config.js, and the whole quick-expense/ folder. Keep existing records.
Do not set config.js API_URL to your website address; use the Apps Script /exec URL.
The backend must already be v4.32.1; the included Code.gs is unchanged.

Then open the active shared expense link → Add second home icon → Open Chrome.
On the expense form choose Chrome ⋮ → Install and create shortcut (or Add to
Home screen) → Create shortcut → name Quick Expense → Add.
Keep your existing MyTrip app for account login.

## Checked

26 behaviour/security tests and 10 DOM integration tests passed. The two-icon
setup layout was inspected in the preview browser. Backend code is unchanged.
A physical Android launcher/Chrome installation has not been tested here;
Android still requires the phone owner to confirm Add/Install. Same-origin
PWAs can suppress a second native install prompt, so the manual home-screen
shortcut remains the supported fallback.

The website cannot inspect your Home screen. Verify the two icons on the phone.
See ANDROID-QUICK-EXPENSE.md for the full instructions and security notes.
