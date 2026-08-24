# Finish the Office Management upgrade (remaining 5 items)

The database work (manual time requests, late time requests, approval routing, history lock) and the two new dialogs already exist. What's left is wiring them into the app.

## 1. Dashboard: self-service Manual Entry + Late Time Request
- Replace the current admin-only "Manual Entry" dialog in the dashboard with the existing `ManualTimeEntryDialog`, available to every role (admin records directly, everyone else submits for approval).
- Add the `LateTimeRequestDialog` button next to it, passing the employee's approved office start/end times.
- Keep the 48-hour restriction on the date field.

## 2. Approvals page: Manual Time & Late Time sections
- Add two new sections on the Approvals page listing pending manual time requests and pending late time requests.
- Visible to admins (all requests) and to reporting managers (requests routed to them).
- Each row: employee, date, requested times/hours or late details, reason; Approve / Reject with a note. Approval triggers already write the attendance record or update office hours.
- Notify the employee of the outcome, matching the existing OT notification pattern.

## 3. Attendance history: late status and extra-work penalty
- In the attendance history table, mark a day as Late when arrival is past the approved start time plus grace (default 09:00 + 11 min).
- Add the 2h 40m penalty to that day's due time and show a "Late" badge with the late minutes.

## 4. Admin leave approvals
- Give admin, HR, and supervisor access to the Team Requests tab (currently manager/admin only).
- Sort pending requests first and show a pending count badge on the tab so awaiting approvals are obvious.

## 5. Employee Management: Wing field with manual entry
- Replace the fixed GMGI/MORU wing dropdown in the employee edit form with a list loaded from the wings table, plus an "Add new wing" option that creates a wing inline (admin/HR only).
- Save the selected wing on the employee record and keep the wing filter on the list in sync.

## Technical notes
- Files touched: `src/pages/Index.tsx`, `src/pages/Approvals.tsx`, `src/pages/Attendance.tsx`, `src/pages/LeaveManagement.tsx`, `src/pages/EmployeeManagement.tsx`; reuse `src/components/ManualTimeEntryDialog.tsx`, `src/components/LateTimeRequestDialog.tsx`, `src/lib/officeTime.ts`.
- Wing selection uses the existing `company_wings` table and the `wing_id` column on profiles; the legacy `company_wing` enum value stays in sync for existing filters/reports.
- No new tables expected. A small migration may be needed only if inserting wings from the UI requires an admin/HR insert policy on `company_wings`.
