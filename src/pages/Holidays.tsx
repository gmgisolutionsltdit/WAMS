import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Calendar, Plus, Trash2, Upload } from "lucide-react";
import { format } from "date-fns";

const Holidays = () => {
  const { role } = useAuth();
  const [holidays, setHolidays] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [form, setForm] = useState({ name: "", start_date: "", end_date: "", wing: "ALL" });
  const [bulkText, setBulkText] = useState("");

  const fetchHolidays = useCallback(async () => {
    const { data } = await supabase.from("holidays").select("*").order("holiday_date");
    setHolidays(data || []);
  }, []);

  useEffect(() => { fetchHolidays(); }, [fetchHolidays]);

  if (role !== "admin") {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Only Admins can manage holidays.</p>
      </CardContent></Card>
    );
  }

  const handleAdd = async () => {
    if (!form.name || !form.start_date) { toast.error("Name and start date required"); return; }
    const endDate = form.end_date || form.start_date;
    if (endDate < form.start_date) { toast.error("End date can't be before start date"); return; }

    const rows: any[] = [];
    for (let d = new Date(form.start_date + "T00:00:00"); d <= new Date(endDate + "T00:00:00"); d.setDate(d.getDate() + 1)) {
      rows.push({
        name: form.name,
        holiday_date: format(d, "yyyy-MM-dd"),
        wing: form.wing === "ALL" ? null : (form.wing as "GMGI" | "MORU"),
      });
    }

    const { error } = await supabase.from("holidays").insert(rows);
    if (error) toast.error(error.message);
    else {
      toast.success(rows.length > 1 ? `Holiday added for ${rows.length} days` : "Holiday added");
      setOpen(false);
      setForm({ name: "", start_date: "", end_date: "", wing: "ALL" });
      fetchHolidays();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); fetchHolidays(); }
  };

  const handleBulk = async () => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    const rows: any[] = [];
    for (const line of lines) {
      // CSV: date,name[,wing]
      const [d, n, w] = line.split(",").map((s) => s?.trim());
      if (!d || !n) continue;
      rows.push({
        holiday_date: d,
        name: n,
        wing: w === "GMGI" || w === "MORU" ? w : null,
      });
    }
    if (!rows.length) { toast.error("No valid rows. Use: YYYY-MM-DD,Name,GMGI|MORU"); return; }
    const { error } = await supabase.from("holidays").insert(rows);
    if (error) toast.error(error.message);
    else { toast.success(`Added ${rows.length} holidays`); setBulkOpen(false); setBulkText(""); fetchHolidays(); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" /> Holidays</CardTitle>
        <div className="flex gap-2">
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><Upload className="mr-1 h-4 w-4" /> Bulk Upload</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Bulk Upload Holidays</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">One per line: <code>YYYY-MM-DD,Holiday Name,GMGI|MORU</code> (wing optional, leave blank for all wings)</p>
                <Textarea rows={10} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={"2026-12-25,Christmas\n2026-01-01,New Year,GMGI"} />
                <Button className="w-full" onClick={handleBulk}>Upload</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" /> Add Holiday</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Holiday</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start Date</Label>
                    <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
                  </div>
                  <div>
                    <Label>End Date <span className="text-xs text-muted-foreground">(optional)</span></Label>
                    <Input type="date" value={form.end_date} min={form.start_date || undefined} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Leave End Date blank for a single-day holiday. A range creates one entry per day.</p>
                <div>
                  <Label>Wing</Label>
                  <Select value={form.wing} onValueChange={(v) => setForm((f) => ({ ...f, wing: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Wings</SelectItem>
                      <SelectItem value="GMGI">GMGI</SelectItem>
                      <SelectItem value="MORU">MORU</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={handleAdd}>Add</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Wing</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holidays.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No holidays declared</TableCell></TableRow>
            ) : holidays.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{format(new Date(h.holiday_date), "EEE, MMM d, yyyy")}</TableCell>
                <TableCell className="font-medium">{h.name}</TableCell>
                <TableCell><Badge variant={h.wing ? "secondary" : "outline"}>{h.wing || "All"}</Badge></TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(h.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default Holidays;
