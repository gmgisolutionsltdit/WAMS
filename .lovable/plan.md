# Office Management System Upgrade Plan

This is a large, multi-area change. I'll break it into 4 deliverable phases so you can approve all or pick subset. Each phase ships independently.

---

## Phase 1 — Leave & Attendance Rules

**1.1 48-hour retro lock**
- New helper `src/lib/dateRules.ts` → `isWithin48h(date)`, `minAllowedDate()`.
- Apply in: `Attendance.tsx` (regularization / manual logs), `OTRequests.tsx` (date field), `LeaveManagement.tsx` (back-dated start), `DailyWorkLogDialog.tsx`.
- Disable older dates in `<Calendar disabled={...}>` and native `<input type="date" min={...}>`.
- Server guard: DB trigger `enforce_48h_window` on `attendance_logs`, `overtime_requests` insert/update — raises exception if `date < now()::date - interval '2 days'` AND record is being created/edited now. Admins bypass via `has_role(auth.uid(),'admin')`.
- Toast: "Submissions for dates older than 48 hours are restricted."

**1.2 Holiday bridging in leave calc**
- Already partially handled by `sandwich_leave` flag. Add new `bridge_holidays` boolean on `leave_types` (default true).
- Update `computeWorkingDays` in `LeaveManagement.tsx`: when `bridge_holidays=true`, count ALL days in range (weekends + holidays inclusive) — pure inclusive count. Sandwich logic still applies to leave-types that have it off.
- UI toggle in SettingsPage Leave Defaults.

**1.3 AM/PM bottom dropdown + live hours**
- New component `src/components/TimeWithMeridiem.tsx` — two number inputs (hh:mm) + Select(AM/PM) below.
- Wire into OT request form (`OTRequests.tsx`) and attendance manual entry. Recompute `calculatedHours` via `useMemo` on every change.

---

## Phase 2 — Wings & Role Matrix

**2.1 Dynamic Wings**
- New table `company_wings (id, name, code, active, created_at)`. Seed with existing `GMGI`, `MORU`.
- Migrate `profiles.company_wing` from enum to text FK-style (keep enum but allow free text via new column `wing_id uuid` nullable; phase 1 keep both in sync).
- Admin UI in `SettingsPage` → new "Wings & Hierarchy" tab. CRUD list, add/edit/disable wings.
- Hierarchy: new table `wing_designations (id, wing_id, title, level, parent_id)` to model GM → GMGI → GMGI IT → HOI tree. Tree view + drag reorder (simple ↑↓ buttons to keep scope tight).

**2.2 Role matrix migration (admin / supervisor / employee)**
- Add `'supervisor'` to `app_role` enum (keep `manager` for legacy).
- New SECURITY DEFINER `is_supervisor_of(_sup, _emp)` = current `is_in_management_chain` semantics but for direct downline only (`reporting_manager_id = _sup`).
- Update RLS on `leave_requests`, `overtime_requests`, `attendance_logs`: add supervisor policies parallel to manager ones.
- `AuthContext.tsx` role precedence: admin > supervisor > hr > executive > manager > employee.
- New Admin UI: SettingsPage → "Role Migration" panel listing users with `manager` role and a button "Migrate to Supervisor" (adds `supervisor` row, optionally removes `manager`).
- Keep manager RLS intact — nothing breaks.

---

## Phase 3 — Salary Increment Ledger

- New table `salary_increments`:
  ```
  id uuid pk, user_id uuid, cycle_label text,
  effective_from date, effective_to date,
  base_salary numeric, increment_amount numeric, increment_pct numeric,
  reason text, approved_by uuid, created_at, updated_at
  ```
- Overlapping date ranges allowed (no exclusion constraint), GIST index for audit queries.
- RLS: payroll roles manage, employee views own.
- UI: new page `src/pages/SalaryIncrements.tsx` listing per-employee timeline with Cycle 1 / Cycle 2 chips. Add to sidebar under Payroll (HR/Admin only).

---

## Phase 4 — OT Routing Fix

- Bug: requests over the "2 office days" benchmark sometimes have no `approver_id` populated, so they don't show in supervisor queue.
- Add `assigned_approver_id` column on `overtime_requests`.
- DB trigger `route_ot_request_to_supervisor` (BEFORE INSERT/UPDATE on status='pending'):
  - lookup `profiles.reporting_manager_id` for `user_id` → set `assigned_approver_id`.
  - if null, fallback: any admin user → set.
- `Approvals.tsx` queue queries by `assigned_approver_id = auth.uid() OR is_in_management_chain(...)`.
- Notification: existing `notifyManagersAndAdmins` already fires; add explicit `notifyEmployee(assigned_approver_id, ...)` after insert.
- Backfill existing pending requests via one-time UPDATE.

---

## Files Created

- `src/lib/dateRules.ts`
- `src/components/TimeWithMeridiem.tsx`
- `src/pages/SalaryIncrements.tsx`
- Migrations (one per phase)

## Files Edited

- `src/pages/OTRequests.tsx`, `Attendance.tsx`, `LeaveManagement.tsx`, `SettingsPage.tsx`, `Approvals.tsx`, `AppSidebar.tsx`, `AuthContext.tsx`, `DailyWorkLogDialog.tsx`

---

## Open questions before I start

1. **Scope**: Approve all 4 phases in one go, or land Phase 1 first then iterate?
2. **48h rule**: Should Admins/HR be allowed to bypass (recommended), or hard-locked for everyone?
3. **Wings migration**: OK to keep the existing `company_wing` enum column alongside new `wing_id`, then deprecate later? (safest path)
4. **Manager role**: After admin migrates a user to Supervisor, should the legacy `manager` role auto-remove or stay until manually cleared?
