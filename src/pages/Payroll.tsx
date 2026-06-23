import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, Wallet, Download, FileText, Plus, Calculator } from "lucide-react";
import {
  MONTHS,
  fmtMoney,
  computePayroll,
  computeGratuity,
  downloadPayslipPDF,
  type PayrollProfile,
  type PayrollComputation,
} from "@/lib/payroll";
import { PayrollProcessor } from "@/components/hrms/PayrollProcessor";
import { PayslipCard } from "@/components/hrms/PayslipCard";
import { LoanLedger } from "@/components/hrms/LoanLedger";

type PayrollRecord = PayrollComputation & { id: string; status: string; generated_at: string };

const now = new Date();
const DEFAULT_MONTH = now.getMonth() + 1;
const DEFAULT_YEAR = now.getFullYear();

export default function Payroll() {
  const { user, role } = useAuth();
  const canAccess = role === "admin" || role === "hr" || role === "executive";

  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [month, setMonth] = useState<number>(DEFAULT_MONTH);
  const [currency, setCurrency] = useState<string>("BDT");
  const [profiles, setProfiles] = useState<PayrollProfile[]>([]);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [payslipFor, setPayslipFor] = useState<{ profile: PayrollProfile; record: PayrollRecord } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: settings }, { data: profs, error: pErr }, { data: recs, error: rErr }] = await Promise.all([
        supabase.from("settings").select("currency").limit(1).maybeSingle(),
        supabase.from("profiles").select("id, full_name, email, designation, department, company_wing, joining_date, base_salary, hourly_overtime_rate, pf_contribution_pct, employee_status").order("full_name"),
        supabase.from("payroll_records").select("*").eq("period_year", year).eq("period_month", month),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      if (settings?.currency) setCurrency(settings.currency);
      setProfiles((profs || []) as PayrollProfile[]);
      setRecords((recs || []) as unknown as PayrollRecord[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load payroll data";
      toast({ title: "Load failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { if (canAccess) fetchAll(); }, [fetchAll, canAccess]);

  const recordByUser = useMemo(() => {
    const m = new Map<string, PayrollRecord>();
    records.forEach((r) => m.set(r.user_id, r));
    return m;
  }, [records]);

  const totalPayout = useMemo(
    () => records.reduce((s, r) => s + Number(r.net_pay || 0), 0),
    [records],
  );
  const totalGross = useMemo(
    () => records.reduce((s, r) => s + Number(r.gross_pay || 0), 0),
    [records],
  );
  const totalPF = useMemo(
    () => records.reduce((s, r) => s + Number(r.pf_employee || 0) + Number(r.pf_employer || 0), 0),
    [records],
  );
  const activeProfiles = useMemo(
    () => profiles.filter((p) => p.employee_status === "Active"),
    [profiles],
  );

  const handleGenerateAll = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const eligible = activeProfiles.filter((p) => Number(p.base_salary) > 0);
      if (eligible.length === 0) {
        toast({ title: "Nothing to process", description: "No active employees have a base salary set." });
        return;
      }
      let created = 0; let skipped = 0;
      for (const profile of eligible) {
        if (recordByUser.has(profile.id)) { skipped++; continue; }
        const calc = await computePayroll(profile, year, month, currency);
        const { error } = await supabase.from("payroll_records").insert({
          ...calc,
          generated_by: user.id,
          status: "processed",
        });
        if (error) throw error;
        created++;
      }
      toast({
        title: "Payroll generated",
        description: `${created} created, ${skipped} already existed for ${MONTHS[month - 1]} ${year}.`,
      });
      await fetchAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate payroll";
      toast({ title: "Generation failed", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateOne = async (profile: PayrollProfile) => {
    if (!user) return;
    if (Number(profile.base_salary) <= 0) {
      toast({ title: "Missing salary", description: `Set base salary for ${profile.full_name || profile.email} first.`, variant: "destructive" });
      return;
    }
    try {
      const calc = await computePayroll(profile, year, month, currency);
      const existing = recordByUser.get(profile.id);
      if (existing) {
        const { error } = await supabase.from("payroll_records").update({ ...calc, generated_by: user.id, status: "processed" }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payroll_records").insert({ ...calc, generated_by: user.id, status: "processed" });
        if (error) throw error;
      }
      toast({ title: "Payroll updated", description: `${profile.full_name || profile.email} processed.` });
      await fetchAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast({ title: "Failed", description: msg, variant: "destructive" });
    }
  };

  if (!canAccess) {
    return (
      <div className="p-6 text-sm text-muted-foreground">You do not have access to Payroll.</div>
    );
  }

  return (
    <div className="space-y-6">
      <PayrollProcessor />
      <div className="grid gap-4 lg:grid-cols-2">
        <PayslipCard />
        <LoanLedger />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6" /> Payroll & Incentives</h1>
          <p className="text-sm text-muted-foreground">Process monthly salaries, manage incentives, and generate payslips.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs">Month</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Year</Label>
            <Input type="number" className="w-[100px]" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
          <div>
            <Label className="text-xs">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BDT">BDT ৳</SelectItem>
                <SelectItem value="USD">USD $</SelectItem>
                <SelectItem value="EUR">EUR €</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateAll} disabled={generating || loading}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Generate Monthly Payroll
          </Button>
        </div>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total Net Payout</CardDescription><CardTitle className="text-2xl">{fmtMoney(totalPayout, currency)}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">{records.length} processed records</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Gross Pay</CardDescription><CardTitle className="text-2xl">{fmtMoney(totalGross, currency)}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Before deductions</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>PF Contributions</CardDescription><CardTitle className="text-2xl">{fmtMoney(totalPF, currency)}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">Employee + Employer match</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Active Employees</CardDescription><CardTitle className="text-2xl">{activeProfiles.length}</CardTitle></CardHeader>
          <CardContent className="text-xs text-muted-foreground">{activeProfiles.filter(p => Number(p.base_salary) > 0).length} with salary set</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="payroll">
        <TabsList>
          <TabsTrigger value="payroll">Payroll Records</TabsTrigger>
          <TabsTrigger value="incentives">Incentives</TabsTrigger>
          <TabsTrigger value="gratuity">Gratuity Calculator</TabsTrigger>
        </TabsList>

        <TabsContent value="payroll">
          <Card>
            <CardHeader>
              <CardTitle>{MONTHS[month - 1]} {year}</CardTitle>
              <CardDescription>One row per active employee. OT hours come from approved overtime requests in this month.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Base</TableHead>
                        <TableHead className="text-right">OT</TableHead>
                        <TableHead className="text-right">Incentives</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">PF (Emp)</TableHead>
                        <TableHead className="text-right">Net Pay</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeProfiles.map((p) => {
                        const r = recordByUser.get(p.id);
                        return (
                          <TableRow key={p.id}>
                            <TableCell>
                              <div className="font-medium">{p.full_name || "—"}</div>
                              <div className="text-xs text-muted-foreground">{p.designation || "—"} · {p.company_wing}</div>
                            </TableCell>
                            <TableCell className="text-right">{fmtMoney(r?.base_salary ?? p.base_salary, currency)}</TableCell>
                            <TableCell className="text-right">
                              {r ? `${r.ot_hours.toFixed(2)}h · ${fmtMoney(r.ot_amount, currency)}` : "—"}
                            </TableCell>
                            <TableCell className="text-right">{r ? fmtMoney(r.incentives_amount, currency) : "—"}</TableCell>
                            <TableCell className="text-right">{r ? fmtMoney(r.gross_pay, currency) : "—"}</TableCell>
                            <TableCell className="text-right">{r ? fmtMoney(r.pf_employee, currency) : "—"}</TableCell>
                            <TableCell className="text-right font-semibold">{r ? fmtMoney(r.net_pay, currency) : "—"}</TableCell>
                            <TableCell>{r ? <Badge>{r.status}</Badge> : <Badge variant="outline">Not generated</Badge>}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="outline" onClick={() => handleGenerateOne(p)} title="Recalculate">
                                  <Calculator className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="outline" disabled={!r} onClick={() => r && setPayslipFor({ profile: p, record: r })}>
                                  <FileText className="h-3.5 w-3.5" /> Slip
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {activeProfiles.length === 0 && (
                        <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No active employees.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="incentives">
          <IncentivesPanel year={year} month={month} currency={currency} profiles={activeProfiles} />
        </TabsContent>

        <TabsContent value="gratuity">
          <GratuityPanel profiles={profiles} currency={currency} />
        </TabsContent>
      </Tabs>

      {/* Payslip Dialog */}
      <Dialog open={!!payslipFor} onOpenChange={(o) => !o && setPayslipFor(null)}>
        <DialogContent className="max-w-lg">
          {payslipFor && (
            <>
              <DialogHeader>
                <DialogTitle>Pay Slip — {MONTHS[payslipFor.record.period_month - 1]} {payslipFor.record.period_year}</DialogTitle>
                <DialogDescription>{payslipFor.profile.full_name} · {payslipFor.profile.designation || "—"}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1 text-sm">
                <SlipRow k="Base Salary" v={fmtMoney(payslipFor.record.base_salary, currency)} />
                <SlipRow k={`Overtime (${payslipFor.record.ot_hours.toFixed(2)} hrs)`} v={fmtMoney(payslipFor.record.ot_amount, currency)} />
                <SlipRow k="Incentives" v={fmtMoney(payslipFor.record.incentives_amount, currency)} />
                <div className="border-t my-2" />
                <SlipRow k="Gross Pay" v={fmtMoney(payslipFor.record.gross_pay, currency)} bold />
                <SlipRow k="PF (Employee)" v={`- ${fmtMoney(payslipFor.record.pf_employee, currency)}`} />
                <SlipRow k="Other Deductions" v={`- ${fmtMoney(payslipFor.record.other_deductions, currency)}`} />
                <div className="border-t my-2" />
                <SlipRow k="NET PAY" v={fmtMoney(payslipFor.record.net_pay, currency)} bold large />
                <p className="text-xs text-muted-foreground pt-2">PF (Employer match): {fmtMoney(payslipFor.record.pf_employer, currency)}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPayslipFor(null)}>Close</Button>
                <Button onClick={() => downloadPayslipPDF({ profile: payslipFor.profile, record: payslipFor.record })}>
                  <Download className="h-4 w-4" /> Download PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SlipRow({ k, v, bold, large }: { k: string; v: string; bold?: boolean; large?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : ""} ${large ? "text-base" : ""}`}>
      <span>{k}</span><span>{v}</span>
    </div>
  );
}

/* ---------------- Incentives ---------------- */

interface IncentiveRow {
  id: string; user_id: string; period_year: number; period_month: number;
  label: string; amount: number; note: string | null;
}

function IncentivesPanel({ year, month, currency, profiles }: { year: number; month: number; currency: string; profiles: PayrollProfile[] }) {
  const { user } = useAuth();
  const [items, setItems] = useState<IncentiveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ user_id: "", label: "Performance Bonus", amount: "", note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payroll_incentives")
      .select("*").eq("period_year", year).eq("period_month", month)
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else setItems((data || []) as IncentiveRow[]);
    setLoading(false);
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const handleAdd = async () => {
    if (!user || !form.user_id || !form.amount) {
      toast({ title: "Missing fields", description: "Pick an employee and enter an amount.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("payroll_incentives").insert({
      user_id: form.user_id,
      period_year: year, period_month: month,
      label: form.label || "Bonus",
      amount: Number(form.amount),
      note: form.note || null,
      created_by: user.id,
    });
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Incentive added" });
    setOpen(false);
    setForm({ user_id: "", label: "Performance Bonus", amount: "", note: "" });
    await load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("payroll_incentives").delete().eq("id", id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    await load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Incentives — {MONTHS[month - 1]} {year}</CardTitle>
          <CardDescription>Manual bonuses or performance pay added on top of base salary.</CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Add Incentive</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Incentive</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Employee</Label>
                <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Label</Label>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
              <div>
                <Label>Amount ({currency})</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center py-8"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Employee</TableHead><TableHead>Label</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Note</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => {
                const p = profileMap.get(it.user_id);
                return (
                  <TableRow key={it.id}>
                    <TableCell>{p?.full_name || it.user_id.slice(0, 8)}</TableCell>
                    <TableCell>{it.label}</TableCell>
                    <TableCell className="text-right">{fmtMoney(it.amount, currency)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{it.note || "—"}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => handleDelete(it.id)}>Remove</Button></TableCell>
                  </TableRow>
                );
              })}
              {items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No incentives this month.</TableCell></TableRow>}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Gratuity ---------------- */

function GratuityPanel({ profiles, currency }: { profiles: PayrollProfile[]; currency: string }) {
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = profiles.find((p) => p.id === selectedId);
  const result = selected ? computeGratuity(Number(selected.base_salary), selected.joining_date) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gratuity Calculator</CardTitle>
        <CardDescription>Formula: (Last Drawn Salary × 15 × Years of Service) / 26. Eligibility typically requires 5+ years.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-sm">
          <Label>Employee</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>
              {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {selected && result && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardHeader className="pb-2"><CardDescription>Joining Date</CardDescription><CardTitle className="text-base">{selected.joining_date || "—"}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Years of Service</CardDescription><CardTitle className="text-base">{result.years.toFixed(2)}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Last Drawn Salary</CardDescription><CardTitle className="text-base">{fmtMoney(Number(selected.base_salary), currency)}</CardTitle></CardHeader></Card>
            <Card><CardHeader className="pb-2"><CardDescription>Estimated Gratuity</CardDescription><CardTitle className="text-base">{fmtMoney(result.amount, currency)}</CardTitle></CardHeader>
              <CardContent className="text-xs">{result.eligible ? <Badge>Eligible (5+ yrs)</Badge> : <Badge variant="outline">Not yet eligible</Badge>}</CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
