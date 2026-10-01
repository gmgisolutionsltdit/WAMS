import { useCallback, useRef, useState } from "react";

/**
 * One reusable edit-mode wrapper for a profile tab/section: starts read-only,
 * "Edit" snapshots the current value, "Cancel" restores it, "Save" (caller's
 * responsibility) exits edit mode only once the underlying save succeeds.
 */
export function useSectionEdit<T>(value: T, setValue: (v: T) => void) {
  const [editing, setEditing] = useState(false);
  const snapshotRef = useRef<T | null>(null);

  const startEdit = useCallback(() => {
    snapshotRef.current = value;
    setEditing(true);
  }, [value]);

  const cancelEdit = useCallback(() => {
    if (snapshotRef.current !== null) setValue(snapshotRef.current);
    setEditing(false);
  }, [setValue]);

  const stopEditing = useCallback(() => {
    setEditing(false);
  }, []);

  const hasChanges = editing && snapshotRef.current !== null
    && JSON.stringify(snapshotRef.current) !== JSON.stringify(value);

  return { editing, startEdit, cancelEdit, stopEditing, hasChanges };
}
