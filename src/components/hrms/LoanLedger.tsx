import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Landmark, Loader2, Inbox } from "lucide-react";

type Loan = {
  id: string;
  user_id: string;
  reason: string | null;
  principal_amount: number;
  monthly_deduction: number;
  remaining_balance: number;
  status: string;
  employee_name?: string;
};

export function LoanLedger() {
  const { user, role } = useAuth();
  const isPrivileged = role === "admin" || role === "hr" || role === "executive";
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from("employee_loans")
        .select("id, user_id, reason, principal_amount, monthly_deduction, remaining_balance, status")
        .order("created_at", { ascending: false });
      if (!isPrivileged) query = query.eq("user_id", user.id);
      const { data, error } = await query;
      if (error) throw error;
      const base = (data || []) as Loan[];
      let nameMap = new Map<string, string>();
      if (isPrivileged && base.length) {
        const ids = Array.from(new Set(base.map((b) => b.user_id)));
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        nameMap = new Map((profs || []).map((p) => [p.id, (p.full_name || p.id.slice(0, 8)) as string]));
      }
      setLoans(base.map((b) => ({ ...b, employee_name: nameMap.get(b.user_id) })));
    } catch (err) {
      console.error("[LoanLedger] fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [user, isPrivileged]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card className="shadow-card border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-800">
          <Landmark className="h-5 w-5 text-emerald-600" /> Employee Loan Ledger
        </CardTitle>
        <CardDescription>{isPrivileged ? "Company-wide active loans" : "Your active loans, monthly deductions, and outstanding balance"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : loans.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto mb-2 text-slate-400" />
            No active loans on record.
          </div>
        ) : (
          loans.map((l) => {
            const principal = Number(l.principal_amount);
            const remaining = Number(l.remaining_balance);
            const paid = Math.max(0, principal - remaining);
            const pct = principal > 0 ? Math.min(100, Math.round((paid / principal) * 100)) : 0;
            return (
              <div key={l.id} className="rounded-lg border border-slate-200 p-4 bg-white">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-slate-800">{l.reason ?? "Loan"}</div>
                    <div className="text-xs text-muted-foreground">
                      {isPrivileged && l.employee_name ? `${l.employee_name} · ` : ""}{l.id.slice(0, 8)} · {l.status}
                    </div>
                  </div>
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                    ৳ {Number(l.monthly_deduction).toLocaleString()}/mo
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs mb-2">
                  <Stat label="Principal" value={`৳ ${principal.toLocaleString()}`} />
                  <Stat label="Paid" value={`৳ ${paid.toLocaleString()}`} />
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
