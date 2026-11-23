import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, X, Clock, Users, Timer, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { notifyEmployee } from "@/lib/notifications";
import { applyOTFulfillment } from "@/lib/otFulfillment";
import { humanMinutes } from "@/lib/officeTime";
import { classifyDay, netRequiredHours, weekendDaysFor, type WorkSchedule } from "@/lib/workSchedule";
import { computeWorkingDays } from "@/lib/leaveDays";
import AttachmentThumbnails from "@/components/AttachmentThumbnails";
import { DeleteReasonDialog } from "@/components/DeleteReasonDialog";
import { moveToTrash, toastDeletedWithUndo } from "@/lib/trash";

/** RLS blocks a disallowed update/delete without an error — it just matches 0 rows,
 *  which would otherwise look like silent success. */
const NOT_ALLOWED = "You're not assigned as this employee's approver, so this action didn't go through.";
const HISTORY_PAGE_SIZE = 5;
// Raised from the old hard 20-row server cap — history is now filterable
// (search + date range) and paginated client-side, so this just needs to
// comfortably cover a type's resolved requests within the lookback window
// most admins care about, without pulling the entire table on every load.
const HISTORY_FETCH_LIMIT = 300;
// Which date field each history row's own type uses for the date filter —
// matches what each tab's "Date"/"Effective"/"Dates" column already shows.
const HISTORY_DATE_FIELD: Record<string, string> = {
  overtime: "date", manual: "date", late: "effective_date", leave: "start_date", loan: "created_at", expense: "claim_date",
};

const otStatusStyle = (status: string) => {
  if (status === "approved") return "bg-lime-500 text-white hover:bg-lime-600 border-lime-500";
  if (status === "rejected") return "bg-[#FF6347] text-white hover:bg-[#E5533D] border-[#FF6347]";
  if (status === "modified") return "bg-[#FFD700] text-black hover:bg-[#E6C200] border-[#FFD700]";
  return "";
};

const Approvals = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [pending, setPending] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalOT: 0, pendingCount: 0, activeEmployees: 0 });
  const [manualPending, setManualPending] = useState<any[]>([]);
  const [manualHistory, setManualHistory] = useState<{
    id: string; user_id: string; date: string; clock_in: string; clock_out: string;
    total_hours: number; overtime_hours: number; status: string; approved_by: string | null; approver_note: string | null;
  }[]>([]);
  const [latePending, setLatePending] = useState<any[]>([]);
  const [lateHistory, setLateHistory] = useState<any[]>([]);
  const [leavePending, setLeavePending] = useState<any[]>([]);
  const [leaveHistory, setLeaveHistory] = useState<any[]>([]);
  const [loanPending, setLoanPending] = useState<any[]>([]);
  const [loanHistory, setLoanHistory] = useState<any[]>([]);
  const [expensePending, setExpensePending] = useState<any[]>([]);
  const [expenseHistory, setExpenseHistory] = useState<any[]>([]);
  const [historyTab, setHistoryTab] = useState("overtime");
  const [historyPage, setHistoryPage] = useState<Record<string, number>>({
    overtime: 1, manual: 1, late: 1, leave: 1, loan: 1, expense: 1,
  });
  const [historySearch, setHistorySearch] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [leaveTypeNames, setLeaveTypeNames] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [manualOT, setManualOT] = useState<Record<string, string>>({});
  // Recomputed fresh here (not the stale overtime_hours the request was
  // submitted with) so a pending request filed before a schedule/holiday
  // correction still suggests the right figure — same rule classifyDay
  // applies everywhere else (Attendance, Reports, OT approval).
  const [manualSuggestedOT, setManualSuggestedOT] = useState<Record<string, number>>({});

  const [editOpen, setEditOpen] = useState(false);
  const [editReq, setEditReq] = useState<any>(null);
  const [editHours, setEditHours] = useState("");

  // Modify & Approve Leave — mirrors LeaveManagement's own Team Requests
  // tab feature, offered here too so an admin/manager can adjust a leave
  // request's type/dates/day-type and approve it in one step, without
  // leaving Pending Approvals. Fetches its own leave types/holidays/
  // employee schedule on open rather than sharing Approvals' own fetchData
  // state, since none of that is otherwise loaded here.
  const [modOpen, setModOpen] = useState(false);
  const [modReq, setModReq] = useState<any>(null);
  const [modForm, setModForm] = useState<{
    leave_type_id: string; start_date: string; end_date: string;
    day_type: "full" | "first_half" | "second_half"; note: string;
  }>({ leave_type_id: "", start_date: "", end_date: "", day_type: "full", note: "" });
  const [modLeaveTypes, setModLeaveTypes] = useState<{ id: string; name: string; sandwich_leave?: boolean; bridge_holidays?: boolean }[]>([]);
  const [modHolidaySet, setModHolidaySet] = useState<Set<string>>(new Set());
  const [modWeekend, setModWeekend] = useState<number[]>([0, 6]);
  const [modSaving, setModSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [{ data: requests }, { data: resolved }, { data: manualReqs }, { data: manualHist }, { data: lateReqs }, { data: lateHist }, { data: leaveReqs }, { data: leaveHist }, { data: leaveTypes }, { data: loanPend }, { data: loanHist }, { data: expensePend }, { data: expenseHist }] = await Promise.all([
      supabase
        .from("overtime_requests")
        .select("*, profiles!overtime_requests_user_id_fkey(full_name, email)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("overtime_requests")
        .select("*, profiles!overtime_requests_user_id_fkey(full_name, email)")
        .neq("status", "pending")
        .order("updated_at", { ascending: false })
        .limit(HISTORY_FETCH_LIMIT),
      supabase.from("manual_time_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("manual_time_requests").select("*").neq("status", "pending").order("updated_at", { ascending: false }).limit(HISTORY_FETCH_LIMIT),
      supabase.from("late_time_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("late_time_requests").select("*").neq("status", "pending").order("updated_at", { ascending: false }).limit(HISTORY_FETCH_LIMIT),
      supabase.from("leave_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("leave_requests").select("*").neq("status", "pending").order("updated_at", { ascending: false }).limit(HISTORY_FETCH_LIMIT),
      supabase.from("leave_types").select("id, name"),
      supabase.from("personal_advances").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("personal_advances").select("*").neq("status", "pending").order("approved_at", { ascending: false }).limit(HISTORY_FETCH_LIMIT),
      supabase.from("expense_claims").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase.from("expense_claims").select("*").neq("status", "pending").order("approved_at", { ascending: false }).limit(HISTORY_FETCH_LIMIT),
    ]);
    setPending(requests || []);
    setHistory(resolved || []);
    setManualPending(manualReqs || []);
    setManualHistory(manualHist || []);
    setLatePending(lateReqs || []);
    setLateHistory(lateHist || []);
    setLeavePending(leaveReqs || []);
    setLeaveHistory(leaveHist || []);
    setLoanPending(loanPend || []);
    setLoanHistory(loanHist || []);
    setExpensePending(expensePend || []);
    setExpenseHistory(expenseHist || []);
    const ltNames: Record<string, string> = {};
    (leaveTypes || []).forEach((lt: { id: string; name: string }) => { ltNames[lt.id] = lt.name; });
    setLeaveTypeNames(ltNames);

    const ids = Array.from(new Set(
      [...(manualReqs || []), ...(manualHist || []), ...(lateReqs || []), ...(lateHist || []), ...(leaveReqs || []), ...(leaveHist || []), ...(loanPend || []), ...(loanHist || []), ...(expensePend || []), ...(expenseHist || [])]
        .flatMap((r: any) => [r.user_id, r.approved_by, r.approver_id])
        .filter(Boolean)
    ));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p.full_name || p.email || "Unknown"; });
      setNames(map);
    }

    if ((manualReqs || []).length) {
      const manualUserIds = Array.from(new Set((manualReqs || []).map((r: { user_id: string }) => r.user_id)));
      const [{ data: schedules }, { data: holidays }] = await Promise.all([
        supabase.from("profiles")
          .select("id, working_days, company_wing, standard_daily_hours, unpaid_break_minutes")
          .in("id", manualUserIds),
        supabase.from("holidays").select("holiday_date, name, wing_names"),
      ]);
      type ScheduleRow = WorkSchedule & { id: string; company_wing: string | null };
      const scheduleMap = new Map((schedules || []).map((s: ScheduleRow) => [s.id, s]));
      const suggested: Record<string, number> = {};
      (manualReqs || []).forEach((r: { id: string; user_id: string; date: string; total_hours: number }) => {
        const schedule = scheduleMap.get(r.user_id);
        const holidayMap = new Map<string, string>();
        (holidays || [])
          .filter((h: { wing_names: string[] | null }) => !h.wing_names?.length || h.wing_names.includes(schedule?.company_wing))
          .forEach((h: { holiday_date: string; name: string }) => holidayMap.set(h.holiday_date, h.name));
        const nonWorking = classifyDay(r.date, holidayMap, weekendDaysFor(schedule)).nonWorking;
        const total = Number(r.total_hours) || 0;
        suggested[r.id] = nonWorking ? total : Math.max(0, total - netRequiredHours(schedule));
      });
      setManualSuggestedOT(suggested);
    } else {
      setManualSuggestedOT({});
    }

    const now = new Date();
    const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), "yyyy-MM-dd");
    const { data: monthLogs } = await supabase.from("attendance_logs").select("overtime_hours, user_id").gte("date", monthStart);
    const totalOT = (monthLogs || []).reduce((sum, l) => sum + (l.overtime_hours || 0), 0);
    const activeEmployees = new Set((monthLogs || []).map(l => l.user_id)).size;
    const totalPending = (requests || []).length + (manualReqs || []).length + (lateReqs || []).length
      + (leaveReqs || []).length + (loanPend || []).length + (expensePend || []).length;
    setStats({ totalOT: Math.round(totalOT * 10) / 10, pendingCount: totalPending, activeEmployees });
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useRealtimeSubscription("overtime_requests", fetchData, "approvals-page");
  useRealtimeSubscription("manual_time_requests", fetchData, "approvals-manual");
  useRealtimeSubscription("late_time_requests", fetchData, "approvals-late");
  useRealtimeSubscription("leave_requests", fetchData, "approvals-leave");
  useRealtimeSubscription("personal_advances", fetchData, "approvals-loans");
  useRealtimeSubscription("expense_claims", fetchData, "approvals-expense");

  const decideManual = async (req: any, status: "approved" | "rejected") => {
    if (!user) return;
    if (status === "rejected" && !notes[req.id]?.trim()) {
      toast.error("A note is required to reject a manual time entry.");
      return;
    }
    // The "Approve OT (h)" box shows the employee's auto-calculated figure only
    // as a greyed placeholder — it's a hint, not a value. An approver must type
    // into it to grant that OT; leaving it empty and approving means 0h, not a
    // silent fall-through to whatever the employee's request originally held.
    let overtimeOverride: number | undefined;
    if (status === "approved") {
      const otOverride = manualOT[req.id];
      if (otOverride !== undefined && otOverride.trim() !== "") {
        const parsed = parseFloat(otOverride);
        if (isNaN(parsed) || parsed < 0) { toast.error("Invalid overtime hours"); return; }
        overtimeOverride = parsed;
      } else {
        overtimeOverride = 0;
      }
    }
    const { data, error } = await supabase
      .from("manual_time_requests")
      .update({
        status,
        approved_by: user.id,
        approver_note: notes[req.id] || null,
        ...(overtimeOverride !== undefined ? { overtime_hours: overtimeOverride } : {}),
      })
      .eq("id", req.id)
      .select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error(NOT_ALLOWED); return; }
    toast.success(`Manual time request ${status}`);
    await notifyEmployee(
      req.user_id,
      `Manual Time Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      `Your manual time entry for ${format(new Date(req.date), "MMM d")} was ${status}.`,
      req.id,
      { route: "/attendance", type: "manual_time_update" }
    );
    fetchData();
  };

  const decideLate = async (req: any, status: "approved" | "rejected") => {
    if (!user) return;
    if (status === "rejected" && !notes[req.id]?.trim()) {
      toast.error("A note is required to reject a late time request.");
      return;
    }
    const { data, error } = await supabase
      .from("late_time_requests")
      .update({ status, approved_by: user.id, approver_note: notes[req.id] || null })
      .eq("id", req.id)
      .select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error(NOT_ALLOWED); return; }
    toast.success(`Late time request ${status}`);
    await notifyEmployee(
      req.user_id,
      `Late Time Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      `Your ${req.request_type === "office_time_change" ? "office time change" : "late adjustment"} request for ${format(new Date(req.effective_date), "MMM d")} was ${status}.`,
      req.id,
      { route: "/", type: "late_time_update" }
    );
    fetchData();
  };

  /** Debit the employee's leave balance for the year, creating the row if needed. */
  const applyLeaveBalance = async (req: any) => {
    const { data: bal } = await supabase
      .from("leave_balances")
      .select("*")
      .eq("user_id", req.user_id)
      .eq("leave_type_id", req.leave_type_id)
      .eq("year", new Date(req.start_date).getFullYear())
      .maybeSingle();
    if (bal) {
      await supabase.from("leave_balances").update({ used: (bal.used || 0) + Number(req.total_days) }).eq("id", bal.id);
    } else {
      const { data: lt } = await supabase.from("leave_types").select("annual_quota").eq("id", req.leave_type_id).maybeSingle();
      await supabase.from("leave_balances").insert({
        user_id: req.user_id, leave_type_id: req.leave_type_id, year: new Date(req.start_date).getFullYear(),
        allocated: lt?.annual_quota || 0, used: Number(req.total_days), carried_forward: 0,
      });
    }
  };

  const decideLeave = async (req: any, status: "approved" | "rejected") => {
    if (!user) return;
    if (status === "rejected" && !notes[req.id]?.trim()) {
      toast.error("A note is required to reject a leave request.");
      return;
    }
    const { data, error } = await supabase
      .from("leave_requests")
      .update({ status, approver_id: user.id, approver_note: notes[req.id] || null, approved_at: new Date().toISOString() })
      .eq("id", req.id)
      .select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error(NOT_ALLOWED); return; }
    if (status === "approved") await applyLeaveBalance(req);
    toast.success(`Leave request ${status}`);
    await notifyEmployee(
      req.user_id,
      `Leave Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      `Your ${leaveTypeNames[req.leave_type_id] || "leave"} request (${req.start_date} → ${req.end_date}) was ${status}.`,
      req.id,
      { route: "/leave", type: "leave_update" }
    );
    fetchData();
  };

  const openModifyLeave = async (req: any) => {
    setModReq(req);
    setModForm({
      leave_type_id: req.leave_type_id,
      start_date: req.start_date,
      end_date: req.end_date,
      day_type: req.day_type,
      note: "",
    });
    const [{ data: lts }, { data: hols }, { data: prof }] = await Promise.all([
      supabase.from("leave_types").select("id, name, sandwich_leave, bridge_holidays").eq("active", true),
      supabase.from("holidays").select("holiday_date, wing_names"),
      supabase.from("profiles").select("working_days, company_wing").eq("id", req.user_id).maybeSingle(),
    ]);
    setModLeaveTypes((lts || []) as { id: string; name: string; sandwich_leave?: boolean; bridge_holidays?: boolean }[]);
    const wingHolidays = (hols || []).filter(
      (h: { wing_names: string[] | null }) => !h.wing_names?.length || h.wing_names.includes((prof as { company_wing?: string } | null)?.company_wing)
    );
    setModHolidaySet(new Set(wingHolidays.map((h: { holiday_date: string }) => h.holiday_date)));
    setModWeekend(weekendDaysFor(prof as WorkSchedule | null));
    setModOpen(true);
  };

  const submitModifyLeave = async () => {
    if (!modReq || !user) return;
    if (!modForm.leave_type_id || !modForm.start_date || !modForm.end_date) { toast.error("Fill all fields"); return; }
    const modLt = modLeaveTypes.find((t) => t.id === modForm.leave_type_id);
    const days = computeWorkingDays(modForm.start_date, modForm.end_date, modForm.day_type, modWeekend, modHolidaySet, !!modLt?.sandwich_leave, modLt?.bridge_holidays === true);
    if (days <= 0) { toast.error("No working days in modified range"); return; }
    setModSaving(true);
    const { data, error } = await supabase
      .from("leave_requests")
      .update({
        leave_type_id: modForm.leave_type_id,
        start_date: modForm.start_date,
        end_date: modForm.end_date,
        day_type: modForm.day_type,
        total_days: days,
        status: "approved",
        approver_id: user.id,
        approver_note: modForm.note || null,
        approved_at: new Date().toISOString(),
        modified_by: user.id,
        modified_at: new Date().toISOString(),
        original_start_date: modReq.original_start_date ?? modReq.start_date,
        original_end_date: modReq.original_end_date ?? modReq.end_date,
        original_leave_type_id: modReq.original_leave_type_id ?? modReq.leave_type_id,
        original_day_type: modReq.original_day_type ?? modReq.day_type,
        original_total_days: modReq.original_total_days ?? modReq.total_days,
      })
      .eq("id", modReq.id)
      .select("id");
    setModSaving(false);
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error(NOT_ALLOWED); return; }
    await applyLeaveBalance({ user_id: modReq.user_id, leave_type_id: modForm.leave_type_id, start_date: modForm.start_date, total_days: days });
    const lt = modLeaveTypes.find((l) => l.id === modForm.leave_type_id);
    await notifyEmployee(
      modReq.user_id,
      "Leave Modified & Approved",
      `Your leave was modified to ${lt?.name || "leave"} (${modForm.start_date} → ${modForm.end_date}, ${days}d) and approved.`,
      modReq.id,
      { route: "/leave", type: "leave_update" }
    );
    toast.success("Leave modified & approved");
    setModOpen(false);
    setModReq(null);
    fetchData();
  };

  const handleAction = async (req: any, status: "approved" | "rejected") => {
    if (!user) return;
    if (status === "rejected" && !notes[req.id]?.trim()) {
      toast.error("A note is required to reject an overtime request.");
      return;
    }
    let finalHours = req.requested_hours;
    if (status === "approved") {
      finalHours = await applyOTFulfillment(req.user_id, req.date, req.requested_hours);
    }
    const { data, error } = await supabase
      .from("overtime_requests")
      .update({ status, approved_by: user.id, requested_hours: finalHours, approver_note: notes[req.id] || null })
      .eq("id", req.id)
      .select("id");
    if (error) toast.error(error.message);
    else if (!data?.length) toast.error(NOT_ALLOWED);
    else {
      const detail = status === "approved" && finalHours < req.requested_hours
        ? ` (adjusted from ${req.requested_hours}h to ${finalHours}h after standard hours fulfillment)`
        : "";
      toast.success(`Request ${status} successfully${detail}`);
      await notifyEmployee(
        req.user_id,
        `OT Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        `Your ${finalHours}h OT request for ${format(new Date(req.date), "MMM d")} was ${status}.${detail}`,
        req.id,
        { route: "/ot-requests", type: "ot_update" }
      );
      fetchData();
    }
  };

  const deleteOT = async (req: any, reason: string) => {
    if (!user) return;
    let trashId: string;
    try {
      trashId = await moveToTrash("overtime", req, user.id, reason);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move this to Trash — delete cancelled.");
      return;
    }
    const { data, error } = await supabase.from("overtime_requests").delete().eq("id", req.id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error(NOT_ALLOWED); return; }
    toastDeletedWithUndo("OT request deleted", trashId, fetchData);
    await notifyEmployee(
      req.user_id,
      "OT Request Deleted",
      `Your ${req.requested_hours}h OT request for ${format(new Date(req.date), "MMM d")} was deleted by an admin. Reason: ${reason}`,
      undefined,
      { route: "/ot-requests", type: "ot_update" },
    );
    fetchData();
  };

  const deleteManual = async (req: { id: string; user_id: string; date: string }, reason: string) => {
    if (!user) return;
    let trashId: string;
    try {
      trashId = await moveToTrash("manual_time", req, user.id, reason);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move this to Trash — delete cancelled.");
      return;
    }
    const { data, error } = await supabase.from("manual_time_requests").delete().eq("id", req.id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error(NOT_ALLOWED); return; }
    toastDeletedWithUndo("Manual time request deleted", trashId, fetchData);
    await notifyEmployee(
      req.user_id,
      "Manual Time Request Deleted",
      `Your manual time entry for ${format(new Date(req.date), "MMM d")} was deleted by an admin. Reason: ${reason}`,
      undefined,
      { route: "/attendance", type: "manual_time_update" },
    );
    fetchData();
  };

  const deleteLeave = async (req: any, reason: string) => {
    // Deliberately bypasses Trash (unlike the other 5 types) — restoring a
    // Leave row later would re-insert it without re-debiting
    // leave_balances.used (that only happens via decideLeave's own
    // approval code, never on a raw insert), so a "restored" leave would
    // misleadingly look approved while never actually consuming the
    // balance it originally did. Permanent delete avoids that mismatch.
    const { data, error } = await supabase.from("leave_requests").delete().eq("id", req.id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error(NOT_ALLOWED); return; }
    toast.success("Leave request deleted");
    await notifyEmployee(
      req.user_id,
      "Leave Request Deleted",
      `Your ${leaveTypeNames[req.leave_type_id] || "leave"} request (${req.start_date} → ${req.end_date}) was deleted by an admin. Reason: ${reason}`,
      undefined,
      { route: "/leave", type: "leave_update" },
    );
    fetchData();
  };

  const deleteLate = async (req: any, reason: string) => {
    // Deliberately bypasses Trash (unlike the other 5 types) — restoring a
    // Late Time row later would re-insert it without re-stamping
    // attendance_logs (apply_late_time_request() only fires on UPDATE to
    // 'approved', never on a raw insert), so a "restored" late-time
    // approval would misleadingly look approved while the attendance it
    // originally changed stays untouched. Permanent delete avoids that
    // mismatch.
    const { data, error } = await supabase.from("late_time_requests").delete().eq("id", req.id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error(NOT_ALLOWED); return; }
    toast.success("Late time request deleted");
    await notifyEmployee(
      req.user_id,
      "Late Time Request Deleted",
      `Your ${req.request_type === "office_time_change" ? "office time change" : "late adjustment"} request for ${format(new Date(req.effective_date), "MMM d")} was deleted by an admin. Reason: ${reason}`,
      undefined,
      { route: "/", type: "late_time_update" },
    );
    fetchData();
  };

  const decideLoan = async (loan: any, status: "approved" | "rejected") => {
    if (!user) return;
    if (status === "rejected" && !notes[loan.id]?.trim()) {
      toast.error("A note is required to reject a loan request.");
      return;
    }
    const { data, error } = await supabase.from("personal_advances").update({
      status, approved_by: user.id, approved_at: new Date().toISOString(), approver_note: notes[loan.id] || null,
    }).eq("id", loan.id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error(NOT_ALLOWED); return; }
    if (status === "approved") {
      await supabase.from("personal_advance_actions").insert({
        personal_advance_id: loan.id, user_id: loan.user_id, action_type: "issued",
        amount: loan.amount, remaining_after: loan.amount, created_by: user.id,
      });
    }
    toast.success(`Loan ${status}`);
    await notifyEmployee(
      loan.user_id,
      `Loan ${status === "approved" ? "Approved" : "Rejected"}`,
      `Your loan request of ${loan.amount} was ${status}.`,
      loan.id,
      { route: "/payment", type: "personal_advance_update" },
    );
    fetchData();
  };

  const deleteLoanHistory = async (loan: any, reason: string) => {
    if (!user) return;
    let trashId: string;
    try {
      trashId = await moveToTrash("loan", loan, user.id, reason);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move this to Trash — delete cancelled.");
      return;
    }
    const { data, error } = await supabase.from("personal_advances").delete().eq("id", loan.id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error(NOT_ALLOWED); return; }
    toastDeletedWithUndo("Loan record deleted", trashId, fetchData);
    await notifyEmployee(
      loan.user_id,
      "Loan Record Deleted",
      `Your loan record of ${loan.amount} was deleted by an admin. Reason: ${reason}`,
      undefined,
      { route: "/payment", type: "personal_advance_update" },
    );
    fetchData();
  };

  const decideExpense = async (claim: any, status: "approved" | "rejected") => {
    if (!user) return;
    if (status === "rejected" && !notes[claim.id]?.trim()) {
      toast.error("A note is required to reject an expense claim.");
      return;
    }
    const { data, error } = await supabase.from("expense_claims").update({
      status, approver_id: user.id, approved_at: new Date().toISOString(), approver_note: notes[claim.id] || null,
    }).eq("id", claim.id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error(NOT_ALLOWED); return; }
    toast.success(`Claim ${status}`);
    await notifyEmployee(
      claim.user_id,
      `Expense Claim ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      `Your ${claim.category} claim for ${claim.amount} was ${status}.`,
      claim.id,
      { route: "/expenses", type: "expense_claim_update" },
    );
    fetchData();
  };

  const deleteExpenseHistory = async (claim: any, reason: string) => {
    // Same guard Payment.tsx's own delete already applies — a recovered
    // claim's expense_recovery_actions rows cascade-delete with it, which
    // would silently wipe ledger history rather than just the claim.
    if (Number(claim.recovered_amount) > 0) {
      toast.error("This claim has already been partially or fully recovered via My Payments and can't be deleted.");
      return;
    }
    if (!user) return;
    let trashId: string;
    try {
      trashId = await moveToTrash("expense", claim, user.id, reason);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move this to Trash — delete cancelled.");
      return;
    }
    const { data, error } = await supabase.from("expense_claims").delete().eq("id", claim.id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error(NOT_ALLOWED); return; }
    toastDeletedWithUndo("Expense claim deleted", trashId, fetchData);
    await notifyEmployee(
      claim.user_id,
      "Expense Claim Deleted",
      `Your ${claim.category} claim for ${claim.amount} was deleted by an admin. Reason: ${reason}`,
      undefined,
      { route: "/expenses", type: "expense_claim_update" },
    );
    fetchData();
  };

  const openEdit = (req: any) => {
    setEditReq(req);
    setEditHours(String(req.requested_hours));
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editReq || !user) return;
    const newHours = parseFloat(editHours);
    if (isNaN(newHours) || newHours <= 0) { toast.error("Invalid hours"); return; }
    // Modify is an explicit admin override — store exactly what they typed.
    // Re-running applyOTFulfillment here silently re-capped/re-adjusted the
    // admin's chosen value (e.g. typed 5h, daily cap quietly saved 4h),
    // which made Modify not actually set the hours the admin asked for.
    const { data, error } = await supabase
      .from("overtime_requests")
      .update({
        requested_hours: newHours,
        original_hours: editReq.original_hours ?? editReq.requested_hours,
        status: "modified" as any,
        approved_by: user.id,
        modified_by: user.id,
        modified_at: new Date().toISOString(),
      })
      .eq("id", editReq.id)
      .select("id");
    if (error) toast.error(error.message);
    else if (!data?.length) toast.error(NOT_ALLOWED);
    else {
      toast.success(`Hours modified to ${newHours}h & approved`);
      await notifyEmployee(
        editReq.user_id,
        "OT Hours Modified",
        `Your OT request was modified to ${newHours}h.`,
        editReq.id,
        { route: "/ot-requests", type: "ot_update" }
      );
      setEditOpen(false);
      fetchData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>{t("Total OT This Month")}</CardDescription></CardHeader>
          <CardContent><div className="flex items-center gap-2"><Timer className="h-5 w-5 text-primary" /><span className="text-2xl font-bold">{stats.totalOT}h</span></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>{t("Pending Requests")}</CardDescription></CardHeader>
          <CardContent><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-destructive" /><span className="text-2xl font-bold">{stats.pendingCount}</span></div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>{t("Monthly Active Employees")}</CardDescription></CardHeader>
          <CardContent><div className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><span className="text-2xl font-bold">{stats.activeEmployees}</span></div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("Pending Approvals")}</CardTitle>
          <CardDescription>{t("Everything waiting on a decision, grouped by type.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="overtime">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="overtime">{t("Overtime")} ({pending.length})</TabsTrigger>
              <TabsTrigger value="manual">{t("Manual Time")} ({manualPending.length})</TabsTrigger>
              <TabsTrigger value="late">{t("Late Time")} ({latePending.length})</TabsTrigger>
              <TabsTrigger value="leave">{t("Leave")} ({leavePending.length})</TabsTrigger>
              <TabsTrigger value="loan">{t("Loan")} ({loanPending.length})</TabsTrigger>
              <TabsTrigger value="expense">{t("Expense")} ({expensePending.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="overtime">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Employee")}</TableHead>
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead>{t("Hours")}</TableHead>
                    <TableHead>{t("Reason")}</TableHead>
                    <TableHead>{t("Note")}</TableHead>
                    <TableHead>{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No pending requests</TableCell></TableRow>
                  ) : pending.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{(req.profiles as any)?.full_name || (req.profiles as any)?.email || "Unknown"}</TableCell>
                      <TableCell>{format(new Date(req.date), "MMM d, yyyy")}</TableCell>
                      <TableCell><Badge>{req.requested_hours}h</Badge></TableCell>
                      <TableCell className="max-w-48 truncate">
                        {req.reason}
                        <AttachmentThumbnails urls={req.attachments} />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Required to reject"
                          value={notes[req.id] || ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                          className="h-8 w-40"
                        />
                      </TableCell>
                      <TableCell className="space-x-1">
                        <Button size="sm" className="bg-lime-500 hover:bg-lime-600 text-white" onClick={() => handleAction(req, "approved")}>
                          <Check className="h-4 w-4 mr-1" /> {t("Approve")}
                        </Button>
                        <Button
                          size="sm"
                          className="bg-[#FF6347] hover:bg-[#E5533D] text-white"
                          disabled={!notes[req.id]?.trim()}
                          onClick={() => handleAction(req, "rejected")}
                        >
                          <X className="h-4 w-4 mr-1" /> {t("Reject")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(req)}>
                          <Pencil className="h-4 w-4 mr-1" /> Modify
                        </Button>
                        <DeleteReasonDialog
                          title="Delete this OT request?"
                          description="This cannot be undone."
                          onConfirm={(reason) => deleteOT(req, reason)}
                          trigger={
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4 mr-1" /> Delete
                            </Button>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="manual">
              <p className="text-xs text-muted-foreground mb-2">Approved entries are written straight into the employee's attendance record.</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Employee")}</TableHead>
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead>{t("In / Out")}</TableHead>
                    <TableHead>{t("Total")}</TableHead>
                    <TableHead>{t("Approve OT (h)")}</TableHead>
                    <TableHead>{t("Reason / Task")}</TableHead>
                    <TableHead>{t("Note")}</TableHead>
                    <TableHead>{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manualPending.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No pending manual time requests</TableCell></TableRow>
                  ) : manualPending.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{names[req.user_id] || "Unknown"}</TableCell>
                      <TableCell className="whitespace-nowrap">{format(new Date(req.date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs font-mono">
                        {format(new Date(req.clock_in), "HH:mm")} – {format(new Date(req.clock_out), "HH:mm")}
                        {Number(req.break_minutes) > 0 && <span className="text-muted-foreground"> (−{req.break_minutes}m)</span>}
                      </TableCell>
                      <TableCell>
                        <Badge>{Number(req.total_hours).toFixed(2)}h</Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          placeholder={(manualSuggestedOT[req.id] ?? Number(req.overtime_hours)).toFixed(2)}
                          value={manualOT[req.id] ?? ""}
                          onChange={(e) => setManualOT((m) => ({ ...m, [req.id]: e.target.value }))}
                          className="h-8 w-24 font-mono"
                        />
                      </TableCell>
                      <TableCell className="max-w-48">
                        {req.gmgi_task || req.gm_task ? (
                          <div className="text-xs space-y-0.5">
                            {req.gmgi_task && (
                              <div className="truncate">
                                <span className="font-medium">GMGI:</span> {req.gmgi_task}
                                {Number(req.gmgi_time) > 0 && ` (${Number(req.gmgi_time)}h)`}
                              </div>
                            )}
                            {req.gm_task && (
                              <div className="truncate">
                                <span className="font-medium">GM:</span> {req.gm_task}
                                {Number(req.gm_time) > 0 && ` (${Number(req.gm_time)}h)`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="truncate block">{req.task_note || req.reason || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Required to reject"
                          value={notes[req.id] || ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                          className="h-8 w-40"
                        />
                      </TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap">
                        <Button size="sm" className="bg-lime-500 hover:bg-lime-600 text-white" onClick={() => decideManual(req, "approved")}>
                          <Check className="h-4 w-4 mr-1" /> {t("Approve")}
                        </Button>
                        <Button
                          size="sm"
                          className="bg-[#FF6347] hover:bg-[#E5533D] text-white"
                          disabled={!notes[req.id]?.trim()}
                          onClick={() => decideManual(req, "rejected")}
                        >
                          <X className="h-4 w-4 mr-1" /> {t("Reject")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="late">
              <p className="text-xs text-muted-foreground mb-2">Late penalty adjustments and approved office-time changes.</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Employee")}</TableHead>
                    <TableHead>{t("Type")}</TableHead>
                    <TableHead>{t("Effective")}</TableHead>
                    <TableHead>{t("Details")}</TableHead>
                    <TableHead>{t("Reason")}</TableHead>
                    <TableHead>{t("Note")}</TableHead>
                    <TableHead>{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latePending.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No pending late time requests</TableCell></TableRow>
                  ) : latePending.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{names[req.user_id] || "Unknown"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{req.request_type === "office_time_change" ? "Office time change" : "Late adjustment"}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(req.effective_date), "MMM d, yyyy")}
                        {req.effective_to && req.effective_to !== req.effective_date && ` – ${format(new Date(req.effective_to), "MMM d, yyyy")}`}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {req.request_type === "office_time_change"
                          ? `${String(req.requested_start_time).slice(0, 5)} – ${String(req.requested_end_time).slice(0, 5)}`
                          : `Late ${humanMinutes(Number(req.late_minutes) || 0)} · waive ${humanMinutes(Number(req.adjustment_minutes) || 0)}`}
                      </TableCell>
                      <TableCell className="max-w-48 truncate">
                        {req.reason || "—"}
                        <AttachmentThumbnails urls={req.attachments} />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Required to reject"
                          value={notes[req.id] || ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                          className="h-8 w-40"
                        />
                      </TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap">
                        <Button size="sm" className="bg-lime-500 hover:bg-lime-600 text-white" onClick={() => decideLate(req, "approved")}>
                          <Check className="h-4 w-4 mr-1" /> {t("Approve")}
                        </Button>
                        <Button
                          size="sm"
                          className="bg-[#FF6347] hover:bg-[#E5533D] text-white"
                          disabled={!notes[req.id]?.trim()}
                          onClick={() => decideLate(req, "rejected")}
                        >
                          <X className="h-4 w-4 mr-1" /> {t("Reject")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="leave">
              <p className="text-xs text-muted-foreground mb-2">Approving debits the employee's leave balance for the year.</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Employee")}</TableHead>
                    <TableHead>{t("Type")}</TableHead>
                    <TableHead>{t("Dates")}</TableHead>
                    <TableHead>{t("Days")}</TableHead>
                    <TableHead>{t("Reason")}</TableHead>
                    <TableHead>{t("Note")}</TableHead>
                    <TableHead>{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leavePending.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No pending leave requests</TableCell></TableRow>
                  ) : leavePending.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{names[req.user_id] || "Unknown"}</TableCell>
                      <TableCell><Badge variant="outline">{leaveTypeNames[req.leave_type_id] || "—"}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {format(new Date(req.start_date), "MMM d")} – {format(new Date(req.end_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell><Badge>{req.total_days}d</Badge></TableCell>
                      <TableCell className="max-w-48 truncate">
                        {req.reason || "—"}
                        <AttachmentThumbnails urls={req.attachments} />
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Required to reject"
                          value={notes[req.id] || ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                          className="h-8 w-40"
                        />
                      </TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap">
                        <Button size="sm" className="bg-lime-500 hover:bg-lime-600 text-white" onClick={() => decideLeave(req, "approved")}>
                          <Check className="h-4 w-4 mr-1" /> {t("Approve")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openModifyLeave(req)}>
                          <Pencil className="h-4 w-4 mr-1" /> {t("Modify")}
                        </Button>
                        <Button
                          size="sm"
                          className="bg-[#FF6347] hover:bg-[#E5533D] text-white"
                          disabled={!notes[req.id]?.trim()}
                          onClick={() => decideLeave(req, "rejected")}
                        >
                          <X className="h-4 w-4 mr-1" /> {t("Reject")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="loan">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Employee")}</TableHead>
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead>{t("Amount")}</TableHead>
                    <TableHead>{t("Reason")}</TableHead>
                    <TableHead>{t("Installments")}</TableHead>
                    <TableHead>{t("Note")}</TableHead>
                    <TableHead>{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loanPending.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No pending loan requests</TableCell></TableRow>
                  ) : loanPending.map((loan) => (
                    <TableRow key={loan.id}>
                      <TableCell className="font-medium">{names[loan.user_id] || "Unknown"}</TableCell>
                      <TableCell className="whitespace-nowrap">{format(new Date(loan.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell className="font-semibold">{Number(loan.amount).toLocaleString()}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs text-muted-foreground">{loan.reason || "—"}</TableCell>
                      <TableCell>{loan.installments} installment{loan.installments === 1 ? "" : "s"} · {Number(loan.monthly_deduction).toLocaleString()}/mo</TableCell>
                      <TableCell>
                        <Input
                          placeholder="Required to reject"
                          value={notes[loan.id] || ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [loan.id]: e.target.value }))}
                          className="h-8 w-40"
                        />
                      </TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap">
                        <Button size="sm" className="bg-lime-500 hover:bg-lime-600 text-white" onClick={() => decideLoan(loan, "approved")}>
                          <Check className="h-4 w-4 mr-1" /> {t("Approve")}
                        </Button>
                        <Button
                          size="sm"
                          className="bg-[#FF6347] hover:bg-[#E5533D] text-white"
                          disabled={!notes[loan.id]?.trim()}
                          onClick={() => decideLoan(loan, "rejected")}
                        >
                          <X className="h-4 w-4 mr-1" /> {t("Reject")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="expense">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Employee")}</TableHead>
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead>{t("Category")}</TableHead>
                    <TableHead>{t("Amount")}</TableHead>
                    <TableHead>{t("Description")}</TableHead>
                    <TableHead>{t("Note")}</TableHead>
                    <TableHead>{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expensePending.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No pending expense claims</TableCell></TableRow>
                  ) : expensePending.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium">{names[claim.user_id] || "Unknown"}</TableCell>
                      <TableCell className="whitespace-nowrap">{format(new Date(claim.claim_date), "MMM d, yyyy")}</TableCell>
                      <TableCell><Badge variant="outline">{claim.category}</Badge></TableCell>
                      <TableCell className="font-semibold">{Number(claim.amount).toLocaleString()}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs text-muted-foreground">{claim.description || "—"}</TableCell>
                      <TableCell>
                        <Input
                          placeholder="Required to reject"
                          value={notes[claim.id] || ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [claim.id]: e.target.value }))}
                          className="h-8 w-40"
                        />
                      </TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap">
                        <Button size="sm" className="bg-lime-500 hover:bg-lime-600 text-white" onClick={() => decideExpense(claim, "approved")}>
                          <Check className="h-4 w-4 mr-1" /> {t("Approve")}
                        </Button>
                        <Button
                          size="sm"
                          className="bg-[#FF6347] hover:bg-[#E5533D] text-white"
                          disabled={!notes[claim.id]?.trim()}
                          onClick={() => decideExpense(claim, "rejected")}
                        >
                          <X className="h-4 w-4 mr-1" /> {t("Reject")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* History — every decided request, grouped into tabs by type */}
      {(() => {
        // Search matches the employee's name/email; date range matches each
        // type's own "when it happened" field (see HISTORY_DATE_FIELD) — same
        // fields each tab's own Date/Effective/Dates column already shows,
        // so filtering never touches any stored value, only what's displayed.
        const matchesHistoryFilter = (row: any, type: string) => {
          if (historySearch.trim()) {
            const name = (row.profiles?.full_name || row.profiles?.email || names[row.user_id] || "").toLowerCase();
            if (!name.includes(historySearch.trim().toLowerCase())) return false;
          }
          const rawDate = row[HISTORY_DATE_FIELD[type]];
          if (rawDate && (historyFrom || historyTo)) {
            const d = format(new Date(rawDate), "yyyy-MM-dd");
            if (historyFrom && d < historyFrom) return false;
            if (historyTo && d > historyTo) return false;
          }
          return true;
        };
        const historyData: Record<string, any[]> = {
          overtime: history.filter((r) => matchesHistoryFilter(r, "overtime")),
          manual: manualHistory.filter((r) => matchesHistoryFilter(r, "manual")),
          late: lateHistory.filter((r) => matchesHistoryFilter(r, "late")),
          leave: leaveHistory.filter((r) => matchesHistoryFilter(r, "leave")),
          loan: loanHistory.filter((r) => matchesHistoryFilter(r, "loan")),
          expense: expenseHistory.filter((r) => matchesHistoryFilter(r, "expense")),
        };
        const activeHistory = historyData[historyTab] || [];
        const hasFilter = historySearch.trim() !== "" || historyFrom !== "" || historyTo !== "";
        const historyPageCount = Math.max(1, Math.ceil(activeHistory.length / HISTORY_PAGE_SIZE));
        const currentHistoryPage = Math.min(historyPage[historyTab] || 1, historyPageCount);
        const setCurrentHistoryPage = (p: number) => setHistoryPage((prev) => ({ ...prev, [historyTab]: p }));
        const setCurrentHistoryPageAll = (p: number) =>
          setHistoryPage({ overtime: p, manual: p, late: p, leave: p, loan: p, expense: p });
        const pageSlice = (rows: any[]) =>
          rows.slice((currentHistoryPage - 1) * HISTORY_PAGE_SIZE, currentHistoryPage * HISTORY_PAGE_SIZE);
        return (
      <Card>
        <CardHeader>
          <CardTitle>{t("History")}</CardTitle>
          <CardDescription>{t("Track every decided request and how it was resolved.")}</CardDescription>
          <div className="flex flex-wrap items-end gap-2 pt-2">
            <div className="flex-1 min-w-[180px]">
              <Label htmlFor="history-search" className="text-xs text-muted-foreground">{t("Employee")}</Label>
              <Input
                id="history-search"
                placeholder="Search by name or email"
                value={historySearch}
                onChange={(e) => { setHistorySearch(e.target.value); setCurrentHistoryPageAll(1); }}
              />
            </div>
            <div>
              <Label htmlFor="history-from" className="text-xs text-muted-foreground">{t("From")}</Label>
              <Input
                id="history-from"
                type="date"
                value={historyFrom}
                onChange={(e) => { setHistoryFrom(e.target.value); setCurrentHistoryPageAll(1); }}
              />
            </div>
            <div>
              <Label htmlFor="history-to" className="text-xs text-muted-foreground">{t("To")}</Label>
              <Input
                id="history-to"
                type="date"
                value={historyTo}
                onChange={(e) => { setHistoryTo(e.target.value); setCurrentHistoryPageAll(1); }}
              />
            </div>
            {hasFilter && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setHistorySearch(""); setHistoryFrom(""); setHistoryTo(""); setCurrentHistoryPageAll(1); }}
              >
                {t("Clear filters")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={historyTab} onValueChange={setHistoryTab}>
            <TabsList>
              <TabsTrigger value="overtime">{t("Overtime")}</TabsTrigger>
              <TabsTrigger value="manual">{t("Manual Time")}</TabsTrigger>
              <TabsTrigger value="late">{t("Late Time")}</TabsTrigger>
              <TabsTrigger value="leave">{t("Leave")}</TabsTrigger>
              <TabsTrigger value="loan">{t("Loan")}</TabsTrigger>
              <TabsTrigger value="expense">{t("Expense")}</TabsTrigger>
            </TabsList>

            <TabsContent value="overtime">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Employee")}</TableHead>
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead>{t("Hours")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.overtime.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No matching history</TableCell></TableRow>
                  ) : pageSlice(historyData.overtime).map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>{(req.profiles as any)?.full_name || (req.profiles as any)?.email || "Unknown"}</TableCell>
                      <TableCell>{format(new Date(req.date), "MMM d, yyyy")}</TableCell>
                      <TableCell>{req.requested_hours}h</TableCell>
                      <TableCell>
                        <Badge className={otStatusStyle(req.status)}>
                          {req.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DeleteReasonDialog
                          title="Delete this OT request?"
                          description="This cannot be undone."
                          onConfirm={(reason) => deleteOT(req, reason)}
                          trigger={
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4 mr-1" /> Delete
                            </Button>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="manual">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Employee")}</TableHead>
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>{t("Total")}</TableHead>
                    <TableHead>OT</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>Decided By</TableHead>
                    <TableHead>{t("Note")}</TableHead>
                    <TableHead>{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.manual.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No matching manual time request history</TableCell></TableRow>
                  ) : pageSlice(historyData.manual).map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{names[req.user_id] || "Unknown"}</TableCell>
                      <TableCell className="whitespace-nowrap">{format(new Date(req.date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs font-mono">
                        {format(new Date(req.clock_in), "HH:mm")} – {format(new Date(req.clock_out), "HH:mm")}
                      </TableCell>
                      <TableCell><Badge>{Number(req.total_hours).toFixed(2)}h</Badge></TableCell>
                      <TableCell>{Number(req.overtime_hours).toFixed(2)}h</TableCell>
                      <TableCell>
                        <Badge className={otStatusStyle(req.status)}>{req.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{req.approved_by ? names[req.approved_by] || "—" : "—"}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs text-muted-foreground">{req.approver_note || "—"}</TableCell>
                      <TableCell>
                        <DeleteReasonDialog
                          title="Delete this manual time request?"
                          description="This cannot be undone."
                          onConfirm={(reason) => deleteManual(req, reason)}
                          trigger={
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="late">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Employee")}</TableHead>
                    <TableHead>{t("Type")}</TableHead>
                    <TableHead>{t("Effective")}</TableHead>
                    <TableHead>{t("Details")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>Decided By</TableHead>
                    <TableHead>{t("Note")}</TableHead>
                    <TableHead>{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.late.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No matching late time request history</TableCell></TableRow>
                  ) : pageSlice(historyData.late).map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{names[req.user_id] || "Unknown"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{req.request_type === "office_time_change" ? "Office time change" : "Late adjustment"}</Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(req.effective_date), "MMM d, yyyy")}
                        {req.effective_to && req.effective_to !== req.effective_date && ` – ${format(new Date(req.effective_to), "MMM d, yyyy")}`}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {req.request_type === "office_time_change"
                          ? `${String(req.requested_start_time).slice(0, 5)} – ${String(req.requested_end_time).slice(0, 5)}`
                          : `Late ${humanMinutes(Number(req.late_minutes) || 0)} · waive ${humanMinutes(Number(req.adjustment_minutes) || 0)}`}
                      </TableCell>
                      <TableCell>
                        <Badge className={otStatusStyle(req.status)}>{req.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{req.approved_by ? names[req.approved_by] || "—" : "—"}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs text-muted-foreground">{req.approver_note || "—"}</TableCell>
                      <TableCell>
                        <DeleteReasonDialog
                          title="Delete this late time request?"
                          description="This cannot be undone."
                          onConfirm={(reason) => deleteLate(req, reason)}
                          trigger={
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="leave">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Employee")}</TableHead>
                    <TableHead>{t("Type")}</TableHead>
                    <TableHead>{t("Dates")}</TableHead>
                    <TableHead>{t("Days")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>Decided By</TableHead>
                    <TableHead>{t("Note")}</TableHead>
                    <TableHead>{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.leave.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No matching leave request history</TableCell></TableRow>
                  ) : pageSlice(historyData.leave).map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{names[req.user_id] || "Unknown"}</TableCell>
                      <TableCell><Badge variant="outline">{leaveTypeNames[req.leave_type_id] || "—"}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {format(new Date(req.start_date), "MMM d")} – {format(new Date(req.end_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell><Badge>{req.total_days}d</Badge></TableCell>
                      <TableCell>
                        <Badge className={otStatusStyle(req.status)}>{req.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{req.approver_id ? names[req.approver_id] || "—" : "—"}</TableCell>
                      <TableCell className="max-w-48 truncate text-xs text-muted-foreground">{req.approver_note || "—"}</TableCell>
                      <TableCell>
                        <DeleteReasonDialog
                          title="Delete this leave request?"
                          description="This cannot be undone."
                          onConfirm={(reason) => deleteLeave(req, reason)}
                          trigger={
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="loan">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Employee")}</TableHead>
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead>{t("Amount")}</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>Decided By</TableHead>
                    <TableHead>{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.loan.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No matching loan history</TableCell></TableRow>
                  ) : pageSlice(historyData.loan).map((loan) => (
                    <TableRow key={loan.id}>
                      <TableCell className="font-medium">{names[loan.user_id] || "Unknown"}</TableCell>
                      <TableCell className="whitespace-nowrap">{format(new Date(loan.created_at), "MMM d, yyyy")}</TableCell>
                      <TableCell>{Number(loan.amount).toLocaleString()}</TableCell>
                      <TableCell>{Number(loan.remaining_balance).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge className={loan.status === "approved" || loan.status === "closed" ? "bg-success text-white" : loan.status === "rejected" ? "bg-destructive text-white" : ""}>{loan.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{loan.approved_by ? names[loan.approved_by] || "—" : "—"}</TableCell>
                      <TableCell>
                        <DeleteReasonDialog
                          title="Delete this loan record?"
                          description="This cannot be undone."
                          onConfirm={(reason) => deleteLoanHistory(loan, reason)}
                          trigger={
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="expense">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Employee")}</TableHead>
                    <TableHead>{t("Date")}</TableHead>
                    <TableHead>{t("Category")}</TableHead>
                    <TableHead>{t("Amount")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead>Decided By</TableHead>
                    <TableHead>{t("Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.expense.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No matching expense history</TableCell></TableRow>
                  ) : pageSlice(historyData.expense).map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="font-medium">{names[claim.user_id] || "Unknown"}</TableCell>
                      <TableCell className="whitespace-nowrap">{format(new Date(claim.claim_date), "MMM d, yyyy")}</TableCell>
                      <TableCell><Badge variant="outline">{claim.category}</Badge></TableCell>
                      <TableCell>{Number(claim.amount).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge className={claim.status === "approved" ? "bg-success text-white" : claim.status === "rejected" ? "bg-destructive text-white" : ""}>{claim.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{claim.approver_id ? names[claim.approver_id] || "—" : "—"}</TableCell>
                      <TableCell>
                        <DeleteReasonDialog
                          title="Delete this expense claim?"
                          description="This cannot be undone."
                          onConfirm={(reason) => deleteExpenseHistory(claim, reason)}
                          trigger={
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>

          {activeHistory.length > HISTORY_PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 pt-3">
              <Button variant="outline" size="sm" disabled={currentHistoryPage <= 1} onClick={() => setCurrentHistoryPage(currentHistoryPage - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground whitespace-nowrap">Page {currentHistoryPage} of {historyPageCount}</span>
              <Button variant="outline" size="sm" disabled={currentHistoryPage >= historyPageCount} onClick={() => setCurrentHistoryPage(currentHistoryPage + 1)}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
        );
      })()}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modify OT Hours</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Employee")}</Label>
              <p className="text-sm text-muted-foreground">{(editReq?.profiles as any)?.full_name || "Unknown"}</p>
            </div>
            <div>
              <Label>Original Hours</Label>
              <p className="text-sm">{editReq?.requested_hours}h</p>
            </div>
            <div>
              <Label>New Hours</Label>
              <Input type="number" step="0.5" min="0.5" value={editHours} onChange={(e) => setEditHours(e.target.value)} />
            </div>
            <Button onClick={handleEdit} className="w-full bg-[#FFD700] hover:bg-[#E6C200] text-black">Save & Approve (Modified)</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modOpen} onOpenChange={setModOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modify &amp; Approve Leave</DialogTitle>
            <DialogDescription>
              Adjust the leave type, dates or day type before approving. The employee will be notified of the changes.
            </DialogDescription>
          </DialogHeader>
          {modReq && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Original: <strong>{leaveTypeNames[modReq.leave_type_id] || "—"}</strong> · {modReq.start_date} → {modReq.end_date} ({modReq.total_days}d)
              </div>
              <div>
                <Label>Leave Type</Label>
                <Select value={modForm.leave_type_id} onValueChange={(v) => setModForm((f) => ({ ...f, leave_type_id: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {modLeaveTypes.map((lt) => (
                      <SelectItem key={lt.id} value={lt.id}>{lt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={modForm.start_date}
                    onChange={(e) => setModForm((f) => ({
                      ...f,
                      start_date: e.target.value,
                      end_date: f.end_date && f.end_date < e.target.value ? e.target.value : f.end_date,
                    }))}
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={modForm.end_date}
                    min={modForm.start_date || undefined}
                    onChange={(e) => setModForm((f) => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label>Day Type</Label>
                <Select value={modForm.day_type} onValueChange={(v: "full" | "first_half" | "second_half") => setModForm((f) => ({ ...f, day_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Day</SelectItem>
                    <SelectItem value="first_half">First Half</SelectItem>
                    <SelectItem value="second_half">Second Half</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Note to employee (optional)</Label>
                <Textarea value={modForm.note} onChange={(e) => setModForm((f) => ({ ...f, note: e.target.value }))} />
              </div>
              <div className="text-sm text-muted-foreground">
                New chargeable days: <strong>
                  {(() => {
                    const lt = modLeaveTypes.find((t) => t.id === modForm.leave_type_id);
                    return computeWorkingDays(modForm.start_date, modForm.end_date, modForm.day_type, modWeekend, modHolidaySet, !!lt?.sandwich_leave, lt?.bridge_holidays === true);
                  })()}
                </strong>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModOpen(false)}>Cancel</Button>
            <Button onClick={submitModifyLeave} disabled={modSaving}>{modSaving ? "Saving…" : "Save & Approve"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Approvals;
