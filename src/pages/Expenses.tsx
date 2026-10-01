import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Receipt, Plus, Check, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { notifyManagersAndAdmins, notifyEmployee } from "@/lib/notifications";

const FALLBACK_CATEGORIES = ["Travel", "Meals", "Office Supplies", "Software", "Training", "Client Entertainment", "Other"];

const DIRECTIONS = [
  { value: "company_pays_employee", label: "Company Pays Employee" },
  { value: "employee_owes_company", label: "Employee Owes Company" },
];

const Expenses = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const canApprove = role === "admin" || role === "manager";
  const [claims, setClaims] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [newCategory, setNewCategory] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: "Travel", amount: "", claim_date: format(new Date(), "yyyy-MM-dd"), description: "", receipt_url: "",
    direction: "company_pays_employee",
  });
  const [uploading, setUploading] = useState(false);

  const fetchClaims = async () => {
    const { data, error } = await supabase.from("expense_claims").select("*, profiles!expense_claims_user_id_fkey(full_name,email,photo_url)").order("created_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    setClaims(data || []);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from("expense_types").select("name").order("created_at", { ascending: true });
    if (data && data.length > 0) setCategories(data.map((d) => d.name));
  };

  useEffect(() => { fetchClaims(); fetchCategories(); }, []);

  const addCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    const { error } = await supabase.from("expense_types").insert({ name });
    if (error) { toast.error(error.message); return; }
    toast.success("Expense type added");
    setNewCategory("");
    fetchCategories();
  };

  const uploadReceipt = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("task-attachments").upload(path, file);
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = await supabase.storage.from("task-attachments").createSignedUrl(path, 60 * 60 * 24 * 365);
    setForm(f => ({ ...f, receipt_url: data?.signedUrl || "" }));
    setUploading(false);
  };

  const submit = async () => {
    if (!form.amount) return toast.error("Amount required");
    const amount = Number(form.amount);
    const { data: inserted, error } = await supabase.from("expense_claims").insert({
      user_id: user?.id,
      category: form.category,
      amount,
      claim_date: form.claim_date,
      description: form.description,
      receipt_url: form.receipt_url || null,
      direction: form.direction,
      recoverable_total: form.direction === "employee_owes_company" ? amount : null,
    }).select().single();
    if (error) return toast.error(error.message);
    toast.success("Expense submitted");
    setOpen(false);
    setForm({ category: "Travel", amount: "", claim_date: format(new Date(), "yyyy-MM-dd"), description: "", receipt_url: "", direction: "company_pays_employee" });
    await notifyManagersAndAdmins(
      "Expense Claim Submitted",
      `${user?.email} submitted a ${form.category} claim for ${form.amount}.`,
      inserted?.id,
      { route: "/expenses", type: "expense_claim", requesterId: user?.id },
    );
    fetchClaims();
  };

  const decide = async (id: string, status: "approved" | "rejected") => {
    const claim = claims.find((c) => c.id === id);
    const { error } = await supabase.from("expense_claims").update({ status, approver_id: user?.id, approved_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Claim ${status}`);
    if (claim) {
      await notifyEmployee(
        claim.user_id,
        `Expense Claim ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        `Your ${claim.category} claim for ${claim.amount} was ${status}.`,
        id,
        { route: "/expenses", type: "expense_claim_update" },
      );
    }
    fetchClaims();
  };

  const markPaid = async (id: string) => {
    const { error } = await supabase.from("expense_claims").update({
      payment_status: "paid", paid_date: format(new Date(), "yyyy-MM-dd"),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Marked paid");
    fetchClaims();
  };

  const myClaims = claims.filter(c => c.user_id === user?.id);
  const pendingApprovals = claims.filter(c => c.status === "pending" && c.user_id !== user?.id);
  const allOthers = claims.filter(c => c.user_id !== user?.id);

  const totals = categories.map(cat => ({
    cat,
    total: claims.filter(c => c.category === cat && c.status === "approved").reduce((s,c)=>s+Number(c.amount), 0)
  })).filter(t => t.total > 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Expense Claims</h1>
          <p className="text-sm text-muted-foreground">Submit and track reimbursement requests.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />New Claim</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Submit Expense Claim</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={(v)=>setForm({...form, category: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Direction</Label>
                <Select value={form.direction} onValueChange={(v)=>setForm({...form, direction: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIRECTIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={(e)=>setForm({...form, amount: e.target.value})} /></div>
                <div><Label>Date</Label><Input type="date" value={form.claim_date} onChange={(e)=>setForm({...form, claim_date: e.target.value})} /></div>
              </div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e)=>setForm({...form, description: e.target.value})} /></div>
              <div>
                <Label>Receipt</Label>
                <Input type="file" accept="image/*,application/pdf" onChange={(e)=>e.target.files?.[0] && uploadReceipt(e.target.files[0])} disabled={uploading} />
                {form.receipt_url && <a className="text-xs text-primary underline" href={form.receipt_url} target="_blank" rel="noreferrer">View attached</a>}
              </div>
            </div>
            <DialogFooter><Button onClick={submit} disabled={uploading}>{uploading ? "Uploading..." : "Submit"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2">
          <Input className="max-w-[220px]" placeholder="New expense type" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          <Button size="sm" variant="outline" onClick={addCategory}>Add Expense Type</Button>
        </div>
      )}

      {totals.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {totals.map(t => (
            <Card key={t.cat}><CardHeader className="pb-2"><CardDescription>{t.cat}</CardDescription><CardTitle>{t.total.toLocaleString()}</CardTitle></CardHeader></Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">My Claims</TabsTrigger>
          {canApprove && <TabsTrigger value="pending">Pending Approval ({pendingApprovals.length})</TabsTrigger>}
          {canApprove && <TabsTrigger value="all">Team History</TabsTrigger>}
        </TabsList>

        <TabsContent value="mine">
          <ClaimTable claims={myClaims} showEmployee={false} isAdmin={isAdmin} onTogglePaid={markPaid} />
        </TabsContent>
        {canApprove && (
          <TabsContent value="pending">
            <ClaimTable claims={pendingApprovals} showEmployee onApprove={(id)=>decide(id,"approved")} onReject={(id)=>decide(id,"rejected")} isAdmin={isAdmin} onTogglePaid={markPaid} />
          </TabsContent>
        )}
        {canApprove && (
          <TabsContent value="all">
            <ClaimTable claims={allOthers} showEmployee isAdmin={isAdmin} onTogglePaid={markPaid} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

const ClaimTable = ({ claims, showEmployee, onApprove, onReject, onTogglePaid, isAdmin }: any) => (
  <Card>
    <CardContent className="pt-6">
      <Table>
        <TableHeader>
          <TableRow>
            {showEmployee && <TableHead>Employee</TableHead>}
            <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Direction</TableHead><TableHead>Amount</TableHead><TableHead>Description</TableHead><TableHead>Receipt</TableHead><TableHead>Status</TableHead>
            {(onApprove || onReject) && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.length === 0 ? <TableRow><TableCell colSpan={showEmployee ? 9 : 8} className="text-center text-muted-foreground">No claims</TableCell></TableRow> :
            claims.map((c: any) => (
              <TableRow key={c.id}>
                {showEmployee && <TableCell>{c.profiles?.full_name || c.profiles?.email || "—"}</TableCell>}
                <TableCell>{format(new Date(c.claim_date), "MMM d, yyyy")}</TableCell>
                <TableCell><Badge variant="outline">{c.category}</Badge></TableCell>
                <TableCell>
                  {c.direction === "employee_owes_company" ? (
                    <Badge variant="outline">Employee Owes</Badge>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Badge className={c.payment_status === "paid" ? "bg-success text-white" : ""} variant={c.payment_status === "paid" ? undefined : "outline"}>{c.payment_status === "paid" ? "Paid" : "Not Paid"}</Badge>
                      {isAdmin && c.payment_status !== "paid" && (
                        <Button size="sm" variant="ghost" onClick={() => onTogglePaid?.(c.id)}>Mark Paid</Button>
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-semibold">{Number(c.amount).toLocaleString()}</TableCell>
                <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">{c.description || "—"}</TableCell>
                <TableCell>{c.receipt_url ? <a href={c.receipt_url} target="_blank" rel="noreferrer" className="text-primary"><FileText className="h-4 w-4 inline" /></a> : "—"}</TableCell>
                <TableCell>
                  <Badge className={c.status === "approved" ? "bg-success text-white" : c.status === "rejected" ? "bg-destructive text-white" : ""} variant={c.status === "pending" ? "outline" : undefined}>{c.status}</Badge>
                </TableCell>
                {(onApprove || onReject) && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="outline" onClick={()=>onApprove?.(c.id)}><Check className="h-4 w-4 text-success" /></Button>
                      <Button size="icon" variant="outline" onClick={()=>onReject?.(c.id)}><X className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);

export default Expenses;
