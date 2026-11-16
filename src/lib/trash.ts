import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Late Time and Leave are deliberately excluded — deleting those always
// goes straight to a permanent delete (see Approvals.tsx's deleteLate/
// deleteLeave) instead of through Trash, because restoring either would
// re-insert the row without replaying the attendance-stamp / leave-balance
// side effect that only fires through the real approval code path
// (a DB UPDATE trigger for Late Time, application code for Leave), never
// on a raw insert — a "restored" row would misleadingly look approved
// while that side effect stays missing.
export type TrashEntityType = "overtime" | "manual_time" | "loan" | "expense";

export const TRASH_SOURCE_TABLE: Record<TrashEntityType, string> = {
  overtime: "overtime_requests",
  manual_time: "manual_time_requests",
  loan: "personal_advances",
  expense: "expense_claims",
};

export const TRASH_LABEL: Record<TrashEntityType, string> = {
  overtime: "Overtime",
  manual_time: "Manual Time",
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

/** Returns the new trash_bin row's id — callers use it to offer "Undo"
 *  (restore_from_trash) right on the delete's own success toast. */
export async function moveToTrash(
  entityType: TrashEntityType,
  row: Record<string, unknown> & { id: string },
  deletedBy: string,
  reason: string,
): Promise<string> {
  const data = { ...row };
  NON_COLUMN_KEYS.forEach((k) => delete data[k]);
  const { data: inserted, error } = await supabase.from("trash_bin" as any).insert({
    entity_type: entityType,
    source_table: TRASH_SOURCE_TABLE[entityType],
    original_id: row.id,
    data,
    deleted_by: deletedBy,
    deleted_reason: reason,
  }).select("id").single();
  if (error) throw error;
  return (inserted as any).id as string;
}

/** Restores a trash_bin row by id — the same RPC Trash's own Restore button
 *  uses, shared here so a delete's "Undo" toast action can call it too. */
export async function restoreFromTrash(trashId: string): Promise<void> {
  const { error } = await supabase.rpc("restore_from_trash" as any, { _trash_id: trashId });
  if (error) throw error;
}

/**
 * Shows the standard "X deleted" success toast with an Undo button that
 * restores the row straight out of Trash — called right after a successful
 * moveToTrash()+delete(), passing the trashId moveToTrash returned.
 * `onRestored` lets the caller refresh its own list once Undo completes.
 */
export function toastDeletedWithUndo(message: string, trashId: string, onRestored?: () => void) {
  toast.success(message, {
    action: {
      label: "Undo",
      onClick: async () => {
        try {
          await restoreFromTrash(trashId);
          toast.success("Restored");
          onRestored?.();
        } catch (e) {
          toast.error(e instanceof Error ? `Could not undo: ${e.message}` : "Could not undo.");
        }
      },
    },
  });
}
