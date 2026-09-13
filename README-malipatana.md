# Malipatana dashboard — what to upload

Two files matter. Everything else in this folder is working material.

## 1. index.html  →  GitHub
Upload over `index.html` in **sutartech/Malipatana** (GitHub → the file → edit/upload → Commit).
Live in about a minute on https://sutartech.github.io/Malipatana/ — hard-refresh (Ctrl/Cmd + Shift + R).

## 2. apps-script-photos.gs  →  Google Apps Script
Paste at the bottom of `Code.gs`, then run once each:
`setupPhotos()`, `setupEvents()`, `setupRecurring()`.
Add to your `bootstrap`:
```
events:    read_('Events'),
recurring: read_('Recurring Expenses'),
```
Then **Deploy → Manage deployments → Edit → New version → Deploy**.
The web app URL stays the same.

---

## What changed in the dashboard

**Look** — new sign-in screen (photo on top, wording below), layered cards, softer
paper ground, staggered entrance motion, lift-on-hover buttons, tighter figures.
Odia display type given the line height its matras need.

**Members**
- Photo per member: take/choose on a phone, resized in the browser, stored in
  Drive under *Malipatana Photos › Members › Family ID* — or paste a photo link.
- Thumbnail in each row; **View** opens a full member sheet with portrait,
  all details, and their medical / education / support / insurance records.

**Families**
- The family head is added as a member automatically (Relation = Self) on every
  family save, with **Add missing family heads** to backfill older families.
- Family profile lists members with thumbnails and links into each member.

**Major functions** (Raja Parba, Ratha Jatra, temple festivals)
- Budget, dates, in-charge, status.
- Add expenditure lines from inside the function; each becomes a real
  Expenditure row tagged to it, so it shows on the main Expenditure page.
- Budget meter, collected vs spent, **Mark completed**.
- "Village functions" summary panel on the Expenditure page.

**Recurring expenses** — electricity, priest, sweeper, rent: frequency, next due,
dashboard panel for what is due, and **Mark paid** which writes the expenditure
row and advances the due date in one click.

**Admin controls**
- **Columns** on Families/Members: show/hide standard columns, add your own
  (name + type) — created in the sheet too — rename, remove.
- **Quick edit**: every row becomes editable inputs with a per-row Save.
- Record IDs are editable by admins (old row replaced safely).
- **Access** per user on the Users page: add/edit, delete, and exactly which
  pages they may open.
- **Print**: choose columns, portrait or landscape, money totals, custom
  heading, remembered defaults, with a signature strip for the noticeboard.

**Settings sheet rows the app reads**
`Member Photos`, `Show Photo In Tables`, `Photo Max Size`, `Photo Folder`,
`Columns <Sheet>`, `Hidden <Sheet>`, `Print <Sheet>`, `Access <username>`.
