import { useEffect, useState } from "react";
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
import { Megaphone, Pin, Plus, Trash2, CalendarClock } from "lucide-react";
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

const NoticeBoard = () => {
  const { user, role } = useAuth();
  const canManage = role === "admin";
  const [notices, setNotices] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", category: "general", priority: "normal", pinned: false, expires_at: "" });

  const [activity, setActivity] = useState<any[]>([]);
  const [namesByUser, setNamesByUser] = useState<Record<string, string>>({});
  const [rolesByUser, setRolesByUser] = useState<Record<string, string>>({});
  const [leaveTypeNames, setLeaveTypeNames] = useState<Record<string, string>>({});

  const fetchNotices = async () => {
    const { data } = await supabase.from("notices").select("*").eq("is_active", true).order("pinned", { ascending: false }).order("published_at", { ascending: false });
    setNotices(data || []);
  };

  /**
   * Leave / late-time request + approval activity, sourced straight from
   * those tables — visibility is whatever their own RLS already allows
   * (own requests, plus anything the viewer's role can approve), so an
   * employee's request only surfaces to their manager/admin, and a
   * manager's own request only surfaces to admin.
   */
  const fetchActivity = async () => {
    const [{ data: leaveReqs }, { data: lateReqs }, { data: leaveTypes }] = await Promise.all([
      supabase.from("leave_requests").select("*").order("updated_at", { ascending: false }).limit(20),
      supabase.from("late_time_requests").select("*").order("updated_at", { ascending: false }).limit(20),
      supabase.from("leave_types").select("id, name"),
    ]);
    const ltNames: Record<string, string> = {};
    (leaveTypes || []).forEach((lt: { id: string; name: string }) => { ltNames[lt.id] = lt.name; });
    setLeaveTypeNames(ltNames);

    const combined = [
      ...(leaveReqs || []).map((r: any) => ({ ...r, _kind: "leave" as const })),
      ...(lateReqs || []).map((r: any) => ({ ...r, _kind: "late" as const })),
    ].sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
      .slice(0, 20);
    setActivity(combined);

    const ids = Array.from(new Set(
      combined.flatMap((r) => [r.user_id, r.approver_id, r.approved_by]).filter(Boolean)
    ));
    if (ids.length) {
      const [{ data: profs }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").in("id", ids),
        supabase.rpc("role_labels_for", { _user_ids: ids }),
      ]);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => { map[p.id] = p.full_name || p.email || "Unknown"; });
      setNamesByUser(map);
      const roleMap: Record<string, string> = {};
      (roles || []).forEach((r: any) => { roleMap[r.user_id] = r.role; });
      setRolesByUser(roleMap);
    }
  };

  useEffect(() => { fetchNotices(); fetchActivity(); }, []);
  useRealtimeSubscription("leave_requests", fetchActivity, "notice-board-leave");
  useRealtimeSubscription("late_time_requests", fetchActivity, "notice-board-late");

  /**
   * Own request (viewer === requester) shows *who decided it* (their
   * manager or admin — the role, since that's what matters to an
   * employee, not the individual's name). Viewing someone else's request
   * (a manager/admin looking at their team) shows whose request it is
   * instead — the "by ..." decider suffix is dropped since it's not
   * useful there (you already know who you or your peers are).
   */
  const activityLine = (r: any) => {
    const who = namesByUser[r.user_id] || "Someone";
    const isOwn = !!user && r.user_id === user.id;
    const deciderId = r.approver_id || r.approved_by;
    const deciderRole = deciderId ? rolesByUser[deciderId] : undefined;
    const decidedSuffix = isOwn && deciderRole
      ? ` by ${deciderRole === "admin" ? "Admin" : deciderRole === "manager" ? "Manager" : deciderRole}`
      : "";
    if (r._kind === "leave") {
      const typeName = leaveTypeNames[r.leave_type_id] || "leave";
      const range = `${r.start_date} → ${r.end_date}`;
      if (r.status === "pending") return `${who} requested ${typeName} (${range})`;
      return `${who}'s ${typeName} request (${range}) was ${r.status}${decidedSuffix}`;
    }
    const kind = r.request_type === "office_time_change" ? "office time change" : "late adjustment";
    if (r.status === "pending") return `${who} requested a ${kind} for ${r.effective_date}`;
    return `${who}'s ${kind} for ${r.effective_date} was ${r.status}${decidedSuffix}`;
  };

  const create = async () => {
    if (!form.title || !form.body) return toast.error("Title and body required");
    const payload: any = { ...form, author_id: user?.id };
    if (!payload.expires_at) delete payload.expires_at;
    const { error } = await supabase.from("notices").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Notice published");
    setOpen(false);
    setForm({ title: "", body: "", category: "general", priority: "normal", pinned: false, expires_at: "" });
    fetchNotices();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete notice?")) return;
    await supabase.from("notices").update({ is_active: false }).eq("id", id);
    fetchNotices();
  };

  const togglePin = async (n: any) => {
    await supabase.from("notices").update({ pinned: !n.pinned }).eq("id", n.id);
    fetchNotices();
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Leave & Late Time Activity</CardTitle>
          <CardDescription>Requests and decisions you're involved in or can approve.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
          ) : activity.map((r) => (
            <div key={`${r._kind}-${r.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <span>{activityLine(r)}</span>
              <Badge variant="outline" className="shrink-0 capitalize">{r.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {notices.length === 0 ? (
          <Card className="md:col-span-2"><CardContent className="py-12 text-center text-muted-foreground"><Megaphone className="h-12 w-12 mx-auto mb-3 opacity-40" />No notices posted yet</CardContent></Card>
        ) : notices.map(n => {
          const pri = PRIORITIES.find(p => p.v === n.priority);
          return (
            <Card key={n.id} className={n.pinned ? "border-primary border-2" : ""}>
              <CardHeader>
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1">
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
                  {canManage && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={()=>togglePin(n)}><Pin className={`h-4 w-4 ${n.pinned ? "fill-primary text-primary" : ""}`} /></Button>
                      <Button size="icon" variant="ghost" onClick={()=>remove(n.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{n.body}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default NoticeBoard;
