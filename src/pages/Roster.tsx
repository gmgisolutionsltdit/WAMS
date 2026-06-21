import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Clock, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { format, startOfWeek, addDays } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

interface Shift {
  id: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  grace_period_minutes: number;
  work_days: number[];
  color: string;
  description: string | null;
  is_active: boolean;
}

interface Assignment {
  id: string;
  user_id: string;
  shift_id: string;
  effective_date: string;
  end_date: string | null;
  profiles?: { full_name: string | null; email: string | null } | null;
  shifts_roster?: { shift_name: string; color: string } | null;
}

const Roster = () => {
  const { user, role } = useAuth();
  const canManage = role === "admin" || role === "hr";
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    shift_name: "", start_time: "09:00", end_time: "18:00",
    grace_period_minutes: 10, work_days: [1,2,3,4,5], color: "#2563EB", description: ""
  });
  const [assignForm, setAssignForm] = useState({ user_id: "", shift_id: "", effective_date: format(new Date(), "yyyy-MM-dd"), end_date: "" });
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));

  const fetchAll = async () => {
    const [s, a, e] = await Promise.all([
      supabase.from("shifts_roster").select("*").order("start_time"),
      supabase.from("employee_shift_assignments").select("*, profiles!employee_shift_assignments_user_id_fkey(full_name,email), shifts_roster(shift_name,color)").order("effective_date", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email").order("full_name"),
    ]);
    setShifts((s.data || []) as Shift[]);
    setAssignments((a.data || []) as any);
    setEmployees(e.data || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const createShift = async () => {
    if (!shiftForm.shift_name) return toast.error("Shift name required");
    const { error } = await supabase.from("shifts_roster").insert({ ...shiftForm, created_by: user?.id });
    if (error) return toast.error(error.message);
    toast.success("Shift created");
    setShiftOpen(false);
    setShiftForm({ shift_name: "", start_time: "09:00", end_time: "18:00", grace_period_minutes: 10, work_days: [1,2,3,4,5], color: "#2563EB", description: "" });
    fetchAll();
  };

  const deleteShift = async (id: string) => {
    if (!confirm("Delete this shift?")) return;
    const { error } = await supabase.from("shifts_roster").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Shift deleted");
    fetchAll();
  };

  const createAssignment = async () => {
    if (!assignForm.user_id || !assignForm.shift_id) return toast.error("Select employee and shift");
    const payload: any = { ...assignForm, created_by: user?.id };
    if (!payload.end_date) delete payload.end_date;
    const { error } = await supabase.from("employee_shift_assignments").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Assignment created");
    setAssignOpen(false);
    setAssignForm({ user_id: "", shift_id: "", effective_date: format(new Date(), "yyyy-MM-dd"), end_date: "" });
    fetchAll();
  };

  const deleteAssignment = async (id: string) => {
    if (!confirm("Remove assignment?")) return;
    await supabase.from("employee_shift_assignments").delete().eq("id", id);
    fetchAll();
  };

  const toggleDay = (d: number) => {
    setShiftForm((f) => ({ ...f, work_days: f.work_days.includes(d) ? f.work_days.filter(x=>x!==d) : [...f.work_days, d].sort() }));
  };

  // weekly grid: map user_id → shift per day
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const assignmentForUserDay = (userId: string, day: Date) => {
    const dayDow = day.getDay();
    return assignments.find(a => {
      if (a.user_id !== userId) return false;
      const eff = new Date(a.effective_date);
      const end = a.end_date ? new Date(a.end_date) : null;
      if (day < eff) return false;
      if (end && day > end) return false;
      const shift = shifts.find(s => s.id === a.shift_id);
      if (!shift) return false;
      return shift.work_days.includes(dayDow);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Shifts & Roster</h1>
          <p className="text-sm text-muted-foreground">Schedule and assign multi-shift rosters across the team.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
              <DialogTrigger asChild><Button variant="outline"><Plus className="h-4 w-4 mr-1" />New Shift</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Shift</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Shift Name</Label><Input value={shiftForm.shift_name} onChange={(e)=>setShiftForm({...shiftForm, shift_name: e.target.value})} placeholder="Morning Shift" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Start Time</Label><Input type="time" value={shiftForm.start_time} onChange={(e)=>setShiftForm({...shiftForm, start_time: e.target.value})} /></div>
                    <div><Label>End Time</Label><Input type="time" value={shiftForm.end_time} onChange={(e)=>setShiftForm({...shiftForm, end_time: e.target.value})} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Grace (mins)</Label><Input type="number" value={shiftForm.grace_period_minutes} onChange={(e)=>setShiftForm({...shiftForm, grace_period_minutes: Number(e.target.value)})} /></div>
                    <div><Label>Color</Label><Input type="color" value={shiftForm.color} onChange={(e)=>setShiftForm({...shiftForm, color: e.target.value})} /></div>
                  </div>
                  <div>
                    <Label>Work Days</Label>
                    <div className="flex gap-1 mt-1">
                      {DAYS.map((d, i) => (
                        <Button key={i} type="button" size="sm" variant={shiftForm.work_days.includes(i) ? "default" : "outline"} onClick={()=>toggleDay(i)}>{d}</Button>
                      ))}
                    </div>
                  </div>
                  <div><Label>Description</Label><Textarea value={shiftForm.description} onChange={(e)=>setShiftForm({...shiftForm, description: e.target.value})} /></div>
                </div>
                <DialogFooter><Button onClick={createShift}>Create</Button></DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
              <DialogTrigger asChild><Button><Users className="h-4 w-4 mr-1" />Assign</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Assign Employee to Shift</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Employee</Label>
                    <Select value={assignForm.user_id} onValueChange={(v)=>setAssignForm({...assignForm, user_id: v})}>
                      <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                      <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name || e.email}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Shift</Label>
                    <Select value={assignForm.shift_id} onValueChange={(v)=>setAssignForm({...assignForm, shift_id: v})}>
                      <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                      <SelectContent>{shifts.map(s => <SelectItem key={s.id} value={s.id}>{s.shift_name} ({s.start_time}–{s.end_time})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Effective Date</Label><Input type="date" value={assignForm.effective_date} onChange={(e)=>setAssignForm({...assignForm, effective_date: e.target.value})} /></div>
                    <div><Label>End Date (optional)</Label><Input type="date" value={assignForm.end_date} onChange={(e)=>setAssignForm({...assignForm, end_date: e.target.value})} /></div>
                  </div>
                </div>
                <DialogFooter><Button onClick={createAssignment}>Assign</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />Defined Shifts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Time</TableHead><TableHead>Grace</TableHead><TableHead>Days</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No shifts defined yet</TableCell></TableRow> :
                shifts.map(s => (
                  <TableRow key={s.id}>
                    <TableCell><span className="inline-flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{background: s.color}} />{s.shift_name}</span></TableCell>
                    <TableCell>{s.start_time}–{s.end_time}</TableCell>
                    <TableCell>{s.grace_period_minutes}m</TableCell>
                    <TableCell><div className="flex gap-1">{s.work_days.map(d => <Badge key={d} variant="outline" className="text-xs">{DAYS[d]}</Badge>)}</div></TableCell>
                    <TableCell>{canManage && <Button size="icon" variant="ghost" onClick={()=>deleteShift(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><CalendarIcon className="h-5 w-5 text-primary" />Weekly Roster</CardTitle>
            <CardDescription>Week of {format(weekStart, "MMM d, yyyy")}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={()=>setWeekStart(addDays(weekStart, -7))}>Prev</Button>
            <Button variant="outline" size="sm" onClick={()=>setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}>This Week</Button>
            <Button variant="outline" size="sm" onClick={()=>setWeekStart(addDays(weekStart, 7))}>Next</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Employee</TableHead>
                {weekDays.map((d,i) => <TableHead key={i} className="text-center text-xs">{format(d,"EEE d")}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.slice(0, 50).map(emp => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium text-sm">{emp.full_name || emp.email}</TableCell>
                  {weekDays.map((d, i) => {
                    const a = assignmentForUserDay(emp.id, d);
                    const shift = a ? shifts.find(s => s.id === a.shift_id) : null;
                    return (
                      <TableCell key={i} className="text-center">
                        {shift ? (
                          <Badge className="text-xs" style={{background: shift.color, color: "white"}}>{shift.shift_name}</Badge>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>All Assignments</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Shift</TableHead><TableHead>From</TableHead><TableHead>Until</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {assignments.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No assignments</TableCell></TableRow> :
                assignments.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>{a.profiles?.full_name || a.profiles?.email || "—"}</TableCell>
                    <TableCell><Badge style={{background: a.shifts_roster?.color, color:"white"}}>{a.shifts_roster?.shift_name}</Badge></TableCell>
                    <TableCell>{format(new Date(a.effective_date), "MMM d, yyyy")}</TableCell>
                    <TableCell>{a.end_date ? format(new Date(a.end_date), "MMM d, yyyy") : "Open-ended"}</TableCell>
                    <TableCell>{canManage && <Button size="icon" variant="ghost" onClick={()=>deleteAssignment(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Roster;
