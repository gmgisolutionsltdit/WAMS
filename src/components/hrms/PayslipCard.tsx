import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Download, Printer, FileText, Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";

type PayrollRow = {
  id: string;
  period_year: number;
  period_month: number;
  base_salary: number;
  gross_pay: number;
  net_pay: number;
  pf_employee: number;
  other_deductions: number;
  ot_amount: number;
  incentives_amount: number;
  currency: string;
};

const now = new Date();

export function PayslipCard() {
  const { user, profile } = useAuth();
  const [record, setRecord] = useState<PayrollRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("payroll_records")
        .select("id, period_year, period_month, base_salary, gross_pay, net_pay, pf_employee, other_deductions, ot_amount, incentives_amount, currency")
        .eq("user_id", user.id)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setRecord(data as PayrollRow | null);
    } catch (err) {
      console.error("[PayslipCard] fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Card className="shadow-card border-slate-200">
        <CardContent className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></CardContent>
      </Card>
    );
  }

  if (!record) {
    return (
      <Card className="shadow-card border-slate-200">
        <CardHeader><CardTitle className="flex items-center gap-2 text-slate-800"><FileText className="h-5 w-5 text-emerald-600" /> Latest Payslip</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            No payslip available yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalDeductions = Number(record.pf_employee) + Number(record.other_deductions);
  const monthLabel = new Date(record.period_year, record.period_month - 1).toLocaleString("en", { month: "long", year: "numeric" });
  const sym = record.currency === "BDT" ? "৳" : record.currency;

  return (
    <Card className="shadow-card border-slate-200">
      <CardHeader className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-t-xl">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <FileText className="h-5 w-5 text-emerald-400" /> Payslip
            </CardTitle>
            <p className="text-xs text-slate-300 mt-1">{monthLabel}</p>
          </div>
          <div className="text-right text-xs text-slate-300">
            <div className="font-semibold text-white">{profile.full_name ?? user?.email}</div>
            <div>{profile.designation ?? ""}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5 space-y-4 print:p-0">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Row sym={sym} label="Basic Salary" value={Number(record.base_salary)} />
          <Row sym={sym} label="Overtime" value={Number(record.ot_amount)} />
          <Row sym={sym} label="Incentives" value={Number(record.incentives_amount)} />
          <Separator className="col-span-2 my-1" />
          <Row sym={sym} label="Gross Pay" value={Number(record.gross_pay)} strong />
          <Row sym={sym} label="PF (Employee)" value={-Number(record.pf_employee)} negative />
          <Row sym={sym} label="Other Deductions" value={-Number(record.other_deductions)} negative />
          <Separator className="col-span-2 my-1" />
          <div className="col-span-2 flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
            <span className="text-sm font-semibold text-emerald-800">Net Salary</span>
            <span className="text-lg font-bold text-emerald-700 tabular-nums">{sym} {Number(record.net_pay).toLocaleString()}</span>
          </div>
          <div className="col-span-2 text-[11px] text-muted-foreground text-right">Total deductions: {sym} {totalDeductions.toLocaleString()}</div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Print
          </Button>
          <Button size="sm" className="bg-slate-900 hover:bg-slate-800" onClick={() => toast.success("Use the Payroll page for full PDF export.")}>
            <Download className="h-3.5 w-3.5 mr-1" /> Download
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const Row = ({ label, value, strong, negative, sym }: { label: string; value: number; strong?: boolean; negative?: boolean; sym: string }) => (
  <>
    <div className={`text-muted-foreground ${strong ? "font-medium text-slate-700" : ""}`}>{label}</div>
    <div className={`text-right tabular-nums ${strong ? "font-semibold text-slate-800" : ""} ${negative ? "text-red-600" : ""}`}>
      {sym} {Math.abs(value).toLocaleString()}
    </div>
  </>
);
