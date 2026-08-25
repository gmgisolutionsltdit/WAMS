import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

type TableName =
  | "overtime_requests"
  | "manual_time_requests"
  | "late_time_requests"
  | "notifications"
  | "attendance_logs"
  | "profiles"
  | "user_roles"
  | "daily_work_logs"
  | "leave_requests"
  | "leave_balances"
  | "leave_types"
  | "projects"
  | "project_members"
  | "task_boards"
  | "task_columns"
  | "tasks"
  | "task_comments"
  | "task_activity"
  | "task_watchers";

/**
 * Subscribes to postgres_changes for a table.
 *
 * IMPORTANT: Each hook instance gets its OWN unique channel name (even when a
 * `channelName` prefix is provided). Supabase Realtime throws
 * "cannot add postgres_changes callbacks ... after subscribe()" when two
 * components try to attach listeners to a channel with the same name. By
 * suffixing a random id we guarantee per-mount isolation.
 *
 * The `.on()` listener is always registered BEFORE `.subscribe()`, and the
 * channel is removed on unmount to prevent leaks / duplicate listeners.
 */
export function useRealtimeSubscription(
  table: TableName,
  callback: () => void,
  channelName?: string
) {
  // Keep latest callback in a ref so we don't tear down the channel when the
  // parent passes a new function reference on every render.
  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const prefix = channelName || `realtime-${table}`;
    const uniqueName = `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(uniqueName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => {
            try {
              cbRef.current();
            } catch (err) {
              console.error(`[realtime:${table}] callback error`, err);
            }
          }
        )
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(`[realtime:${table}] subscription ${status}`, err);
          }
        });
    } catch (err) {
      console.error(`[realtime:${table}] failed to subscribe`, err);
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (err) {
          console.error(`[realtime:${table}] failed to remove channel`, err);
        }
      }
    };
    // Intentionally omit `callback` — we use a ref to avoid resubscribing on
    // every parent render.
  }, [table, channelName]);
}
