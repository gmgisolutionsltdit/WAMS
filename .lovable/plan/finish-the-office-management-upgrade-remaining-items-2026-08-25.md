# Finish the Office Management upgrade (remaining items)

## 0. Fix the dashboard crash
The Dashboard still calls a removed form setter (`setManualForm`) when loading settings, which throws at runtime. Remove that call — the new Manual Entry dialog loads its own defaults from settings.

## 1. Approvals page: Manual Time & Late Time sections
- Add two sections to the Approvals page listing pending manual time requests and pending late time requests.
- Visible to admins (all requests) and reporting managers (requests routed to them).
- Each row: employee, date, requested times/hours or late details, reason, plus Approve / Reject with an optional note. The existing database triggers already write the attendance record or update office hours on approval.
- Notify the employee of the outcome, matching the current overtime notification pattern.

## 2. Attendance history: late status and extra-work penalty
- Mark a day Late when arrival is past the employee's approved start time plus grace (default 09:00 + 11 min).
- Add the 2h 40m penalty to that day's due time and show a "Late" badge with the late minutes.

## 3. Employee Management: Wing field with manual entry
- Replace the fixed GMGI/MORU wing dropdown in the employee edit form with the list loaded from the wings table, plus an "Add new wing" option that creates a wing inline (admin/HR only).
- Save the selected wing on the employee record and keep the wing filter on the list in sync.

## Technical notes
- Files touched: `src/pages/Index.tsx`, `src/pages/Approvals.tsx`, `src/pages/Attendance.tsx`, `src/pages/EmployeeManagement.tsx`; reuse `src/lib/officeTime.ts` and `src/lib/notifications.ts`.
- Wing selection uses the existing `company_wings` table and the `wing_id` column on profiles; the legacy `company_wing` value stays in sync so existing filters and reports keep working.
- No new tables. One small migration may be needed if creating wings from the UI requires an admin/HR insert policy on the wings table.

Already completed earlier: the database tables and routing triggers, the two dialogs, the Dashboard "Time Requests" card, and the leave approvals fix (tab access for admin/HR/supervisor, pending-first sorting, pending count badge).
