# Android: two different MyTrip icons

| Icon | Opens | Sign-in |
| --- | --- | --- |
| **MyTrip** · arrow | Account dashboard and assigned trips | Username/password or allowed email OTP |
| **Quick Expense** · arrow with ₹ badge | Saved shared trip expense form | No account login; active secure trip link required |

## Already have MyTrip? Keep it and add the second icon

This is the recommended route when Android shows only the main MyTrip app.

1. Upload this frontend update, including the whole `quick-expense/` folder.
2. Open your active shared expense link and tap **Add second home icon**.
3. The setup page shows both icons. Tap **Open Chrome to add second icon**.
   If Chrome does not open, use **Copy private expense link** and paste it into Chrome.
4. On the **expense form**, use **Chrome ⋮ → Install and create shortcut**
   (or **Add to Home screen**) → **Create shortcut**.
5. Name it **Quick Expense**, check the ₹ icon and tap **Add**.
6. Return to your Home screen. Keep both the original **MyTrip** app and the
   **Quick Expense** shortcut. The shortcut opens expense entry, not account sign-in.

A shortcut may be present only on the Home screen, not in All apps. The website
cannot inspect the launcher or add an icon without Android's confirmation.
“Trip link saved” is no longer shown as proof of Android installation.

## Optional full PWA installation

1. Administrator opens the trip → **Expenses → Manage links** and creates/enables a trip-wide or personal Quick Expense link.
2. Open that full secure link in **Chrome** on Android. If opened inside WhatsApp/Gmail, choose **Open in Chrome** first.
3. On the expense form, tap **Add second home icon**. It opens the dedicated Quick Expense installer.
4. If Chrome offers **Install Quick Expense**, you can use it. Check the installation name is **Quick Expense**, not **MyTrip**. If not offered, use the shortcut route above.
5. Wait for Android to finish. Tap the new ₹ icon. It opens the saved trip expense form without username/password/OTP.

Keep the normal MyTrip icon. Installing Quick Expense does not change its login flow.

## If Chrome shows no second Install prompt

Google documents limitations when one PWA sits within another app's URL scope.
This build has distinct manifest IDs and a narrower Quick Expense scope, but
Chrome may still suppress the inner app's automatic installation prompt.

Use Chrome **⋮ → Add to Home screen → Create shortcut** (wording varies).
Name it **Quick Expense**. A shortcut still opens the expense entry directly;
whether Android shows it in the app drawer or only on the home screen is
controlled by Chrome/Android. You do not need to uninstall the existing MyTrip
app to add a home-screen shortcut. A fully separate origin is the stronger long-term option,
but this release does not create a new domain or repository.

## Troubleshooting

- Old icon opens login: remove only that incorrect Quick Expense shortcut and create it again from the dedicated expense form. Do not remove the working MyTrip app.
- New shared links point directly to `quick-expense/index.html`; old root-page expense links redirect there, preserving their token. The normal MyTrip address is not changed.
- Camera permission, storage and site-data clearing are still shared by both icons on the same website.
- New icon says **Link your Quick Expense icon**: paste the original full secure link. No account login is needed.
- Link paused/expired: Administrator must enable it or change its validity period. Installation never bypasses these controls.
- Cleared Chrome data / changed profile: the saved trip link must be supplied again.
- One Quick Expense installation stores one selected link. Installing another trip link replaces its saved trip on that browser profile; the main MyTrip app still shows all authorised trips.
- No internet: an already opened form can queue a new expense on the device. Keep the link active and reopen it online to sync. A first-ever visit and receipt photo uploads require internet.
- Treat the link as an access key. Anyone holding it can use the abilities the Administrator allowed. Use a trusted phone and pause the link if it is lost.

## Checked in this release

Manifest identity/start URL/scope, generated app entry consistency, missing-link
recovery, stored-token handling, install-request vs install-complete messaging,
second-icon instructions, private-link copying, Android Chrome intent fallback,
no-login UI routing and separate MyTrip routing are covered by local checks.
A physical Android/Chrome installation has **not** been tested in this environment.

Primary guidance: https://web.dev/articles/building-multiple-pwas-on-the-same-domain
and https://developer.chrome.com/docs/capabilities/pwa-manifest-id .
