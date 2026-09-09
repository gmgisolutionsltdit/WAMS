# Finish the remaining Office Management items

Two items remain from the approved upgrade.

## 1. Attendance: fix expanded-row column span
- `src/pages/Attendance.tsx` — the expanded session row still uses `colSpan={11}` after the Status column was added; change to 12 so the session table spans the full width correctly.

## 2. Employee Management: Wing field with manual entry
- `src/pages/EmployeeManagement.tsx` — replace the hardcoded `WINGS = ["GMGI", "MORU"]` constant with the list loaded from the `company_wings` table (name + id).
- Wing select in the edit form lists active wings and includes an "+ Add new wing" option (admin/HR only) that opens a small inline dialog (name + code), inserts into `company_wings`, refreshes the list, and preselects the new wing.
- Save `wing_id` on the profile along with the legacy `company_wing` enum value (kept in sync so existing filters/reports keep working); employees in wings outside the enum still save correctly via `wing_id` and display the wing name.
- The list's wing filter dropdown uses the same dynamic wing list, and the table's Wing badge shows the wing name.

## Technical notes
- File touched: `src/pages/Attendance.tsx`, `src/pages/EmployeeManagement.tsx`.
- No migration needed: admin/HR insert/update policies on `company_wings` already exist from the previous turn.
- Wing display/filters keep working for legacy rows via `company_wing`; new selections store both `wing_id` and (when the wing is GMGI/MORU) the matching enum value.
