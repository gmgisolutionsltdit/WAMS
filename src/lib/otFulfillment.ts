import { supabase } from "@/integrations/supabase/client";

/**
 * Intelligent OT fulfillment + caps logic.
 *
 * 1. If the employee didn't complete the standard shift, the deficit is
 *    subtracted from the requested OT (floor at 0).
 * 2. If the day is a declared holiday OR weekend, deficit is ignored
 *    (full hours count as OT).
 * 3. Daily and monthly OT caps from the user's profile are enforced.
 *
 * Returns the final approved OT hours (>= 0).
 */
export async function applyOTFulfillment(
  userId: string,
  date: string,
  requestedOTHours: number
): Promise<number> {
  // Settings: standard hours + weekend definition
  const { data: settings } = await supabase
    .from("settings")
    .select("standard_shift_hours, weekend_days")
    .limit(1)
    .single();

  const standardHours = Number(settings?.standard_shift_hours ?? 8);
  const weekendDays: number[] = (settings?.weekend_days as number[]) || [5, 6];

  // Profile caps + wing
  const { data: profile } = await supabase
    .from("profiles")
    .select("daily_ot_cap, monthly_ot_cap, company_wing")
    .eq("id", userId)
    .maybeSingle();

  const dailyCap = Number(profile?.daily_ot_cap ?? 4);
  const monthlyCap = Number(profile?.monthly_ot_cap ?? 40);

  // Holiday lookup (any wing-wide or matching wing)
  const { data: holiday } = await supabase
    .from("holidays")
    .select("id, wing")
    .eq("holiday_date", date)
    .maybeSingle();

  const dow = new Date(date + "T00:00:00").getDay(); // 0=Sun..6=Sat
  const isWeekend = weekendDays.includes(dow);
  const isHoliday =
    !!holiday &&
    (holiday.wing === null || holiday.wing === profile?.company_wing);

  let candidate = requestedOTHours;

  // Apply standard-hours fulfillment on regular workdays only
  if (!isWeekend && !isHoliday) {
    const { data: logs } = await supabase
      .from("attendance_logs")
      .select("total_hours")
      .eq("user_id", userId)
      .eq("date", date);
    const totalWorked = (logs || []).reduce(
      (sum, l) => sum + (Number(l.total_hours) || 0),
      0
    );
    if (totalWorked < standardHours) {
      const deficit = standardHours - totalWorked;
      candidate = candidate - deficit;
    }
  }

  // Floor at zero
  candidate = Math.max(0, candidate);

  // Daily cap
  candidate = Math.min(candidate, dailyCap);

  // Monthly cap (sum of already-approved OT this month + this approval)
  const monthStart = date.slice(0, 7) + "-01";
  const d = new Date(monthStart + "T00:00:00");
  const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    .toISOString()
    .slice(0, 10);
  const { data: monthOT } = await supabase
    .from("overtime_requests")
    .select("requested_hours")
    .eq("user_id", userId)
    .gte("date", monthStart)
    .lt("date", nextMonth)
    .in("status", ["approved", "modified"]);
  const usedMonth = (monthOT || []).reduce(
    (sum, r) => sum + (Number(r.requested_hours) || 0),
    0
  );
  const remainingMonth = Math.max(0, monthlyCap - usedMonth);
  candidate = Math.min(candidate, remainingMonth);

  return Math.round(candidate * 100) / 100;
}
