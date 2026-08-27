# MyTrip Google Backend 4.6.0 Sticky Setup

The completed Sticky Note Diary **does require the supplied backend**, even when the existing deployment already reports **Backend v4.6.0**. The visible version remains v4.6.0, but this Sticky build adds:

- A `StickyNoteDiary` Google Sheet for completed entries
- A `canWriteStickyNotes` assignment column controlled by the Administrator
- Backend validation that blocks unauthorised sticky completion

Existing trips, travellers, expenses, experiences and other records are preserved.

1. Open the Apps Script project currently used by MyTrip.
2. Replace its entire `Code.gs` with the new `backend/Code.gs` supplied in the ZIP.
3. Click **Save**.
4. Choose the function `setupMyTrip` and click **Run** once.
5. Approve the requested Spreadsheet and Drive permissions. Drive is used for photos uploaded through MyTrip.
6. Wait for the execution to finish successfully. The `StickyNoteDiary` sheet and missing access-control columns are added; existing rows are not deleted.
7. Choose **Deploy → Manage deployments → Edit**.
8. Under Version, select **New version** and click **Deploy**.
9. Confirm access remains **Anyone** and keep the same `/exec` URL.
10. Open MyTrip and confirm the page shows **Frontend v4.7.0 · Backend v4.6.0**.
11. Complete a sticky note and confirm a row appears in the spreadsheet tab named `StickyNoteDiary`.

Do not create a new Apps Script project or spreadsheet. Updating the existing project keeps the same data and web-app URL.
