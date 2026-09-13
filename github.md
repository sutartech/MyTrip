repo: sutartech/Malipatana
branch: main

## Last sync
date: 2026-09-12T12:05:00Z

### Updated in this project
- Rebuilt the dashboard's visual layer over the live index.html (no class or JS renames).
- Added member photos (Drive), member detail sheet, automatic family-head member.
- Added Major functions and Recurring expenses, both feeding the Expenditure ledger.
- Added admin controls: column manager, quick row edit, per-user access, column-wise print.

## Screen map
| Screen | Built from |
| --- | --- |
| Sign in | index.html `#login` (.brandside / .formside) |
| Dashboard | index.html `renderDashboard()` + `recurringPanel()` |
| Families / Members | `renderModule()`, `openProfile()`, `openMember()` |
| Major functions | `MODULES.events`, `openEvent()`, `functionsPanel()` |
| Recurring expenses | `MODULES.recurring`, `payRecurring()` |
| Admin tools | `openColumns()`, `saveRow()`, `openAccess()`, `openPrint()` |
| Backend | apps-script-photos.gs (photos, columns, Events, Recurring) |

## Sync history
- 2026-09-12T10:04:43Z — first read of the repo; redesign + photo add-on.
