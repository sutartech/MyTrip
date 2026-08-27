# MyTrip Dashboard 4.7.0

This sticky build keeps the exact **Frontend v4.7.0** and **Backend v4.6.0**, while adding a collapsible colourful sticky-note system and a separate colourful Experiences tab.

The dashboard requires Google backend **v4.6.0**. Existing trips, travellers, plans, places, expenses and experience notes are preserved.

## What changed

- A slim **Sticky notes** tab remains collapsed on the right side of the dashboard.
- It opens a slide-out panel containing active Targets and Reminders plus a separate **Sticky Note Diary** for completed items.
- Sticky notes support multiple lines, five colours, optional due date, edit, delete, complete and reopen.
- Pinned notes float above the dashboard and can be moved, resized, auto-fitted or unpinned back to the panel.
- Active sticky notes are stored for each Trip ID in the current browser. When marked complete, the full entry is archived in the separate `StickyNoteDiary` Google Sheet and becomes available in completed history.
- The Administrator always has sticky writing access. Under **Travellers → Control access**, the Administrator can allow or block **Write sticky notes** for each personal Traveller ID. New traveller assignments start blocked; shared trip-PIN access is view-only.
- **Experiences** now has its own colourful dashboard tab instead of appearing below Itinerary.
- After five minutes without activity, the open trip closes and requires login again.
- The login page includes **Clear cache & reload**. It clears browser caches and service workers while preserving the backend URL and active sticky notes.
- The login page and trip dashboard both show the frontend and connected backend versions.
- In **Travellers**, the Administrator can open **Control access** for a named traveller and independently allow or hide:
  - Itinerary
  - Experience notes
  - Places & Map
  - Expenses
  - Traveller list
  - Print & Export
  - Write sticky notes
- Hidden records are withheld by the Google backend, not merely hidden with page styling.
- These controls apply to personal Traveller ID login for that one trip. The shared trip PIN remains common because it does not identify an individual traveller.
- The Administrator can add, change or remove a trip cover photo from the Overview or **Manage → Trip photo**.
- JPEG, PNG and WebP files up to 3 MB can be uploaded from a phone or computer and stored in the deploying Administrator's Google Drive.
- A public HTTPS image link can be used instead of uploading a file.
- The cover photo is included in the printable trip book.
- Existing experience notes, traveller-wise expense totals, multi-trip personal Traveller IDs, PIN management and duplicate-profile deletion remain available.

## Step 1 — Update Google Apps Script

This feature requires the supplied **Backend v4.6.0 Sticky build**, even if the current live backend already displays v4.6.0. The visible version number stays unchanged, but the supplied backend adds the `StickyNoteDiary` sheet and permission column.

1. Replace the entire Apps Script `Code.gs` with `backend/Code.gs` from this ZIP.
2. Save and run `setupMyTrip()` once. Existing data is preserved.
3. Choose **Deploy → Manage deployments → Edit → New version → Deploy**.
4. Keep the same `/exec` URL in `config.js`.

## Step 2 — Update GitHub Pages

Replace these files in the `MyTrip` GitHub repository:

1. `index.html`
2. `app.js`
3. `styles.css`

Keep the existing `config.js` so the connected `/exec` URL is not changed.

Wait about two minutes, then use a hard refresh. On a phone, close the old tab and reopen the dashboard.

## Check the update

1. The login page should show **Frontend v4.7.0** and **Backend v4.6.0**.
2. Log in as Administrator and open a trip.
3. Confirm **Experiences** appears as a separate colourful tab.
4. Open the slim **Sticky notes** tab on the right side.
5. Add a coloured note, pin it, move it, resize it and use **Auto-fit**.
6. Mark it complete and confirm it moves into **Sticky Note Diary** and appears as a row in the `StickyNoteDiary` Google Sheet.
7. Open **Travellers → Control access** and verify **Write sticky notes** can be enabled or blocked per personal Traveller ID.
8. Leave a logged-in trip idle for five minutes and confirm it returns to the login page.
