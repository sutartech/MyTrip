# MyTrip Shared Dashboard

MyTrip is a free shared travel planner designed for:

- GitHub Pages as the frontend
- Google Apps Script as the backend
- Google Sheets as the database
- Google Maps links and embedded maps

## Included features

- Create a trip with destination, dates, budget and organiser
- Open every trip with one global Administrator password/PIN
- Give every trip its own separate shared Traveller PIN
- Create a personal Traveller ID and PIN that opens all trips assigned to that traveller
- Assign multiple travellers to one trip and one traveller to multiple trips
- View Trip IDs and switch between every trip from one Administrator screen
- Edit, disable/enable or permanently delete a trip from the Administrator dashboard
- Verify Google backend version 4.3 before creating or managing trips
- Save detailed traveller profiles without assigning any trip
- Give every traveller a separate personal PIN and add several travellers to one trip together
- Automatic role detection with permissions enforced by the Google backend
- In-page Google backend connection and verification for existing GitHub sites
- Share one live trip with several people
- Build a day-by-day itinerary
- Save places and open them in Google Maps
- Enter expenses with date, category and who paid
- See total budget, spent amount and balance
- Let travellers add and edit itinerary items, places and expenses without exposing destructive admin controls
- Let the administrator manage saved places, travellers, PINs, edits and deletions
- Print the itinerary only
- Print the expense statement only
- Print a complete trip book or save it as PDF
- Responsive desktop and mobile layout
- Working demo mode before backend setup

## Project files

| File | Purpose |
| --- | --- |
| `index.html` | Main GitHub Pages dashboard |
| `styles.css` | Colours, layout, mobile and print design |
| `app.js` | Dashboard interactions and backend connection |
| `config.js` | Optional default Google Apps Script `/exec` URL |
| `backend/Code.gs` | Google backend and Sheet database code |
| `backend/appsscript.json` | Apps Script project settings |
| `SETUP-GUIDE.md` | Complete non-coder deployment instructions |

Start with `SETUP-GUIDE.md`.

## Access and security

MyTrip uses one **global Administrator password/PIN** (6–64 characters) for the organiser. It opens the **All trips** screen and every individual trip. An administrator can also create a named **Traveller ID** with one personal PIN and assign any number of trips to it. A separate shared Traveller PIN remains available for opening one trip without a personal account. The Google backend checks the role and assignment again for every request.

| Capability | Administrator | Traveller |
| --- | :---: | :---: |
| View and switch between all trips | ✓ | — |
| View every personally assigned trip | ✓ | ✓ |
| View trip, maps and reports | ✓ | ✓ |
| Add/edit itinerary, places and expenses | ✓ | ✓ |
| Create accounts and assign multiple travellers | ✓ | — |
| Edit, disable/enable or delete a trip | ✓ | — |
| Delete records | ✓ | — |
| Change the global Administrator secret | ✓ | — |
| Change the current trip’s Traveller PIN | ✓ | — |

Only SHA-256 hashes of the access secrets are stored. Keep the global Administrator password/PIN private. Give each named traveller only their own Traveller ID and personal PIN.

This lightweight PIN model is suitable for ordinary travel plans and expenses. Do not store passports, card numbers, passwords, medical records or other highly sensitive data in this dashboard.
