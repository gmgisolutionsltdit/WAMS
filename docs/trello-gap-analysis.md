# Trello-Style Boards — Gap Analysis

Audited against the existing "Tasks" feature (`src/pages/Tasks.tsx`, `src/pages/TaskBoard.tsx`,
`src/components/kanban/*`, `supabase/migrations/20260427145911_*.sql`,
`supabase/migrations/20261021080000_task_checklist_items.sql`). The feature is a
project → board → column → task kanban built on `projects`, `task_boards`,
`task_columns`, `tasks`, `task_comments`, plus (schema-only, no UI yet)
`task_attachments`, `task_activity`, `task_watchers`, and the new
`task_checklist_items`. Reusable app infra: generic `notifications` table +
`useNotifications`/`NotificationBell`, `useRealtimeSubscription` (Supabase
Realtime), `AttachmentsInput`/`lib/attachments.ts` (Storage upload helper used
elsewhere), `EmployeePicker` (single-select).

## 1. Workspaces & Boards

| ID | Feature | Status | Evidence / Notes |
|---|---|---|---|
| B-01 | Workspaces | N/A | No workspace concept; `projects` is the only grouping container and already scopes members/wing. Adding a workspace layer above projects is possible but not needed for parity — projects already function as boards' parent container. |
| B-02 | Create / rename / delete board | PARTIAL | Create: `Tasks.tsx:39-74`. Rename: no UI (title is only set at creation). Delete: no UI (RLS policy exists — `projects` DELETE policy in migration — but no delete button anywhere). |
| B-03 | Board description | PRESENT | `description` column + textarea in create dialog, shown on board card (`Tasks.tsx:94,130`) and board header (`TaskBoard.tsx:367-369`). Not editable after creation. |
| B-04 | Board background | MISSING | No `background`/color column, no UI. |
| B-05 | Board visibility | PARTIAL | Implicit "workspace-private" via `project_members`/`is_project_member` RLS (`20260427145911_*.sql`). No explicit public/private toggle or setting. |
| B-06 | Star / favourite boards | MISSING | No column, no UI. |
| B-07 | Close (archive) / reopen | PARTIAL | `projects.archived` boolean exists in schema and is filtered on in `EmployeeProfile.tsx:368`/`EmployeeManagement.tsx:165`, but `Tasks.tsx` never filters by it and there is no archive/unarchive button anywhere. |
| B-08 | Copy board | MISSING | — |
| B-09 | Board templates | MISSING | — |
| B-10 | Recently viewed boards | MISSING | — |
| B-11 | Board home listing all accessible boards | PRESENT | `Tasks.tsx` grid of boards (`src/pages/Tasks.tsx:111-136`), RLS-scoped via `is_project_member`. |

## 2. Lists (Columns)

| ID | Feature | Status | Evidence / Notes |
|---|---|---|---|
| L-01 | Create / rename list | PARTIAL | Create: `TaskBoard.tsx:304-317` (`addColumn`). Rename: no UI, though a simple `.update({name})` would work under existing RLS. |
| L-02 | Drag-and-drop reorder lists | MISSING | `@dnd-kit` is wired for cards only; columns render in a static `columns.map` (`TaskBoard.tsx:404-417`) with no `SortableContext`/drag handlers for columns themselves. |
| L-03 | Archive / restore list | PARTIAL | Only hard delete exists (`deleteColumn`, `TaskBoard.tsx:319-327`), blocked if the column has tasks. No archive/restore. |
| L-04 | Move list to another board | MISSING | — |
| L-05 | Copy list | MISSING | — |
| L-06 | Move/archive all cards in list | MISSING | — |
| L-07 | Sort cards in list | MISSING | Cards are ordered only by manual drag position (`tasks.position`). |
| L-08 | Collapse list | MISSING | — |
| L-09 | WIP limit per list | PARTIAL | `task_columns.wip_limit` column exists in schema (migration line ~`wip_limit INT`) but is never read, set, or enforced in the UI. |

## 3. Cards — Basics

| ID | Feature | Status | Evidence / Notes |
|---|---|---|---|
| C-01 | Quick-add card | PARTIAL | Create is a full dialog (`TaskBoard.tsx:432-473`), not an inline quick-add at the list bottom. The empty-column "+ Add task" button (`KanbanColumn.tsx:112-119`) opens the same dialog. |
| C-02 | Card title inline edit | PRESENT | `TaskBoard.tsx:503-508` — `Input` bound directly in the detail dialog header, saved on blur. |
| C-03 | Card description (rich text) | PARTIAL | Plain `Textarea`, no rich text/markdown rendering (`TaskBoard.tsx:514-521`). |
| C-04 | Drag-and-drop cards within/between lists | PRESENT | Full `DndContext`/`handleDragStart`/`handleDragOver`/`handleDragEnd` (`TaskBoard.tsx:169-243`). |
| C-05 | Card detail modal with own URL | PARTIAL | Modal exists (`TaskBoard.tsx:496-600`) but it's state-only (`activeTask`), not a route — no deep link/shareable URL for a single card. |
| C-06 | Archive / restore / delete card | PARTIAL | Delete-column path blocks on existing tasks, but there is no delete/archive action on a task itself anywhere in the UI (RLS has an "Owners delete tasks" policy ready to use). |
| C-07 | Move card via menu | PARTIAL | Status/column can be changed via the "Status" `Select` in the detail dialog (`TaskBoard.tsx:556-567`), which moves it between columns — but not to a different board/project. |
| C-08 | Copy card | MISSING | — |
| C-09 | Card cover | MISSING | — |
| C-10 | Card front badges | PARTIAL | Due date + comment-count badges exist (`KanbanCard.tsx:99-120`); this session added a checklist-progress badge. Missing: attachment-count, description-icon, member-avatar-stack (only a single assignee avatar is shown), label chips. |
| C-11 | Card as template | MISSING | — |
| C-12 | Mirror/link cards across boards | MISSING | — |
| C-13 | Card short link/share | MISSING | No per-card route exists to link to (see C-05). |

## 4. Cards — Details

| ID | Feature | Status | Evidence / Notes |
|---|---|---|---|
| D-01 | Multiple assignees | MISSING | `tasks.assignee_id` is a single `UUID` column; `EmployeePicker` (`src/components/EmployeePicker.tsx`) is single-select. Would need a `task_members` join table + multi-select UI. |
| D-02 | "Join" card (self-assign) | MISSING | No shortcut; user would have to open the picker and select themselves. |
| D-03 | Labels | PARTIAL | `tasks.labels TEXT[]` column exists in schema but is never read, written, or rendered anywhere in `TaskBoard.tsx`/`KanbanCard.tsx`. No board-level label registry (name+color) — just a raw text array. |
| D-04 | Label CRUD + filter | MISSING | No labels table, no management UI, no filter UI. |
| D-05 | Start/due date with time | PARTIAL | `due_date` (DATE, no time) is wired (`TaskBoard.tsx:584-591`); `start_date` column exists in schema but has no UI. Neither has a time component. |
| D-06 | Due date status colour-coding | PARTIAL | Overdue-only red badge on the card (`KanbanCard.tsx:56-57,101-113`). No "due soon" (amber) state. |
| D-07 | Mark due date complete | MISSING | No `due_complete` flag; completion is inferred only from `completed_at`/moving to the "done" column. |
| D-08 | Due date reminders | MISSING | — |
| D-09 | Checklists (multiple, named) | PARTIAL | This session added **one unnamed checklist per card** (`task_checklist_items`, migration `20261021080000_task_checklist_items.sql`; UI in `TaskBoard.tsx` detail dialog). Trello allows multiple named checklists per card — current schema only supports a single flat list per task. |
| D-10 | Checklist items: check/uncheck/reorder/edit/delete | PARTIAL | Check/uncheck, add, delete are implemented (`TaskBoard.tsx` `toggleChecklistItem`/`addChecklistItem`/`deleteChecklistItem`). Reorder (drag) and inline text edit of an existing item are not implemented — only `position` default-ordering on insert. |
| D-11 | Progress bar / hide checked items | PARTIAL | A "done/total" count badge exists on the card face and in the dialog label; no visual progress bar, no "hide checked items" toggle. |
| D-12 | Checklist item assignee/due date | MISSING | `task_checklist_items` has no `assignee_id`/`due_at` columns. |
| D-13 | Convert checklist item to card | MISSING | — |
| D-14 | Attachments | PARTIAL | `task_attachments` table + full RLS policies already exist in the base migration (file upload, size, mime, uploader) — but zero UI wiring in `TaskBoard.tsx`. The app has reusable upload infra (`AttachmentsInput.tsx`, `lib/attachments.ts`) used by other features (leave/OT requests) that could be adapted directly. |
| D-15 | Attachment preview / set as cover | MISSING | Depends on D-14 existing first. |
| D-16 | Custom fields | MISSING | — |
| D-17 | Location field | MISSING | — |
| D-18 | Watch card | PARTIAL | `task_watchers` table + RLS already exist in the base migration, but no UI to watch/unwatch, and no notification hook-up tied to it. |

## 5. Collaboration & Activity

| ID | Feature | Status | Evidence / Notes |
|---|---|---|---|
| A-01 | Comments (create/edit/delete) | PARTIAL | Create is implemented (`TaskBoard.tsx:293-302`, `addComment`). RLS already supports author edit/delete (`"Authors update own comments"`, `"Authors or admins delete comments"` in the migration) but there's no edit/delete UI for a posted comment. |
| A-02 | @mentions | MISSING | No mention parsing/autocomplete; comments are plain text. |
| A-03 | Emoji reactions | MISSING | — |
| A-04 | Activity log per card | PARTIAL | `task_activity` table (actor, action, detail JSONB) already exists with RLS, but nothing in `TaskBoard.tsx` ever inserts into it or renders it — task edits (title/description/status/priority/assignee/due date) are silent. |
| A-05 | Activity log per board | MISSING | No board-level aggregation of `task_activity` anywhere. |
| A-06 | Toggle comments-only vs full activity | N/A | Not applicable until A-04 exists. |
| A-07 | Real-time updates | PRESENT | `useRealtimeSubscription("tasks"/"task_columns"/"task_checklist_items", ...)` in `TaskBoard.tsx:144-147`, same hook used app-wide (`src/hooks/useRealtimeSubscription.ts`). Note: comments and attachments are not subscribed, so a second user's comment doesn't appear without reopening the card. |
| A-08 | Presence (who's viewing) | MISSING | — |

## 6. Members & Permissions

| ID | Feature | Status | Evidence / Notes |
|---|---|---|---|
| M-01 | Invite members (board) | PRESENT | `ProjectMemberSelector.tsx` — searchable picker scoped to visible employees (`useVisibleEmployees`), upserts into `project_members` (`toggleMember`, lines 81-110). No email/invite-link flow (expected — this is an internal HR system, not an open SaaS; all users are existing employee accounts). |
| M-02 | Roles: admin/member/observer | PARTIAL | `project_role` enum is `owner | member | viewer` (schema) and `ProjectMemberSelector.tsx:226-238` lets an owner set `member`/`viewer` per person — functionally equivalent to admin/member/observer, but "viewer" role isn't enforced anywhere as read/comment-only in RLS beyond the general member policies (worth re-checking `task_comments`/`tasks` INSERT policies, which key off `project_role_of(...) IN ('owner','member')` — so `viewer` is already correctly excluded from creating tasks/comments). |
| M-03 | Remove member / leave board | PARTIAL | Remove: supported (`toggleMember` unchecked → delete, `ProjectMemberSelector.tsx:96-103`), but only by an owner/admin acting on someone else. "Leave board" (self-service) isn't exposed as a distinct action for a non-owner member. |
| M-04 | Workspace-level members/guests | N/A | No workspace layer (see B-01). |
| M-05 | Fine-grained permission settings | MISSING | Permissions are fixed by role (owner/member/viewer) with no per-board configurable toggles (who can comment, who can invite, etc). |
| M-06 | Member avatars w/ initials fallback | PRESENT | `Avatar`/`AvatarFallback` pattern used throughout (`ProjectMemberSelector.tsx:202-207`, `KanbanCard.tsx:121-130`, comments in `TaskBoard.tsx:528-532`). |

## 7. Search, Filter & Navigation

| ID | Feature | Status | Evidence / Notes |
|---|---|---|---|
| S-01 | Board filter (keyword/member/label/due/completion) | MISSING | No filter bar on `TaskBoard.tsx` at all. |
| S-02 | Filter match mode any/all | N/A | Depends on S-01. |
| S-03 | Global search across boards/cards | MISSING | No search entry point for tasks; app-wide there's no global search feature at all. |
| S-04 | Saved searches | MISSING | — |
| S-05 | Keyboard shortcuts | MISSING | — |
| S-06 | Quick edit on card front | MISSING | Card face is click-to-open-dialog only (`KanbanCard.tsx:65-68`); no inline quick-edit affordance. |

## 8. Views

| ID | Feature | Status | Evidence / Notes |
|---|---|---|---|
| V-01 | Board (Kanban) view | PRESENT | The entire feature, `TaskBoard.tsx`. |
| V-02 | Table view | MISSING | — |
| V-03 | Calendar view | MISSING | — |
| V-04 | Timeline/Gantt view | MISSING | — |
| V-05 | Dashboard/charts view | MISSING | — |
| V-06 | Map view | N/A | No location field (D-17) to plot. |
| V-07 | "My cards" cross-board view | MISSING | No query anywhere filters `tasks` by `assignee_id = current user` across projects; each board must be opened individually. |

## 9. Notifications

| ID | Feature | Status | Evidence / Notes |
|---|---|---|---|
| N-01 | In-app notification centre | PRESENT (generic, not task-wired) | `NotificationBell.tsx` + `useNotifications.ts` + `notifications` table already power unread-badge/mark-read app-wide (used for leave/OT/approval flows). Nothing in `TaskBoard.tsx`/`Tasks.tsx` calls `lib/notifications.ts` to emit a task event, so the center never fires for tasks. |
| N-02 | Notify on assign/mention/comment/due/move/added | MISSING | No call sites in the Tasks feature; would reuse `notifyEmployee`/`notifyManagersAndAdmins` from `src/lib/notifications.ts`. |
| N-03 | Email notifications | MISSING | No email-sending integration found anywhere in the app (notifications are in-app only). |
| N-04 | Per-user notification preferences | MISSING | — |

## 10. Automation (Butler-style)

| ID | Feature | Status | Evidence / Notes |
|---|---|---|---|
| R-01 | Rules (trigger → action) | MISSING | — |
| R-02 | Card/board buttons | MISSING | — |
| R-03 | Scheduled commands | MISSING | — |
| R-04 | Due-date commands | MISSING | — |
| R-05 | Automation run log | MISSING | — |

## 11. Integrations & Data

| ID | Feature | Status | Evidence / Notes |
|---|---|---|---|
| I-01 | REST API for boards/lists/cards/comments | PRESENT (via Supabase) | The Supabase PostgREST API already exposes all these tables under RLS (that's what the SPA itself calls); there's no separate hand-rolled REST layer, which is consistent with the rest of this codebase. |
| I-02 | Webhooks | MISSING | No webhook dispatch found in the project. |
| I-03 | Email-to-board | MISSING | N/A for an internal HR tool unless specifically wanted. |
| I-04 | Export board to JSON/CSV | MISSING | No export button on `Tasks.tsx`/`TaskBoard.tsx` (other pages like `Reports.tsx`/`Payment.tsx` have CSV export patterns that could be reused). |
| I-05 | Import from CSV/Trello JSON | MISSING | — |
| I-06 | Print board/card | MISSING | — |

## 12. UX & Platform

| ID | Feature | Status | Evidence / Notes |
|---|---|---|---|
| U-01 | Responsive/mobile board | PARTIAL | Columns scroll horizontally (`overflow-x-auto`, `TaskBoard.tsx:404`) and `@dnd-kit`'s `PointerSensor` supports touch drag out of the box, but there's no mobile-specific layout (e.g., single-column stacked view) and the detail dialog (`max-w-2xl`, 3-column grid) isn't adapted for narrow screens. |
| U-02 | Optimistic UI with rollback | PARTIAL | Drag-and-drop is optimistic with a `fetchAll()` rollback-on-error (`TaskBoard.tsx:237-242`), but other mutations (create task, checklist add/toggle, comments) just wait for the request and show a toast on error — no local optimistic update there. |
| U-03 | Undo toast | MISSING | — |
| U-04 | Dark mode | PARTIAL | Tailwind is configured with `darkMode: ["class"]` and CSS variables for both themes exist (`tailwind.config.ts`), but no `ThemeProvider`/toggle wires it up anywhere in the app (`next-themes` is only used internally by the `sonner` toast component) — so dark mode is unreachable by users today, task feature included. |
| U-05 | Accessibility (keyboard DnD, ARIA, focus) | PARTIAL | `@dnd-kit` ships a keyboard sensor the app doesn't enable (only `PointerSensor` is configured, `TaskBoard.tsx:65-67`); icon-only buttons mostly lack `aria-label` (column "+"/"⋮" have them via `KanbanColumn.tsx:84-85`, but most dialog icon buttons don't). |
| U-06 | Empty states / onboarding | PRESENT | `KanbanEmptyState.tsx` for a board with zero tasks, plus column-level empty "+ Add task" prompt (`KanbanColumn.tsx:112-119`) and the boards-list empty state (`Tasks.tsx:111-115`). |

---

## Proposed implementation plan

### P1 — core gaps (board unusable without these)
1. **Board rename/delete UI** (B-02) — small edit dialog + delete confirmation on `Tasks.tsx`/`TaskBoard.tsx`, backed by existing RLS.
2. **Multiple assignees per card** (D-01/D-02) — new `task_members` join table + migration, replace single `EmployeePicker` with a multi-select, "Join" button for self-assign.
3. **Labels** (D-03/D-04) — new `labels` (board-scoped: id, board/project_id, name, color) + `task_labels` join table; label chips on card face and a simple label manager + picker in the detail dialog. (Drop the unused `tasks.labels TEXT[]` column once migrated, or repurpose it as a cache.)
4. **List drag-and-drop reorder** (L-02) — extend the existing `DndContext` to also sort columns, persisting `task_columns.position`.
5. **Card archive/delete** (C-06) — surface the already-permitted delete, or add a soft-archive column + "Archived" filter view.
6. **Wire task_attachments** (D-14) — reuse `AttachmentsInput`/`lib/attachments.ts` patterns against the existing `task_attachments` table + a dedicated storage bucket; show attachment count badge (C-10).

*Migrations: `task_members`, `labels`, `task_labels`, a storage bucket + policies for task attachments, plus column additions for soft-archive if chosen. Tests: unit tests for any new pure helpers (e.g., label color mapping), and the existing `npx vitest run` baseline must stay green.*

### P2 — expected ("feels like Trello")
1. **Activity log** (A-04/A-05) — write to the already-existing `task_activity` table on every mutation in `TaskBoard.tsx` (title/desc/status/priority/assignee/due-date/column changes), render a feed in the detail dialog.
2. **Task notifications** (N-01/N-02) — call `notifyEmployee`/`notifyManagersAndAdmins` from `src/lib/notifications.ts` on assign, due-soon, comment-on-watched-card, moved-to-done.
3. **Watch card** (D-18) — wire the existing `task_watchers` table to a watch/unwatch toggle, feeding N-02.
4. **Due-soon colour state** (D-06) + **mark due complete** (D-07) — add `due_complete` boolean, extend the overdue badge logic to a 3-state (overdue/due-soon/complete) scheme.
5. **Board/card filters** (S-01) — client-side filter bar (member, label, due-state, keyword) over the already-loaded `tasks` array; no new tables needed.
6. **"My Tasks" view** (V-07) — a new route querying `tasks` by `assignee_id = auth.uid()` across all projects the user can see (RLS already supports this).
7. **CSV export** (I-04) — reuse the CSV-export pattern already used in `Reports.tsx`/`Payment.tsx`.
8. **Roles clarity pass** (M-02) — confirm/extend `viewer` enforcement in RLS for any P1/P2 writes added above.

### P3 — advanced / do individually based on actual user need
Board backgrounds/star/copy/templates, card covers/copy/mirror, multiple named checklists with per-item assignee/due-date, custom fields, calendar/timeline/table/dashboard views, Butler-style automation rules, webhooks, email notifications, global search, keyboard shortcuts, dark-mode toggle, presence, and workspace-level grouping above projects. None of these block a usable Trello-style board for GMGI/MORU's internal use; recommend revisiting this tier only after P1/P2 ships and real usage surfaces which of these actually get requested (e.g. a dashboard/table view is far more likely to matter here than a map view, given there's no location field anywhere else in the app either).

---

**Awaiting approval before implementation.** Once a tier is approved, each will ship as its own PR with migrations, `vitest`/`tsc`/`eslint` verification, and a short changelog, following this repo's existing workflow.
