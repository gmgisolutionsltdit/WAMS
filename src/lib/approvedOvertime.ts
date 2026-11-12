/**
 * The single source of truth for "Approved Overtime" hours per user/month —
 * kept in sync with ReportsSummary.tsx's own computation (the figure
 * everyone compares against) so Payroll can never silently diverge from
 * what Reports shows. Sums every approved/modified overtime_request and
 * approved manual-time correction for the month — no longer gated to dates
 * with matching actual overtime in attendance (that restriction was removed
 * from Reports; an approved OT request counts in full, regardless of
 * whether that day's attendance happens to show matching actual overtime).
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches everything needed and returns approved OT hours per
 * `${user_id}|${yyyy-MM}` for the given users across [rangeFrom, rangeTo]
 * (both "yyyy-MM-dd", inclusive).
 */
export async function fetchApprovedOTHoursByUserMonth(
  targetIds: string[],
  rangeFrom: string,
  rangeTo: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (targetIds.length === 0) return result;

  const [{ data: otRows }, { data: manualOtRows }] = await Promise.all([
    supabase.from("overtime_requests").select("user_id, date, requested_hours")
      .in("user_id", targetIds).in("status", ["approved", "modified"]).gte("date", rangeFrom).lte("date", rangeTo),
    supabase.from("manual_time_requests").select("user_id, date, overtime_hours, created_at")
      .in("user_id", targetIds).eq("status", "approved").gte("date", rangeFrom).lte("date", rangeTo),
  ]);

  const otPerDay = new Map<string, number>(); // `${user_id}|${date}`
  ((otRows || []) as { user_id: string; date: string; requested_hours: number }[]).forEach((r) => {
    const key = `${r.user_id}|${r.date}`;
    otPerDay.set(key, (otPerDay.get(key) || 0) + (Number(r.requested_hours) || 0));
  });
  const manualOtLatest = new Map<string, { hours: number; createdAt: string }>();
  ((manualOtRows || []) as { user_id: string; date: string; overtime_hours: number; created_at: string }[]).forEach((r) => {
    const key = `${r.user_id}|${r.date}`;
    const existing = manualOtLatest.get(key);
    if (!existing || r.created_at > existing.createdAt) {
      manualOtLatest.set(key, { hours: Number(r.overtime_hours) || 0, createdAt: r.created_at });
    }
  });
  manualOtLatest.forEach(({ hours }, key) => {
    otPerDay.set(key, (otPerDay.get(key) || 0) + hours);
  });

  otPerDay.forEach((hours, key) => {
    if (hours <= 0) return;
    const [userId, date] = key.split("|");
    const monthKey = `${userId}|${date.slice(0, 7)}`;
    result.set(monthKey, (result.get(monthKey) || 0) + hours);
  });

  return result;
}
