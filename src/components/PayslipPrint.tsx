import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Printer } from "lucide-react";
import { format } from "date-fns";

interface Props {
  record: any;
  employee: { full_name: string | null; email: string | null; designation: string | null; department: string | null };
}

const PayslipPrint = ({ record, employee }: Props) => {
  const handlePrint = () => window.print();
  const monthName = format(new Date(record.period_year, record.period_month - 1, 1), "MMMM yyyy");

  return (
    <div>
      <div className="flex justify-end mb-3 print:hidden">
        <Button onClick={handlePrint} size="sm"><Printer className="h-4 w-4 mr-1" />Print / Save PDF</Button>
      </div>
      <Card className="print:shadow-none print:border-0">
        <CardContent className="p-8 space-y-6 bg-white text-slate-900">
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">PAYSLIP</h2>
              <p className="text-sm text-slate-600">{monthName}</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">WAMS</p>
              <p className="text-slate-600">Generated {format(new Date(record.generated_at || record.created_at), "MMM d, yyyy")}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <p className="text-slate-500 text-xs uppercase">Employee</p>
              <p className="font-semibold">{employee.full_name || "—"}</p>
              <p className="text-slate-600">{employee.email}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase">Designation</p>
              <p className="font-semibold">{employee.designation || "—"}</p>
              <p className="text-slate-600">{employee.department || "—"}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-sm mb-2 text-slate-700 uppercase">Earnings</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b"><td className="py-1.5">Base Salary</td><td className="text-right">{Number(record.base_salary).toLocaleString()}</td></tr>
                  <tr className="border-b"><td className="py-1.5">Overtime ({Number(record.ot_hours).toFixed(1)}h)</td><td className="text-right">{Number(record.ot_amount).toLocaleString()}</td></tr>
                  <tr className="border-b"><td className="py-1.5">Incentives</td><td className="text-right">{Number(record.incentives_amount).toLocaleString()}</td></tr>
                  <tr className="font-bold"><td className="py-2">Gross Pay</td><td className="text-right">{Number(record.gross_pay).toLocaleString()}</td></tr>
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2 text-slate-700 uppercase">Deductions</h3>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b"><td className="py-1.5">PF (Employee)</td><td className="text-right">{Number(record.pf_employee).toLocaleString()}</td></tr>
                  <tr className="border-b"><td className="py-1.5">Other</td><td className="text-right">{Number(record.other_deductions).toLocaleString()}</td></tr>
                  <tr className="font-bold"><td className="py-2">Total Deductions</td><td className="text-right">{(Number(record.pf_employee) + Number(record.other_deductions)).toLocaleString()}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t-2 border-slate-900 pt-3 flex justify-between items-center bg-slate-50 -mx-8 px-8 py-4">
            <span className="text-lg font-bold">NET PAYABLE</span>
            <span className="text-2xl font-bold">{record.currency} {Number(record.net_pay).toLocaleString()}</span>
          </div>

          <p className="text-xs text-slate-500 text-center pt-4 border-t">This is a system-generated payslip. No signature required.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PayslipPrint;
