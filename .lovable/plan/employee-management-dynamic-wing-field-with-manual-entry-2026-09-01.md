# Employee Management: dynamic Wing field with manual entry

Last remaining item from the Office Management upgrade. All work is in `src/pages/EmployeeManagement.tsx`.

## What changes
- Load wings from the company wings table instead of the hardcoded GMGI / MORU list.
- The Wing selector in the employee edit/create form lists all active wings and adds an "+ Add new wing" option, visible only to admin and HR.
- Choosing "Add new wing" opens a small dialog (wing name + short code), creates the wing, refreshes the list, and preselects it for the employee being edited.
- Saving an employee stores the selected wing on their record; for GMGI/MORU the existing legacy wing value is kept in sync so current filters and reports keep working.
- The list's Wing filter dropdown and the Wing badge in the table use the same dynamic wing list.

## Technical notes
- Fetch `id, name, code, active` from `company_wings`, ordered by name; replace the `WINGS` constant.
- Persist `wing_id` on `profiles` on both create and edit paths, plus `company_wing` when the wing name matches the existing enum values (GMGI/MORU).
- Wing filter compares by `wing_id` with a fallback to `company_wing` for legacy rows without a wing id.
- No migration needed — admin/HR insert and update policies on the wings table already exist.
