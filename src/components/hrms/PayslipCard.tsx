import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Download, Printer, FileText } from "lucide-react";
import { toast } from "sonner";

type Props = {
  employeeName?: string;
  employeeId?: string;
  month?: string;
  base?: number;
  allowances?: number;
  tax?: number;
  loan?: number;
};

export function PayslipCard({
  employeeName = "Sadia Rahman",
  employeeId = "EMP-1042",
  month = new Date().toLocaleString("en", { month: "long", year: "numeric" }),
  base = 95000,
  allowances = 8000,
  tax = 6750,
  loan = 4500,
}: Props) {
  const gross = base + allowances;
  const net = gross - tax - loan;

  return (
    <Card className="shadow-card border-slate-200">
      <CardHeader className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-t-xl">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-white">
              <FileText className="h-5 w-5 text-emerald-400" /> Payslip
            </CardTitle>
            <p className="text-xs text-slate-300 mt-1">{month}</p>
          </div>
          <div className="text-right text-xs text-slate-300">
            <div className="font-semibold text-white">{employeeName}</div>
            <div>{employeeId}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5 space-y-4 print:p-0">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <Row label="Basic Salary" value={base} />
          <Row label="Allowances" value={allowances} />
          <Separator className="col-span-2 my-1" />
          <Row label="Gross Pay" value={gross} strong />
          <Row label="Tax (Progressive)" value={-tax} negative />
          <Row label="Loan Installment" value={-loan} negative />
          <Separator className="col-span-2 my-1" />
          <div className="col-span-2 flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
            <span className="text-sm font-semibold text-emerald-800">Net Salary</span>
            <span className="text-lg font-bold text-emerald-700 tabular-nums">৳ {net.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Print
          </Button>
          <Button size="sm" className="bg-slate-900 hover:bg-slate-800" onClick={() => toast.success("Payslip download started")}>
            <Download className="h-3.5 w-3.5 mr-1" /> Download PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const Row = ({ label, value, strong, negative }: { label: string; value: number; strong?: boolean; negative?: boolean }) => (
  <>
    <div className={`text-muted-foreground ${strong ? "font-medium text-slate-700" : ""}`}>{label}</div>
    <div className={`text-right tabular-nums ${strong ? "font-semibold text-slate-800" : ""} ${negative ? "text-red-600" : ""}`}>
      ৳ {Math.abs(value).toLocaleString()}{negative ? "" : ""}
    </div>
  </>
);
