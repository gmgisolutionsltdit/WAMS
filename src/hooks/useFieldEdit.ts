import { useCallback, useRef, useState } from "react";

/**
 * Per-field edit-mode wrapper for a form object: each key can be entered,
 * saved or cancelled independently. "Save all" drives every currently-edited
 * key through the same per-field save path, one at a time.
 */
export function useFieldEdit<T extends Record<string, unknown>>(
  value: T,
  setValue: (updater: (prev: T) => T) => void,
  saveField: (key: keyof T, current: T) => Promise<boolean>,
) {
  const [editing, setEditing] = useState<Set<keyof T>>(new Set());
  const [savingKey, setSavingKey] = useState<keyof T | null>(null);
  const snapshot = useRef<Partial<T>>({});

  const startEdit = useCallback((key: keyof T) => {
    snapshot.current[key] = value[key];
    setEditing((prev) => new Set(prev).add(key));
  }, [value]);

  const cancelEdit = useCallback((key: keyof T) => {
    if (key in snapshot.current) {
      const snapVal = snapshot.current[key];
      setValue((prev) => ({ ...prev, [key]: snapVal }));
    }
    setEditing((prev) => { const n = new Set(prev); n.delete(key); return n; });
  }, [setValue]);

  const saveEdit = useCallback(async (key: keyof T) => {
    setSavingKey(key);
    try {
      const ok = await saveField(key, value);
      if (ok) setEditing((prev) => { const n = new Set(prev); n.delete(key); return n; });
      return ok;
    } finally {
      setSavingKey(null);
    }
  }, [saveField, value]);

  const saveAll = useCallback(async () => {
    for (const key of Array.from(editing)) {
      await saveEdit(key);
    }
  }, [editing, saveEdit]);

  const cancelAll = useCallback(() => {
    Array.from(editing).forEach((key) => cancelEdit(key));
  }, [editing, cancelEdit]);

  return {
    isEditing: (key: keyof T) => editing.has(key),
    isSaving: (key: keyof T) => savingKey === key,
    startEdit, cancelEdit, saveEdit, saveAll, cancelAll,
    hasEditing: editing.size > 0,
    editingCount: editing.size,
  };
}
