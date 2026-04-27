import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type TableName =
  | "overtime_requests"
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

export function useRealtimeSubscription(
  table: TableName,
  callback: () => void,
  channelName?: string
) {
  useEffect(() => {
    const channel = supabase
      .channel(channelName || `realtime-${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => callback()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, callback, channelName]);
}
