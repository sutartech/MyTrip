repo: sutartech/Malipatana
branch: main

## Last sync
date: 2026-09-17T09:30:00Z

### Updated in this project
- Bilingual public page (Odia/English) with per-visitor memory and an admin default.
- Notice board, remembrance days, important days and sticky notes — each admin-gated per surface.
- Household page: a family, its subfamilies and every member editable on one screen.
- Mobile: bottom tab bar, skeleton loaders, one-step-at-a-time start panel, real logo, Android manifest icon.
- Self-repair on boot: clears only its own stale keys, and only on positive evidence of corrupt storage.

## Files the live site needs
index.html · public.html · or.js · manifest.webmanifest · favicon.png · icon-180.png · icon-512.png · village.jpg

## Safe to delete in the repo
Malipatana Redesign.dc.html · support.js · public-notes.json · favicon.svg · favicon-32.png · README-malipatana.md · README.txt

## Screen map
| Screen | Built from |
| --- | --- |
| Sign in | index.html `#login` (.brandside / .formside), `initLoginScreen()` |
| Dashboard | `renderDashboard()`, `startPanel()`, `recurringPanel()`, `monthWorkHtml()` |
| Families / Members | `renderModule()`, `openProfile()`, `openMember()` |
| Household | `renderHousehold()`, `householdRoot()`, `openSubfamily()` |
| In memory | `renderMemorial()`, `openRemembranceCalendar()`, `recordDeath()` |
| Notice board | `MODULES.notices`, `noticesHtml()`, `paintLoginNotices()` |
| Major / recurring expenses | `MODULES.events`, `openEvent()`, `MODULES.recurring`, `payRecurring()` |
| Grievances | `MODULES.grievances`, public form in public.html |
| Admin tools | `openColumns()`, `openAccess()`, `openPrint()`, `renderPublicPage()` |
| Public page | public.html + or.js, reads `publicSummary` only |
| Backend | Code.gs (BE V1.5.0) — `setupEverything()`, then deploy a new version |

## Sync history
- 2026-09-12T12:05:00Z — dashboard redesign, photos, major/recurring expenses, admin tools.
- 2026-09-12T10:04:43Z — first read of the repo.
