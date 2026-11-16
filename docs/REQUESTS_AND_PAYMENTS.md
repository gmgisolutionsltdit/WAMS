# Request types, approval tiers, and payment rules

This documents the parts of WAMS that are easy to accidentally break while
"just" fixing something else: who is allowed to approve what, and how a
payment's numbers are actually built up. Read this before changing approval
RLS policies, the Payment page's calculations, or the Trash/delete flow for
any request type.

## Request types

| Type | Table | Employee submits | What approval does |
|---|---|---|---|
| Overtime (OT) | `overtime_requests` | Requested hours for a date | Sets status; an admin/manager grants the actual OT hours to approve (can differ from the request) |
| Manual Time | `manual_time_requests` | Clock-in/out correction for a date | Sets status; approver can override the suggested overtime hours |
| Late Time | `late_time_requests` | Late-arrival waiver or an office-time change | Sets status; approving a late waiver or office-time change re-stamps that day's attendance via a DB trigger |
| Leave | `leave_requests` | Leave type + date range | Sets status; approving deducts from the employee's leave balance in application code |
| Loan (Personal Advance) | `personal_advances` | Amount + installment plan | Sets status; approved loans are paid down over time via Payment's monthly deduction |
| Expense Claim | `expense_claims` | Category + amount (claims) or a cash advance (`entry_type = 'advance'`) | Sets status; approved claims become part of the employee's Expense Balance on Payment |

## Approval tiers

Approval is **role-tier based, not reporting-chain based** — any approver
whose tier is strictly higher than the requester's tier can decide their
request, regardless of who manages whom. Defined once, in
`approval_tier()`/`can_approve()` (see
`supabase/migrations/20260918100000_flat_approval_hierarchy.sql`):

| Role | Tier |
|---|---|
| executive | 4 |
| admin / hr | 3 |
| manager / supervisor | 2 |
| employee (default) | 1 |

`can_approve(approver, requester)` is just
`approval_tier(approver) > approval_tier(requester)`. This single pair of
SQL functions backs the RLS SELECT/UPDATE policies on all four request
tables above (Overtime, Leave, Manual Time, Late Time) — a user with
multiple roles is scored at their **highest** tier. Loan and Expense
approval in the Approvals/Payment pages follow the same admin/manager-only
convention at the application level.

**If you change who can approve what:** update `approval_tier()` (one
function, one migration) rather than adding per-table checks — every
request type's RLS policy already reads from it.

## Payment rules

Everything on the Payment page is **computed live from approved
requests/claims/loans** — nothing is cached or snapshotted until an admin
actually records a settlement for a month (`payroll_settlements`). That's
why restoring a mistakenly-deleted Overtime/Manual Time/Loan/Expense row
from Trash (see below) reflects in Reports/Payment automatically, with no
manual resync step.

### Net Time Balance (Overtime)

```
Net Time Balance = Approved OT (this month, cumulative to date) − Due (late/shortfall deductions)
                  + Carried from Before (prior months' unpaid net OT)
                  − already paid out in a prior settlement
```

- "Due" comes from Late Time shortfalls/deductions, not a separate request type.
- Checking **Adjust Now** on the OT card settles the typed amount this
  month; leaving it unchecked carries the whole balance to next month's
  Net Time Balance instead.
- "Pay full" (added for item 5) just fills the amount box with the full
  outstanding figure — it doesn't change how the figure itself is computed.

### Expense Balance

```
Expense Balance = Σ approved claims (entry_type ≠ 'advance')
                 − Σ outstanding cash advances (entry_type = 'advance', unrecovered)
                 − already paid out in a prior settlement
                 − this month's own reimbursement (once recorded)
```

- A cash advance (`entry_type = 'advance'`) is recovered against future
  claims via `recovered_amount` on the advance row, not paid out directly.
- **A claim with `recovered_amount > 0` cannot be deleted** (in Approvals,
  Payment, or sent to Trash) — deleting it would cascade-delete its
  `expense_recovery_actions` rows and silently erase that recovery ledger.

### Loan Due

```
Loan Due (this month) = min(monthly_deduction, remaining_balance)
```

- Paying it (Adjust Now checked) reduces `remaining_balance` by the paid
  amount; leaving it unchecked just defers that month's installment —
  `remaining_balance` is untouched either way until it's actually paid.

### Net Payment

```
Net Payment = Gross Salary (always included)
            + Overtime amount, only if its Adjust Now is checked
            + Expense amount, only if its Adjust Now is checked
            + Loan amount, only if its Adjust Now is checked
```

Gross Salary itself is never optional — Overtime, Expense, and Loan are
each independently opt-in per month via their own Adjust Now checkbox.

## Trash and deletes

Deleting an Overtime, Manual Time, Loan, or Expense row moves a full
snapshot into `trash_bin` first (restorable for 30 days, or until an admin
empties that tab) and only then deletes the real row — see `src/lib/trash.ts`.
Every such delete's success toast includes an **Undo** button that restores
it immediately via the same `restore_from_trash` RPC the Trash page itself
uses.

**Late Time and Leave intentionally skip Trash** and go straight to a
permanent delete. Restoring either from a raw snapshot would re-insert the
row without replaying the side effect that only fires through the real
approval code path — the attendance-stamp trigger for Late Time, the
leave-balance deduction in application code for Leave — so a "restored"
row would look approved while that effect stays missing. If you ever add
Trash support for these two, you must also replay that side effect on
restore, not just re-insert the row.
