import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Landmark } from "lucide-react";

type Loan = { id: string; purpose: string; principal: number; monthly: number; paid: number };

const LOANS: Loan[] = [
  { id: "LN-2310", purpose: "Home Renovation", principal: 120000, monthly: 4500, paid: 36000 },
  { id: "LN-2402", purpose: "Education Top-up", principal: 60000, monthly: 2500, paid: 12500 },
];

export function LoanLedger({ loans = LOANS }: { loans?: Loan[] }) {
  return (
    <Card className="shadow-card border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-800">
          <Landmark className="h-5 w-5 text-emerald-600" /> Employee Loan Ledger
        </CardTitle>
        <CardDescription>Active loans, monthly deductions, and outstanding balance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loans.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">No active loans on record.</div>
        ) : (
          loans.map((l) => {
            const remaining = l.principal - l.paid;
            const pct = Math.min(100, Math.round((l.paid / l.principal) * 100));
            return (
              <div key={l.id} className="rounded-lg border border-slate-200 p-4 bg-white">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-slate-800">{l.purpose}</div>
                    <div className="text-xs text-muted-foreground">{l.id}</div>
                  </div>
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                    ৳ {l.monthly.toLocaleString()}/mo
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs mb-2">
                  <Stat label="Principal" value={`৳ ${l.principal.toLocaleString()}`} />
                  <Stat label="Paid" value={`৳ ${l.paid.toLocaleString()}`} />
                  <Stat label="Remaining" value={`৳ ${remaining.toLocaleString()}`} accent />
                </div>
                <Progress value={pct} className="h-2" />
                <div className="mt-1 text-[11px] text-muted-foreground text-right">{pct}% repaid</div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

const Stat = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div>
    <div className="text-muted-foreground">{label}</div>
    <div className={`font-semibold tabular-nums ${accent ? "text-emerald-700" : "text-slate-800"}`}>{value}</div>
  </div>
);
