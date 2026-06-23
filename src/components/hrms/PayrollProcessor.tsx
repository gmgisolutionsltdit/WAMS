import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calculator, FileSpreadsheet, Inbox, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Employee = { id: string; name: string; base: number; loan: number };

const ROSTER: Employee[] = [
  { id: "EMP-1042", name: "Sadia Rahman", base: 95000, loan: 4500 },
  { id: "EMP-1156", name: "Tanvir Hasan", base: 72000, loan: 0 },
  { id: "EMP-0987", name: "Mehnaz Karim", base: 140000, loan: 12000 },
  { id: "EMP-1320", name: "Rafiul Islam", base: 58000, loan: 2500 },
  { id: "EMP-2204", name: "Nusrat Jahan", base: 86000, loan: 0 },
];

const SLABS = [
  { upto: 25000, rate: 0 },
  { upto: 60000, rate: 0.05 },
  { upto: 100000, rate: 0.1 },
  { upto: 150000, rate: 0.15 },
  { upto: Infinity, rate: 0.2 },
];

function progressiveTax(monthly: number) {
  let tax = 0; let remaining = monthly; let prev = 0;
  for (const s of SLABS) {
    const band = Math.min(remaining, s.upto - prev);
    if (band <= 0) break;
    tax += band * s.rate;
    remaining -= band; prev = s.upto;
    if (remaining <= 0) break;
  }
  return Math.round(tax);
}

export function PayrollProcessor() {
  const [rows, setRows] = useState<(Employee & { tax: number; net: number })[]>([]);
  const [running, setRunning] = useState(false);

  const generate = () => {
    setRunning(true);
    setTimeout(() => {
      const computed = ROSTER.map((e) => {
        const tax = progressiveTax(e.base);
        const net = e.base - tax - e.loan;
        return { ...e, tax, net };
      });
      setRows(computed);
      setRunning(false);
      toast.success(`Payroll matrix generated for ${computed.length} employees`);
    }, 900);
  };

  return (
    <Card className="shadow-card border-slate-200">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-slate-800">
            <Calculator className="h-5 w-5 text-emerald-600" /> Monthly Payroll Processor
          </CardTitle>
          <CardDescription>Net = Base − (Progressive Tax + Active Loan Installment)</CardDescription>
        </div>
        <Button onClick={generate} disabled={running} className="bg-slate-900 hover:bg-slate-800 text-white">
          <Sparkles className="h-4 w-4 mr-1" /> {running ? "Computing…" : "Generate Payroll Matrix"}
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-10 text-center text-sm text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            No payroll matrix generated yet. Click <strong>Generate</strong> to compute net salaries for the current cycle.
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Loan</TableHead>
                  <TableHead className="text-right">Net Salary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="hover:bg-slate-50/50">
                    <TableCell>
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.id}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">৳ {r.base.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-600">− {r.tax.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-600">− {r.loan.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge className="bg-emerald-600 tabular-nums">৳ {r.net.toLocaleString()}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-end gap-2 p-3 border-t bg-slate-50">
              <Button variant="outline" size="sm" onClick={() => toast.success("Payroll exported to CSV")}>
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Export CSV
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
