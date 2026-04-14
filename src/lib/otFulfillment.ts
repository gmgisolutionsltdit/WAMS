import { supabase } from "@/integrations/supabase/client";

/**
 * Intelligent OT fulfillment logic:
 * If the employee didn't complete standard hours, the deficit is subtracted from approved OT.
 * Returns the adjusted OT hours (>= 0).
 */
export async function applyOTFulfillment(
  userId: string,
  date: string,
  requestedOTHours: number
): Promise<number> {
  // Get standard shift hours from settings
  const { data: settings } = await supabase
    .from("settings")
    .select("standard_shift_hours")
    .limit(1)
    .single();

  const standardHours = settings?.standard_shift_hours || 8;

  // Get worked hours for that date
  const { data: logs } = await supabase
    .from("attendance_logs")
    .select("total_hours")
    .eq("user_id", userId)
    .eq("date", date);

  const totalWorked = (logs || []).reduce((sum, l) => sum + (l.total_hours || 0), 0);

  // If worked less than standard, subtract deficit from OT
  if (totalWorked < standardHours) {
    const deficit = standardHours - totalWorked;
    const adjustedOT = Math.max(0, Math.round((requestedOTHours - deficit) * 100) / 100);
    return adjustedOT;
  }

  return requestedOTHours;
}
