import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calculator, Inbox, Loader2 } from "lucide-react";

type Row = {
  id: string;
  user_id: string;
  period_year: number;
  period_month: number;
  base_salary: number;
  gross_pay: number;
  net_pay: number;
  status: string;
  profiles?: { full_name: string | null; email: string | null } | null;
};

const now = new Date();
const MONTH = now.getMonth() + 1;
const YEAR = now.getFullYear();

export function PayrollProcessor() {
  const { role } = useAuth();
  const canAccess = role === "admin" || role === "hr" || role === "executive";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("payroll_records")
        .select("id, user_id, period_year, period_month, base_salary, gross_pay, net_pay, status, profiles!payroll_records_user_id_fkey(full_name, email)")
        .eq("period_year", YEAR)
        .eq("period_month", MONTH)
        .order("net_pay", { ascending: false });
      if (error) throw error;
      setRows((data || []) as unknown as Row[]);
    } catch (err) {
      console.error("[PayrollProcessor] load failed", err);
    } finally {
      setLoading(false);
    }
  }, [canAccess]);

  useEffect(() => { load(); }, [load]);

  if (!canAccess) {
    return (
      <Card className="shadow-card border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-800"><Calculator className="h-5 w-5 text-emerald-600" /> Payroll Overview</CardTitle>
          <CardDescription>Restricted to HR, Executive, and Admin roles.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="shadow-card border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-800"><Calculator className="h-5 w-5 text-emerald-600" /> Monthly Payroll Snapshot</CardTitle>
        <CardDescription>Live payroll records for {now.toLocaleString("en", { month: "long", year: "numeric" })}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            No payroll records generated for this month yet.
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.profiles?.full_name ?? r.profiles?.email ?? r.user_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.base_salary).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(r.gross_pay).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-emerald-700">{Number(r.net_pay).toLocaleString()}</TableCell>
                    <TableCell className="text-right"><Badge variant="outline" className="capitalize">{r.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
