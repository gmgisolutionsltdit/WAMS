import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Megaphone, Pin, Plus, Archive, ArchiveRestore, Pencil, CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

const CATEGORIES = ["general", "policy", "event", "holiday", "urgent"];
const PRIORITIES = [
  { v: "low", label: "Low", color: "bg-muted text-foreground" },
  { v: "normal", label: "Normal", color: "bg-primary text-primary-foreground" },
  { v: "high", label: "High", color: "bg-warning text-white" },
  { v: "critical", label: "Critical", color: "bg-destructive text-white" },
];

const PAGE_SIZE = 10;

const emptyForm = { title: "", body: "", category: "general", priority: "normal", pinned: false, expires_at: "" };

const NoticeBoard = () => {
  const { user, role } = useAuth();
  const canManage = role === "admin";
  const [allNotices, setAllNotices] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [showArchived, setShowArchived] = useState(false);
  // Which notices/activity entries *I* have personally archived — archiving
  // is per-viewer (it only hides the item from the person who archived it),
  // so this is never written to the shared notice/request row itself.
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<Set<string>>(new Set());
  const [selectedArchived, setSelectedArchived] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const [activity, setActivity] = useState<any[]>([]);
  const [dismissedActivityKeys, setDismissedActivityKeys] = useState<Set<string>>(new Set());
  const [namesByUser, setNamesByUser] = useState<Record<string, string>>({});
  const [leaveTypeNames, setLeaveTypeNames] = useState<Record<string, string>>({});
  const [filterDate, setFilterDate] = useState("");
  const [filterUser, setFilterUser] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [selectedNotices, setSelectedNotices] = useState<Set<string>>(new Set());
  const [activityPage, setActivityPage] = useState(1);
  const [selectedActivity, setSelectedActivity] = useState<Set<string>>(new Set());
  const [showArchivedActivity, setShowArchivedActivity] = useState(false);
  // fetchActivity is called from 4 independent realtime subscriptions (one per
  // request table). Archiving several rows across tables at once fires several
  // of those almost simultaneously, and their fetches can resolve out of
  // order — without this guard, an older, slower response could land after a
  // newer one and clobber it with stale (pre-archive) data, making an entry
  // that was just archived flicker back into the active list, or vice versa.
  const activityFetchSeq = useRef(0);

  const fetchNotices = async () => {
    const { data } = await supabase.from("notices").select("*").eq("is_active", true).order("pinned", { ascending: false }).order("published_at", { ascending: false });
    setAllNotices(data || []);
  };

  const fetchDismissedNotices = async () => {
    if (!user) return;
    const { data } = await supabase.from("notice_dismissals").select("notice_id").eq("user_id", user.id);
    setDismissedNoticeIds(new Set((data || []).map((d) => d.notice_id)));
  };

  const notices = allNotices.filter((n) => !dismissedNoticeIds.has(n.id));
  const archivedNotices = allNotices.filter((n) => dismissedNoticeIds.has(n.id));

  /**
   * Leave / late-time request + approval activity, sourced straight from
   * those tables — visibility is whatever their own RLS already allows
   * (own requests, plus anything the viewer's role can approve), so an
   * employee's request only surfaces to their manager/admin, and a
   * manager's own request only surfaces to admin.
   */
  const fetchActivity = async () => {
    const seq = ++activityFetchSeq.current;
    const [{ data: leaveReqs }, { data: lateReqs }, { data: manualReqs }, { data: otReqs }, { data: leaveTypes }] = await Promise.all([
      supabase.from("leave_requests").select("*").order("updated_at", { ascending: false }).limit(50),
      supabase.from("late_time_requests").select("*").order("updated_at", { ascending: false }).limit(50),
      supabase.from("manual_time_requests").select("*").order("updated_at", { ascending: false }).limit(50),
      supabase.from("overtime_requests").select("*").order("updated_at", { ascending: false }).limit(50),
      supabase.from("leave_types").select("id, name"),
    ]);
    // A newer fetchActivity() call has already started (and possibly finished)
    // since this one began — discard this now-stale response instead of
    // letting it overwrite more current state.
    if (seq !== activityFetchSeq.current) return;

    const ltNames: Record<string, string> = {};
    (leaveTypes || []).forEach((lt: { id: string; name: string }) => { ltNames[lt.id] = lt.name; });
    setLeaveTypeNames(ltNames);

    const combined = [
      ...(leaveReqs || []).map((r: any) => ({ ...r, _kind: "leave" as const })),
      ...(lateReqs || []).map((r: any) => ({ ...r, _kind: "late" as const })),
      ...(manualReqs || []).map((r: any) => ({ ...r, _kind: "manual" as const })),
      ...(otReqs || []).map((r: any) => ({ ...r, _kind: "ot" as const })),
    ].sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
      .slice(0, 50);
    setActivity(combined);

    const ids = Array.from(new Set(
      combined.flatMap((r) => [r.user_id, r.approver_id, r.approved_by]).filter(Boolean)
    ));
    const map: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      (profs || []).forEach((p: any) => { map[p.id] = p.full_name || p.email || "Unknown"; });
    }
    // Profile RLS only lets a regular employee read their own profile, so the
    // query above never resolves their manager's/admin's name for their own
    // requests — this RPC is scoped server-side to just those deciders.
    const { data: deciderNames } = await supabase.rpc("my_request_decider_names");
    if (seq !== activityFetchSeq.current) return;
    (deciderNames || []).forEach((d) => { map[d.user_id] = d.full_name || "Unknown"; });
    setNamesByUser(map);
  };

  const fetchDismissedActivity = async () => {
    if (!user) return;
    const { data } = await supabase.from("activity_dismissals").select("kind, item_id").eq("user_id", user.id);
    setDismissedActivityKeys(new Set((data || []).map((d) => `${d.kind}:${d.item_id}`)));
  };

  useEffect(() => { fetchNotices(); fetchDismissedNotices(); fetchActivity(); fetchDismissedActivity(); }, []);
  useRealtimeSubscription("leave_requests", fetchActivity, "notice-board-leave");
  useRealtimeSubscription("late_time_requests", fetchActivity, "notice-board-late");
  useRealtimeSubscription("manual_time_requests", fetchActivity, "notice-board-manual");
  useRealtimeSubscription("overtime_requests", fetchActivity, "notice-board-ot");

  /**
   * Every decided row shows *who decided it* — admin, manager, and the
   * requester alike (my_request_decider_names() resolves the decider's
   * name for anyone who can see the row: the requester themselves, or
   * whoever can approve it).
   */
  const activityLine = (r: any) => {
    const who = namesByUser[r.user_id] || "Someone";
    const deciderId = r.approver_id || r.approved_by;
    const deciderName = deciderId ? namesByUser[deciderId] : undefined;
    const decidedSuffix = deciderName ? ` by ${deciderName}` : "";
    if (r._kind === "leave") {
      const typeName = leaveTypeNames[r.leave_type_id] || "leave";
      const range = `${r.start_date} → ${r.end_date}`;
      if (r.status === "pending") return `${who} requested ${typeName} (${range})`;
      return `${who}'s ${typeName} request (${range}) was ${r.status}${decidedSuffix}`;
    }
    if (r._kind === "late") {
      const kind = r.request_type === "office_time_change" ? "office time change" : "late adjustment";
      if (r.status === "pending") return `${who} requested a ${kind} for ${r.effective_date}`;
      return `${who}'s ${kind} for ${r.effective_date} was ${r.status}${decidedSuffix}`;
    }
    if (r._kind === "manual") {
      const dateStr = r.date ? format(new Date(r.date), "MMM d") : "";
      if (r.status === "pending") return `${who} submitted a manual time entry for ${dateStr}`;
      return `${who}'s manual time entry for ${dateStr} was ${r.status}${decidedSuffix}`;
    }
    // overtime
    const dateStr = r.date ? format(new Date(r.date), "MMM d") : "";
    if (r.status === "pending") return `${who} requested ${r.requested_hours}h overtime for ${dateStr}`;
    return `${who}'s ${r.requested_hours}h overtime for ${dateStr} was ${r.status}${decidedSuffix}`;
  };

  const activityDate = (r: any): string | null => {
    if (r._kind === "leave") return r.start_date;
    if (r._kind === "late") return r.effective_date;
    return r.date;
  };

  const TYPE_LABELS: Record<string, string> = { leave: "Leave", late: "Late Time", manual: "Manual Entry", ot: "Overtime" };

  /** Archiving here is purely personal (it only hides the entry from your
   * own feed, never anyone else's), so anyone who can see a row at all —
   * already decided by that table's own RLS — can archive/unarchive it for
   * themselves. */
  const canActOnActivity = (_r: { user_id: string }) => true;

  const activityKey = (r: { _kind: string; id: string }) => `${r._kind}:${r.id}`;

  /** Archives/unarchives exactly this one entry for the signed-in user only
   * — never touches the shared row or any other viewer's feed. */
  const setActivityArchived = async (r: { id: string; _kind: string }, archived: boolean) => {
    if (!user) return;
    const { error } = archived
      ? await supabase.from("activity_dismissals").upsert({ user_id: user.id, kind: r._kind, item_id: r.id })
      : await supabase.from("activity_dismissals").delete().eq("user_id", user.id).eq("kind", r._kind).eq("item_id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Entry ${archived ? "archived" : "unarchived"}`);
    setDismissedActivityKeys((prev) => {
      const next = new Set(prev);
      const key = activityKey(r);
      if (archived) next.add(key); else next.delete(key);
      return next;
    });
  };

  const toggleSelectedActivity = (key: string, checked: boolean) => {
    setSelectedActivity((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  };

  const archiveSelectedActivity = async (archived: boolean) => {
    if (selectedActivity.size === 0 || !user) return;
    if (!confirm(`${archived ? "Archive" : "Unarchive"} ${selectedActivity.size} selected ${selectedActivity.size === 1 ? "entry" : "entries"}?`)) return;
    const keys = Array.from(selectedActivity);
    const { error } = archived
      ? await supabase.from("activity_dismissals").upsert(
          keys.map((key) => { const [kind, id] = key.split(":"); return { user_id: user.id, kind, item_id: id }; })
        )
      : await (async () => {
          const results = await Promise.all(keys.map((key) => {
            const [kind, id] = key.split(":");
            return supabase.from("activity_dismissals").delete().eq("user_id", user.id).eq("kind", kind).eq("item_id", id);
          }));
          return { error: results.find((res) => res.error)?.error };
        })();
    if (error) { toast.error(error.message); return; }
    toast.success(`Entries ${archived ? "archived" : "unarchived"}`);
    setDismissedActivityKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => { if (archived) next.add(key); else next.delete(key); });
      return next;
    });
    setSelectedActivity(new Set());
  };

  const toggleArchivedActivityView = () => {
    setShowArchivedActivity((v) => !v);
    setSelectedActivity(new Set());
    setActivityPage(1);
  };

  const employeeOptions = Array.from(new Set(activity.map((r) => r.user_id)))
    .map((id) => ({ id, name: namesByUser[id] || "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filteredActivity = activity.filter((r) => {
    if (dismissedActivityKeys.has(activityKey(r)) !== showArchivedActivity) return false;
    if (filterDate && activityDate(r) !== filterDate) return false;
    if (filterUser !== "all" && r.user_id !== filterUser) return false;
    if (filterType !== "all" && r._kind !== filterType) return false;
    return true;
  });

  const activityPageCount = Math.max(1, Math.ceil(filteredActivity.length / PAGE_SIZE));
  const currentActivityPage = Math.min(activityPage, activityPageCount);
  const pagedActivity = filteredActivity.slice((currentActivityPage - 1) * PAGE_SIZE, currentActivityPage * PAGE_SIZE);

  const clearActivityFilters = () => {
    setFilterDate("");
    setFilterUser("all");
    setFilterType("all");
    setActivityPage(1);
  };

  const create = async () => {
    if (!form.title || !form.body) return toast.error("Title and body required");
    const payload: any = { ...form, author_id: user?.id };
    if (!payload.expires_at) delete payload.expires_at;
    const { error } = await supabase.from("notices").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Notice published");
    setOpen(false);
    setForm(emptyForm);
    fetchNotices();
  };

  const openEdit = (n: { id: string; title: string; body: string; category: string; priority: string; pinned: boolean; expires_at: string | null }) => {
    setEditId(n.id);
    setEditForm({
      title: n.title,
      body: n.body,
      category: n.category,
      priority: n.priority,
      pinned: n.pinned,
      expires_at: n.expires_at ? n.expires_at.slice(0, 16) : "",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editId) return;
    if (!editForm.title || !editForm.body) return toast.error("Title and body required");
    const payload: Record<string, unknown> = { ...editForm };
    payload.expires_at = payload.expires_at || null;
    const { error } = await supabase.from("notices").update(payload).eq("id", editId);
    if (error) return toast.error(error.message);
    toast.success("Notice updated");
    setEditOpen(false);
    setEditId(null);
    fetchNotices();
  };

  /** Archiving a notice only hides it from the signed-in user — it never
   * touches the shared notices row, so it stays visible/active for
   * everyone else (and still counts in the dashboard's active-notices feed). */
  const archive = async (id: string) => {
    if (!user || !confirm("Archive notice?")) return;
    const { error } = await supabase.from("notice_dismissals").upsert({ user_id: user.id, notice_id: id });
    if (error) { toast.error(error.message); return; }
    toast.success("Notice archived");
    setDismissedNoticeIds((prev) => new Set(prev).add(id));
  };

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedNotices((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const archiveSelected = async () => {
    if (selectedNotices.size === 0 || !user) return;
    if (!confirm(`Archive ${selectedNotices.size} selected notice${selectedNotices.size === 1 ? "" : "s"}?`)) return;
    const ids = Array.from(selectedNotices);
    const { error } = await supabase.from("notice_dismissals").upsert(ids.map((id) => ({ user_id: user.id, notice_id: id })));
    if (error) { toast.error(error.message); return; }
    toast.success("Notices archived");
    setDismissedNoticeIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next; });
    setSelectedNotices(new Set());
  };

  const toggleSelectedArchived = (id: string, checked: boolean) => {
    setSelectedArchived((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const unarchive = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("notice_dismissals").delete().eq("user_id", user.id).eq("notice_id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Notice restored");
    setDismissedNoticeIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const unarchiveSelected = async () => {
    if (selectedArchived.size === 0 || !user) return;
    const ids = Array.from(selectedArchived);
    const { error } = await supabase.from("notice_dismissals").delete().eq("user_id", user.id).in("notice_id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success("Notices restored");
    setDismissedNoticeIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    setSelectedArchived(new Set());
  };

  const togglePin = async (n: any) => {
    await supabase.from("notices").update({ pinned: !n.pinned }).eq("id", n.id);
    fetchNotices();
  };

  const toggleArchivedView = () => {
    setShowArchived((v) => !v);
    setPage(1);
  };

  const noticeList = showArchived ? archivedNotices : notices;
  const noticePageCount = Math.max(1, Math.ceil(noticeList.length / PAGE_SIZE));
  const currentNoticePage = Math.min(page, noticePageCount);
  const noticePageItems = noticeList.slice((currentNoticePage - 1) * PAGE_SIZE, currentNoticePage * PAGE_SIZE);
  const selectAllNotices = () => {
    if (showArchived) setSelectedArchived(new Set(noticePageItems.map((n) => n.id)));
    else setSelectedNotices(new Set(noticePageItems.map((n) => n.id)));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Notice Board</h1>
          <p className="text-sm text-muted-foreground">Company announcements and updates.</p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Notice</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Publish Notice</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input value={form.title} onChange={(e)=>setForm({...form, title: e.target.value})} /></div>
                <div><Label>Body</Label><Textarea rows={5} value={form.body} onChange={(e)=>setForm({...form, body: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Category</Label>
                    <Select value={form.category} onValueChange={(v)=>setForm({...form, category: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v)=>setForm({...form, priority: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2"><Switch checked={form.pinned} onCheckedChange={(v)=>setForm({...form, pinned: v})} /><Label>Pin to top</Label></div>
                <div><Label>Expires (optional)</Label><Input type="datetime-local" value={form.expires_at} onChange={(e)=>setForm({...form, expires_at: e.target.value})} /></div>
              </div>
              <DialogFooter><Button onClick={create}>Publish</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Hidden while browsing the Notices archive below so the page shows
          only that archive, not this separate, unrelated Requests Activity
          feed at the same time. */}
      {!showArchived && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Requests Activity</CardTitle>
          <CardDescription>Requests and decisions you're involved in or can approve.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              type="date"
              value={filterDate}
              onChange={(e) => { setFilterDate(e.target.value); setActivityPage(1); }}
              className="w-auto"
            />
            <Select value={filterUser} onValueChange={(v) => { setFilterUser(v); setActivityPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Employee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employeeOptions.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={(v) => { setFilterType(v); setActivityPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(TYPE_LABELS).map(([v, label]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
            {(filterDate || filterUser !== "all" || filterType !== "all") && (
              <Button variant="ghost" size="sm" onClick={clearActivityFilters}>
                Clear filters
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {!showArchivedActivity ? (
                <>
                  <Button variant="outline" size="sm" disabled={selectedActivity.size === 0} onClick={() => archiveSelectedActivity(true)}>
                    <Archive className="h-4 w-4 mr-1" /> Archive Selected{selectedActivity.size > 0 ? ` (${selectedActivity.size})` : ""}
                  </Button>
                  {selectedActivity.size > 0 && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedActivity(new Set(pagedActivity.filter(canActOnActivity).map(activityKey)))}>Select all</Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedActivity(new Set())}>Clear selection</Button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" disabled={selectedActivity.size === 0} onClick={() => archiveSelectedActivity(false)}>
                    <ArchiveRestore className="h-4 w-4 mr-1" /> Unarchive Selected{selectedActivity.size > 0 ? ` (${selectedActivity.size})` : ""}
                  </Button>
                  {selectedActivity.size > 0 && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedActivity(new Set(pagedActivity.filter(canActOnActivity).map(activityKey)))}>Select all</Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedActivity(new Set())}>Clear selection</Button>
                    </>
                  )}
                </>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={toggleArchivedActivityView}>
              {showArchivedActivity ? "Back to Active Activity" : "View Archived Activity"}
            </Button>
          </div>

          {filteredActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {showArchivedActivity ? "No archived activity" : (activity.length === 0 ? "No recent activity" : "No activity matches these filters")}
            </p>
          ) : (
            <>
              {pagedActivity.map((r) => (
                <div key={`${r._kind}-${r.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <div className="flex items-start gap-3 min-w-0">
                    {canActOnActivity(r) && (
                      <Checkbox
                        className="mt-0.5"
                        checked={selectedActivity.has(activityKey(r))}
                        onCheckedChange={(c) => toggleSelectedActivity(activityKey(r), !!c)}
                        aria-label="Select entry"
                      />
                    )}
                    <div className="min-w-0">
                      <span className="truncate block">{activityLine(r)}</span>
                      {r.status === "rejected" && r.approver_note && (
                        <span className="text-xs text-muted-foreground block truncate">Reason: {r.approver_note}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary">{TYPE_LABELS[r._kind]}</Badge>
                    <Badge variant="outline" className="capitalize">{r.status}</Badge>
                    {/* Admin: every row. Manager: rows they approve, never their own (not their own approver).
                        Anyone else: any of their own entries, pending or decided, including leave — archiving
                        isn't destructive the way delete was, so it's not excluded here. */}
                    {canActOnActivity(r) && (
                      showArchivedActivity ? (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setActivityArchived(r, false)} aria-label="Unarchive entry">
                          <ArchiveRestore className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      ) : (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setActivityArchived(r, true)} aria-label="Archive entry">
                          <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {filteredActivity.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" size="sm" disabled={currentActivityPage <= 1} onClick={() => setActivityPage(currentActivityPage - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground whitespace-nowrap">Page {currentActivityPage} of {activityPageCount}</span>
              <Button variant="outline" size="sm" disabled={currentActivityPage >= activityPageCount} onClick={() => setActivityPage(currentActivityPage + 1)}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Hidden while browsing Requests Activity's own archived view so the page
          shows only that archive, not this separate, unrelated Notices archive
          at the same time. */}
      {!showArchivedActivity && (
      <>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {!showArchived ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={selectedNotices.size === 0}
                onClick={archiveSelected}
              >
                <Archive className="h-4 w-4 mr-1" /> Archive Selected{selectedNotices.size > 0 ? ` (${selectedNotices.size})` : ""}
              </Button>
              {selectedNotices.size > 0 && (
                <>
                  <Button variant="ghost" size="sm" onClick={selectAllNotices}>Select all</Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedNotices(new Set())}>Clear selection</Button>
                </>
              )}
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={selectedArchived.size === 0}
                onClick={unarchiveSelected}
              >
                <ArchiveRestore className="h-4 w-4 mr-1" /> Unarchive Selected{selectedArchived.size > 0 ? ` (${selectedArchived.size})` : ""}
              </Button>
              {selectedArchived.size > 0 && (
                <>
                  <Button variant="ghost" size="sm" onClick={selectAllNotices}>Select all</Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedArchived(new Set())}>Clear selection</Button>
                </>
              )}
            </>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={toggleArchivedView}>
          {showArchived ? "Back to Active Notices" : "View Archived Notices"}
        </Button>
      </div>

      {(() => {
        const list = showArchived ? archivedNotices : notices;
        const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        const currentPage = Math.min(page, pageCount);
        const pageItems = list.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
        return (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {list.length === 0 ? (
                <Card className="md:col-span-2">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    {showArchived ? "No archived notices" : "No notices posted yet"}
                  </CardContent>
                </Card>
              ) : pageItems.map(n => {
                const pri = PRIORITIES.find(p => p.v === n.priority);
                return (
                  <Card key={n.id} className={n.pinned ? "border-primary border-2" : ""}>
                    <CardHeader>
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 flex items-start gap-2">
                          <Checkbox
                            className="mt-1"
                            checked={showArchived ? selectedArchived.has(n.id) : selectedNotices.has(n.id)}
                            onCheckedChange={(c) => showArchived ? toggleSelectedArchived(n.id, !!c) : toggleSelected(n.id, !!c)}
                            aria-label="Select notice"
                          />
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              {n.pinned && <Pin className="h-4 w-4 text-primary fill-primary" />}
                              {n.title}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              <Badge variant="outline" className="mr-1">{n.category}</Badge>
                              <Badge className={pri?.color}>{pri?.label}</Badge>
                              <span className="ml-2 text-xs">{format(new Date(n.published_at), "MMM d, yyyy 'at' HH:mm")}</span>
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {!showArchived && canManage && (
                            <>
                              <Button size="icon" variant="ghost" onClick={()=>togglePin(n)}><Pin className={`h-4 w-4 ${n.pinned ? "fill-primary text-primary" : ""}`} /></Button>
                              <Button size="icon" variant="ghost" onClick={()=>openEdit(n)} aria-label="Edit notice"><Pencil className="h-4 w-4 text-muted-foreground" /></Button>
                            </>
                          )}
                          {showArchived ? (
                            <Button size="icon" variant="ghost" onClick={()=>unarchive(n.id)} aria-label="Unarchive notice"><ArchiveRestore className="h-4 w-4 text-muted-foreground" /></Button>
                          ) : (
                            <Button size="icon" variant="ghost" onClick={()=>archive(n.id)} aria-label="Archive notice"><Archive className="h-4 w-4 text-muted-foreground" /></Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {list.length > PAGE_SIZE && (
              <div className="flex items-center justify-center gap-3">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">Page {currentPage} of {pageCount}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        );
      })()}
      </>
      )}

      {/* Edit Notice Dialog (admin only) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Notice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={editForm.title} onChange={(e)=>setEditForm({...editForm, title: e.target.value})} /></div>
            <div><Label>Body</Label><Textarea rows={5} value={editForm.body} onChange={(e)=>setEditForm({...editForm, body: e.target.value})} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Category</Label>
                <Select value={editForm.category} onValueChange={(v)=>setEditForm({...editForm, category: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Priority</Label>
                <Select value={editForm.priority} onValueChange={(v)=>setEditForm({...editForm, priority: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map(p => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={editForm.pinned} onCheckedChange={(v)=>setEditForm({...editForm, pinned: v})} /><Label>Pin to top</Label></div>
            <div><Label>Expires (optional)</Label><Input type="datetime-local" value={editForm.expires_at} onChange={(e)=>setEditForm({...editForm, expires_at: e.target.value})} /></div>
          </div>
          <DialogFooter><Button onClick={saveEdit}>Save Changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NoticeBoard;
