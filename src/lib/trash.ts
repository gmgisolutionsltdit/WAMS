import { supabase } from "@/integrations/supabase/client";

export type TrashEntityType = "overtime" | "manual_time" | "late_time" | "leave" | "loan" | "expense";

export const TRASH_SOURCE_TABLE: Record<TrashEntityType, string> = {
  overtime: "overtime_requests",
  manual_time: "manual_time_requests",
  late_time: "late_time_requests",
  leave: "leave_requests",
  loan: "personal_advances",
  expense: "expense_claims",
};

export const TRASH_LABEL: Record<TrashEntityType, string> = {
  overtime: "Overtime",
  manual_time: "Manual Time",
  late_time: "Late Time",
  leave: "Leave",
  loan: "Loan",
  expense: "Expense",
};

/**
 * Moves a row to Trash (30-day restorable snapshot) before the caller
 * deletes it from its own table — called first so a failed trash insert
 * blocks the delete entirely rather than losing the row with no recovery
 * path.
 */
// Keys some of the 6 history lists join in for display (e.g.
// "profiles!overtime_requests_user_id_fkey(full_name,email)") that don't
// exist as real columns on the source table — stripped before the snapshot
// is stored so restoring it back with upsert() doesn't fail trying to
// write a non-existent column.
const NON_COLUMN_KEYS = ["profiles", "approver"];

export async function moveToTrash(
  entityType: TrashEntityType,
  row: Record<string, unknown> & { id: string },
  deletedBy: string,
  reason: string,
) {
  const data = { ...row };
  NON_COLUMN_KEYS.forEach((k) => delete data[k]);
  const { error } = await supabase.from("trash_bin" as any).insert({
    entity_type: entityType,
    source_table: TRASH_SOURCE_TABLE[entityType],
    original_id: row.id,
    data,
    deleted_by: deletedBy,
    deleted_reason: reason,
  });
  if (error) throw error;
}
