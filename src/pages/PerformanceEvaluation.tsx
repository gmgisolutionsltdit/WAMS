import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardList, Plus, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  EVALUATION_SECTIONS, TOTAL_CRITERIA_COUNT, summarizeScores, weightedFinalCategory,
  CATEGORY_BADGE_CLASS, salaryCategoryForGross, SALARY_CATEGORY_LABEL, recommendedIncrementRange,
  type CriterionScore, type EvaluationCategory, type SalaryCategory,
} from "@/lib/performanceEvaluation";
import {
  COMPANY_SCENARIOS, companyScenario, finalIncrementPct, grossAfterIncrement,
  basicFromGross, incrementAmountFromBasic,
  RETENTION_CHECKLIST_ITEMS, RETENTION_PERIODS, type CompanyScenario,
} from "@/lib/incrementEvaluation";
import { notifyEmployee } from "@/lib/notifications";

type Profile = { id: string; full_name: string | null; email: string | null; base_salary?: number | null };

type Finalization = {
  id: string;
  employee_id: string;
  finalized_by: string;
  weighted_average: number;
  final_category: EvaluationCategory;
  gross_salary: number;
  salary_category: SalaryCategory;
  recommended_min_pct: number;
  recommended_max_pct: number;
  request_ids: string[];
  created_at: string;
};

type IncrementEval = {
  id: string;
  finalization_id: string;
  employee_id: string;
  final_increment_pct: number;
  salary_increment_id: string | null;
  created_at: string;
};

type EvalRequest = {
  id: string;
  employee_id: string;
  evaluator_id: string;
  requested_by: string;
  period_from: string | null;
  period_to: string | null;
  weight: number;
  status: "pending" | "submitted";
  created_at: string;
};

type Evaluation = {
  id: string;
  request_id: string;
  employee_id: string;
  evaluator_id: string;
  evaluator_designation: string | null;
  relationship: string | null;
  scores: CriterionScore[];
  criteria_count: number;
  total_score: number;
  average_score: number;
  category: EvaluationCategory;
  justification: string;
  created_at: string;
};

const emptyRequestForm = () => ({ employee_id: "", evaluator_id: "", period_from: "", period_to: "" });

const emptyAnswerForm = (): { designation: string; relationship: string; scores: CriterionScore[]; justification: string } => ({
  designation: "",
  relationship: "Direct Supervisor",
  scores: EVALUATION_SECTIONS.flatMap((s) => s.criteria.map((criterion) => ({ section: s.key, criterion, score: 3, comment: "" }))),
  justification: "",
});

const PerformanceEvaluation = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const isManagerOrAdmin = ["manager", "admin"].includes(role);

  const [requests, setRequests] = useState<EvalRequest[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [evaluators, setEvaluators] = useState<Profile[]>([]);
  const [finalizations, setFinalizations] = useState<Finalization[]>([]);
  const [incrementEvals, setIncrementEvals] = useState<IncrementEval[]>([]);

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm, setRequestForm] = useState(emptyRequestForm());
  const [saving, setSaving] = useState(false);

  const [answerRequest, setAnswerRequest] = useState<EvalRequest | null>(null);
  const [answerForm, setAnswerForm] = useState(emptyAnswerForm());

  const [incrementDialogFinalization, setIncrementDialogFinalization] = useState<Finalization | null>(null);

  const profileMap = useMemo(() => {
    const m: Record<string, Profile> = {};
    profiles.forEach((p) => (m[p.id] = p));
    evaluators.forEach((p) => (m[p.id] = p));
    return m;
  }, [profiles, evaluators]);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const reqQuery = isAdmin
      ? supabase.from("performance_evaluation_requests").select("*").order("created_at", { ascending: false })
      : supabase.from("performance_evaluation_requests").select("*").eq("evaluator_id", user.id).order("created_at", { ascending: false });
    const evalQuery = isAdmin
      ? supabase.from("performance_evaluations").select("*")
      : supabase.from("performance_evaluations").select("*").eq("evaluator_id", user.id);

    const [{ data: reqs }, { data: evals }, { data: mgrs }] = await Promise.all([
      reqQuery,
      evalQuery,
      supabase.rpc("manager_candidates"),
    ]);
    setRequests((reqs || []) as EvalRequest[]);
    setEvaluations((evals || []) as unknown as Evaluation[]);
    setEvaluators((mgrs || []) as Profile[]);

    if (isAdmin) {
      const [{ data: pf }, { data: finals }, { data: incEvals }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, base_salary").order("full_name"),
        supabase.from("performance_evaluation_finalizations").select("*").order("created_at", { ascending: false }),
        supabase.from("increment_evaluations").select("id, finalization_id, employee_id, final_increment_pct, salary_increment_id, created_at"),
      ]);
      setProfiles((pf || []) as Profile[]);
      setFinalizations((finals || []) as unknown as Finalization[]);
      setIncrementEvals((incEvals || []) as IncrementEval[]);
    }
  }, [user, isAdmin]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const submitRequest = async () => {
    if (!user || !requestForm.employee_id || !requestForm.evaluator_id) {
      toast.error("Employee and evaluator are required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("performance_evaluation_requests").insert({
      employee_id: requestForm.employee_id,
      evaluator_id: requestForm.evaluator_id,
      requested_by: user.id,
      period_from: requestForm.period_from || null,
      period_to: requestForm.period_to || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    const employeeName = profileMap[requestForm.employee_id]?.full_name || "an employee";
    await notifyEmployee(
      requestForm.evaluator_id,
      "Performance Evaluation Requested",
      `You've been asked to evaluate ${employeeName}'s performance.`,
      undefined,
      { route: "/performance-evaluation", type: "performance_evaluation" },
    );
    toast.success("Evaluation requested");
    setRequestOpen(false);
    setRequestForm(emptyRequestForm());
    fetchAll();
  };

  const openAnswer = (req: EvalRequest) => {
    setAnswerRequest(req);
    setAnswerForm(emptyAnswerForm());
  };

  const setScore = (criterion: string, score: number) => {
    setAnswerForm((f) => ({ ...f, scores: f.scores.map((s) => (s.criterion === criterion ? { ...s, score } : s)) }));
  };
  const setComment = (criterion: string, comment: string) => {
    setAnswerForm((f) => ({ ...f, scores: f.scores.map((s) => (s.criterion === criterion ? { ...s, comment } : s)) }));
  };

  const summary = useMemo(() => summarizeScores(answerForm.scores), [answerForm.scores]);

  const submitAnswer = async () => {
    if (!user || !answerRequest) return;
    if (!answerForm.justification.trim()) {
      toast.error("Justification is required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("performance_evaluations").insert({
      request_id: answerRequest.id,
      employee_id: answerRequest.employee_id,
      evaluator_id: user.id,
      evaluator_designation: answerForm.designation.trim() || null,
      relationship: answerForm.relationship,
      scores: answerForm.scores,
      criteria_count: TOTAL_CRITERIA_COUNT,
      total_score: summary.total,
      average_score: summary.average,
      category: summary.category,
      justification: answerForm.justification.trim(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Evaluation submitted");
    setAnswerRequest(null);
    fetchAll();
  };

  const updateWeight = async (requestId: string, weight: number) => {
    const { error } = await supabase.from("performance_evaluation_requests").update({ weight }).eq("id", requestId);
    if (error) { toast.error(error.message); return; }
    fetchAll();
  };

  // Section 3 + Section 6A: persists the weighted final category alongside
  // the employee's current gross salary, salary category and the
  // policy-based increment % range, so the Increment Evaluation Form below
  // can pick it up without recomputing it from scratch each time.
  const finalizeEmployee = async (employeeId: string, empRequests: EvalRequest[], final: { weightedAverage: number; category: EvaluationCategory }) => {
    if (!user) return;
    const gross = Number(profileMap[employeeId]?.base_salary) || 0;
    if (gross <= 0) {
      toast.error("This employee has no gross salary on file — set it in their profile first");
      return;
    }
    const salaryCategory = salaryCategoryForGross(gross);
    const range = recommendedIncrementRange(salaryCategory, final.category);
    const { error } = await supabase.from("performance_evaluation_finalizations").insert({
      employee_id: employeeId,
      finalized_by: user.id,
      weighted_average: final.weightedAverage,
      final_category: final.category,
      gross_salary: gross,
      salary_category: salaryCategory,
      recommended_min_pct: range.min,
      recommended_max_pct: range.max,
      request_ids: empRequests.map((r) => r.id),
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Performance result finalized");
    fetchAll();
  };

  const latestFinalization = useCallback(
    (employeeId: string) => finalizations.find((f) => f.employee_id === employeeId),
    [finalizations],
  );
  const incrementEvalFor = useCallback(
    (finalizationId: string) => incrementEvals.find((e) => e.finalization_id === finalizationId),
    [incrementEvals],
  );

  // Employee-level view: every evaluation's average score, weighted by its
  // request's admin-assigned weight, decides the final Section 6 category.
  const employeeGroups = useMemo(() => {
    const employeeIds = Array.from(new Set(requests.map((r) => r.employee_id)));
    return employeeIds.map((employeeId) => {
      const empRequests = requests.filter((r) => r.employee_id === employeeId);
      const empEvaluations = empRequests
        .map((r) => ({ request: r, evaluation: evaluations.find((e) => e.request_id === r.id) }))
        .filter((x): x is { request: EvalRequest; evaluation: Evaluation } => !!x.evaluation);
      const final = weightedFinalCategory(
        empEvaluations.map(({ request, evaluation }) => ({ average_score: evaluation.average_score, weight: request.weight })),
      );
      return { employeeId, requests: empRequests, evaluations: empEvaluations, final };
    });
  }, [requests, evaluations]);

  const pendingForMe = requests.filter((r) => r.evaluator_id === user?.id && r.status === "pending");
  const submittedByMe = requests.filter((r) => r.evaluator_id === user?.id && r.status === "submitted");

  if (!isManagerOrAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" /> Performance Evaluation
          </h2>
          <p className="text-sm text-muted-foreground">
            Score an employee's performance against the 14-point evaluation form; the category and, when more than
            one evaluator is involved, the weighted final result are calculated automatically.
          </p>
        </div>
        {isAdmin && (
          <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Request Evaluation</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Request a Performance Evaluation</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Employee</Label>
                  <Select value={requestForm.employee_id} onValueChange={(v) => setRequestForm((f) => ({ ...f, employee_id: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Evaluator (manager or admin)</Label>
                  <Select value={requestForm.evaluator_id} onValueChange={(v) => setRequestForm((f) => ({ ...f, evaluator_id: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select evaluator" /></SelectTrigger>
                    <SelectContent>
                      {evaluators.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Period From</Label>
                    <Input type="date" value={requestForm.period_from} onChange={(e) => setRequestForm((f) => ({ ...f, period_from: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Period To</Label>
                    <Input type="date" value={requestForm.period_to} onChange={(e) => setRequestForm((f) => ({ ...f, period_to: e.target.value }))} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={submitRequest} disabled={saving}>{saving ? "Requesting…" : "Request Evaluation"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {pendingForMe.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evaluations Requested of You</CardTitle>
            <CardDescription>Score each criterion 1–5; the total, average and category are calculated for you.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingForMe.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{profileMap[r.employee_id]?.full_name || profileMap[r.employee_id]?.email || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.period_from && r.period_to ? `${r.period_from} – ${r.period_to}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</TableCell>
                    <TableCell><Button size="sm" onClick={() => openAnswer(r)}>Evaluate</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!isAdmin && submittedByMe.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Your Submitted Evaluations</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Average Score</TableHead>
                  <TableHead>Category</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submittedByMe.map((r) => {
                  const ev = evaluations.find((e) => e.request_id === r.id);
                  if (!ev) return null;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{profileMap[r.employee_id]?.full_name || profileMap[r.employee_id]?.email || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{ev.average_score} / 5</TableCell>
                      <TableCell><Badge className={CATEGORY_BADGE_CLASS[ev.category]}>{ev.category}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evaluations by Employee</CardTitle>
            <CardDescription>
              When more than one evaluator covers the same employee, set each evaluator's weight — the final category
              is their weighted-average score.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {employeeGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No evaluations requested yet.</p>
            ) : employeeGroups.map((g) => {
              const finalization = latestFinalization(g.employeeId);
              const incrementEval = finalization ? incrementEvalFor(finalization.id) : undefined;
              const hasSubmitted = g.evaluations.length > 0;
              return (
              <div key={g.employeeId} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-medium">{profileMap[g.employeeId]?.full_name || profileMap[g.employeeId]?.email || "—"}</p>
                  {g.final && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Weighted average: {g.final.weightedAverage} / 5</span>
                      <Badge className={CATEGORY_BADGE_CLASS[g.final.category]}>{g.final.category}</Badge>
                      <Button size="sm" variant="outline" disabled={!hasSubmitted} onClick={() => finalizeEmployee(g.employeeId, g.requests, g.final!)}>
                        Finalize
                      </Button>
                    </div>
                  )}
                </div>

                {finalization && (
                  <div className="rounded-md bg-muted/40 p-3 text-xs space-y-1">
                    <p>
                      Finalized {format(new Date(finalization.created_at), "MMM d, yyyy")}: {SALARY_CATEGORY_LABEL[finalization.salary_category]},{" "}
                      {finalization.final_category} → recommended annual increment{" "}
                      <span className="font-mono">{finalization.recommended_min_pct}% – {finalization.recommended_max_pct}%</span> of gross salary{" "}
                      <span className="font-mono">{finalization.gross_salary.toLocaleString()}</span> BDT.
                    </p>
                    {incrementEval ? (
                      <p className="text-success-foreground">
                        Increment decided: <span className="font-mono">{incrementEval.final_increment_pct}%</span>
                        {incrementEval.salary_increment_id && " — applied to Salary Increments"}
                      </p>
                    ) : (
                      <Button size="sm" className="mt-1" onClick={() => setIncrementDialogFinalization(finalization)}>
                        <TrendingUp className="h-3.5 w-3.5 mr-1" /> Create Increment Recommendation
                      </Button>
                    )}
                  </div>
                )}

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evaluator</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Average Score</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Weight</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.requests.map((r) => {
                      const ev = evaluations.find((e) => e.request_id === r.id);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>{profileMap[r.evaluator_id]?.full_name || profileMap[r.evaluator_id]?.email || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === "submitted" ? "outline" : "secondary"}>
                              {r.status === "submitted" ? "Submitted" : "Pending"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{ev ? `${ev.average_score} / 5` : "—"}</TableCell>
                          <TableCell>{ev ? <Badge className={CATEGORY_BADGE_CLASS[ev.category]}>{ev.category}</Badge> : "—"}</TableCell>
                          <TableCell>
                            <Input
                              type="number" step="0.1" min="0.1" className="w-20"
                              defaultValue={r.weight}
                              onBlur={(e) => {
                                const v = parseFloat(e.target.value);
                                if (v > 0 && v !== r.weight) updateWeight(r.id, v);
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!answerRequest} onOpenChange={(o) => !o && setAnswerRequest(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Evaluate {answerRequest ? (profileMap[answerRequest.employee_id]?.full_name || profileMap[answerRequest.employee_id]?.email) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Your Designation</Label>
                <Input value={answerForm.designation} onChange={(e) => setAnswerForm((f) => ({ ...f, designation: e.target.value }))} />
              </div>
              <div>
                <Label>Relationship with Employee</Label>
                <Select value={answerForm.relationship} onValueChange={(v) => setAnswerForm((f) => ({ ...f, relationship: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Direct Supervisor">Direct Supervisor</SelectItem>
                    <SelectItem value="Project Supervisor">Project Supervisor</SelectItem>
                    <SelectItem value="Founder">Founder</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {EVALUATION_SECTIONS.map((section) => (
              <div key={section.key} className="space-y-2">
                <p className="text-sm font-medium">{section.key}. {section.title}</p>
                {section.criteria.map((criterion) => {
                  const current = answerForm.scores.find((s) => s.criterion === criterion);
                  return (
                    <div key={criterion} className="rounded-md border p-2 space-y-2">
                      <p className="text-xs">{criterion}</p>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Button
                            key={n}
                            type="button"
                            size="sm"
                            variant={current?.score === n ? "default" : "outline"}
                            className="h-7 w-7 p-0"
                            onClick={() => setScore(criterion, n)}
                          >
                            {n}
                          </Button>
                        ))}
                      </div>
                      <Input
                        placeholder="Comments (optional)"
                        value={current?.comment || ""}
                        onChange={(e) => setComment(criterion, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              Total Score: <span className="font-mono">{summary.total} / {TOTAL_CRITERIA_COUNT * 5}</span>{" "}
              · Average: <span className="font-mono">{summary.average} / 5</span>{" "}
              · Category: <Badge className={CATEGORY_BADGE_CLASS[summary.category]}>{summary.category}</Badge>
            </div>

            <div>
              <Label>Justification (required)</Label>
              <Textarea
                rows={3}
                value={answerForm.justification}
                onChange={(e) => setAnswerForm((f) => ({ ...f, justification: e.target.value }))}
                placeholder="Why this category, based on the scores above?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitAnswer} disabled={saving} className="w-full">
              {saving ? "Submitting…" : "Submit Evaluation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {incrementDialogFinalization && (
        <IncrementEvaluationDialog
          finalization={incrementDialogFinalization}
          employeeName={profileMap[incrementDialogFinalization.employee_id]?.full_name || profileMap[incrementDialogFinalization.employee_id]?.email || "this employee"}
          onClose={() => setIncrementDialogFinalization(null)}
          onSaved={() => { setIncrementDialogFinalization(null); fetchAll(); }}
        />
      )}
    </div>
  );
};

const nextMonthValue = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return format(d, "yyyy-MM");
};

const emptyIncrementForm = (finalization: Finalization) => ({
  company_scenario: "average" as CompanyScenario,
  approved_increment_factor_pct: companyScenario("average").range?.min ?? 0,
  average_recommended_pct: Math.round(((finalization.recommended_min_pct + finalization.recommended_max_pct) / 2) * 100) / 100,
  effective_from_month: nextMonthValue(),
  retention_recommended: false,
  retention_checklist: [] as string[],
  retention_pct: "",
  retention_amount: "",
  retention_period: "",
  retention_condition: "",
  retention_justification: "",
  final_approved_retention_pct: "",
  final_approved_bonus_amount: "",
  final_notes: "",
});

const IncrementEvaluationDialog = ({
  finalization, employeeName, onClose, onSaved,
}: {
  finalization: Finalization;
  employeeName: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyIncrementForm(finalization));
  const [saving, setSaving] = useState(false);

  const scenario = companyScenario(form.company_scenario);
  // Annual increment is applied only on Basic Salary, not gross.
  const basicBefore = basicFromGross(finalization.gross_salary);
  const basePct = finalIncrementPct(form.average_recommended_pct, form.approved_increment_factor_pct, form.company_scenario);
  const baseAmount = incrementAmountFromBasic(basicBefore, basePct);

  // Retention stacks on top of the performance-based increment: the admin's
  // final approved % wins if set, otherwise the recommended retention %/amount applies.
  let retentionPct = 0;
  let retentionAmount = 0;
  if (form.final_approved_retention_pct) {
    retentionPct = parseFloat(form.final_approved_retention_pct) || 0;
    retentionAmount = incrementAmountFromBasic(basicBefore, retentionPct);
  } else if (form.retention_recommended) {
    if (form.retention_pct) {
      retentionPct = parseFloat(form.retention_pct) || 0;
      retentionAmount = incrementAmountFromBasic(basicBefore, retentionPct);
    } else if (form.retention_amount) {
      retentionAmount = parseFloat(form.retention_amount) || 0;
      retentionPct = basicBefore > 0 ? Math.round((retentionAmount / basicBefore) * 100 * 100) / 100 : 0;
    }
  }

  const totalAmount = Math.round((baseAmount + retentionAmount) * 100) / 100;
  const totalPct = basicBefore > 0 ? Math.round((totalAmount / basicBefore) * 100 * 100) / 100 : basePct;
  const grossAfter = grossAfterIncrement(finalization.gross_salary, totalAmount);

  const toggleChecklistItem = (item: string) => {
    setForm((f) => ({
      ...f,
      retention_checklist: f.retention_checklist.includes(item)
        ? f.retention_checklist.filter((i) => i !== item)
        : [...f.retention_checklist, item],
    }));
  };

  const save = async () => {
    if (!user) return;
    if (form.company_scenario !== "freeze" && scenario.range) {
      if (form.approved_increment_factor_pct < scenario.range.min || form.approved_increment_factor_pct > scenario.range.max) {
        toast.error(`Approved Increment Factor must be within ${scenario.range.min}%–${scenario.range.max}% for the "${scenario.label}" scenario`);
        return;
      }
    }
    if (form.average_recommended_pct < finalization.recommended_min_pct || form.average_recommended_pct > finalization.recommended_max_pct) {
      toast.error(`Average Recommended % must be within the policy range ${finalization.recommended_min_pct}%–${finalization.recommended_max_pct}%`);
      return;
    }
    if (form.retention_recommended && !form.retention_justification.trim()) {
      toast.error("Retention justification is required when retention is recommended");
      return;
    }
    setSaving(true);
    try {
      const { data: incEval, error: incError } = await supabase.from("increment_evaluations").insert({
        finalization_id: finalization.id,
        employee_id: finalization.employee_id,
        company_scenario: form.company_scenario,
        approved_increment_factor_pct: form.approved_increment_factor_pct,
        average_recommended_pct: form.average_recommended_pct,
        final_increment_pct: totalPct,
        gross_salary_before: finalization.gross_salary,
        gross_salary_after: grossAfter,
        retention_recommended: form.retention_recommended,
        retention_checklist: form.retention_checklist,
        retention_pct: retentionPct > 0 ? retentionPct : null,
        retention_amount: retentionAmount > 0 ? retentionAmount : null,
        retention_period: form.retention_recommended ? form.retention_period || null : null,
        retention_condition: form.retention_recommended ? form.retention_condition.trim() || null : null,
        retention_justification: form.retention_recommended ? form.retention_justification.trim() : null,
        final_approved_retention_pct: form.final_approved_retention_pct ? parseFloat(form.final_approved_retention_pct) : null,
        final_approved_bonus_amount: form.final_approved_bonus_amount ? parseFloat(form.final_approved_bonus_amount) : null,
        final_notes: form.final_notes.trim() || null,
        created_by: user.id,
      }).select().single();
      if (incError) throw incError;

      const { data: increment, error: incrError } = await supabase.from("salary_increments").insert({
        user_id: finalization.employee_id,
        cycle_label: `Performance Review ${format(new Date(), "MMM yyyy")}`,
        effective_from: `${form.effective_from_month}-01`,
        base_salary: basicBefore,
        increment_amount: totalAmount,
        increment_pct: totalPct,
        retention_pct: retentionPct > 0 ? retentionPct : null,
        retention_amount: retentionAmount > 0 ? retentionAmount : null,
        gross_salary_before: finalization.gross_salary,
        gross_salary_after: grossAfter,
        reason: `Performance: ${finalization.final_category} (weighted avg ${finalization.weighted_average}/5)${retentionAmount > 0 ? "; includes a retention increment" : ""}.`,
        approved_by: user.id,
      }).select().single();
      if (incrError) throw incrError;

      const { error: linkError } = await supabase.from("increment_evaluations").update({ salary_increment_id: increment.id }).eq("id", incEval.id);
      if (linkError) throw linkError;

      toast.success("Increment decided and applied to Salary Increments");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save increment recommendation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Increment Evaluation — {employeeName}</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <div className="rounded-md bg-muted/40 p-3 text-xs">
            {SALARY_CATEGORY_LABEL[finalization.salary_category]} · {finalization.final_category} · Policy range{" "}
            <span className="font-mono">{finalization.recommended_min_pct}%–{finalization.recommended_max_pct}%</span> · Gross salary{" "}
            <span className="font-mono">{finalization.gross_salary.toLocaleString()}</span> BDT
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Section 1: Company Performance Scenario &amp; Approved Increment Factor</p>
            <div className="grid grid-cols-2 gap-2">
              {COMPANY_SCENARIOS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`rounded-md border p-2 text-left text-xs ${form.company_scenario === s.value ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => setForm((f) => ({ ...f, company_scenario: s.value, approved_increment_factor_pct: s.range?.min ?? 0 }))}
                >
                  <p className="font-medium">{s.label}</p>
                  <p className="text-muted-foreground">{s.detail}</p>
                  <p className="text-muted-foreground">{s.range ? `${s.range.min}% – ${s.range.max}%` : "0%"}</p>
                </button>
              ))}
            </div>
            {form.company_scenario !== "freeze" && (
              <div className="mt-2">
                <Label>Approved Increment Factor %</Label>
                <Input
                  type="number" step="1"
                  value={form.approved_increment_factor_pct}
                  onChange={(e) => setForm((f) => ({ ...f, approved_increment_factor_pct: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Section 2: Final Annual Increment Calculation</p>
            <Label>Average Recommended Annual Increment %</Label>
            <Input
              type="number" step="0.5"
              value={form.average_recommended_pct}
              onChange={(e) => setForm((f) => ({ ...f, average_recommended_pct: parseFloat(e.target.value) || 0 }))}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Must be within the policy range {finalization.recommended_min_pct}%–{finalization.recommended_max_pct}%. Applied to Basic Salary{" "}
              (<span className="font-mono">{basicBefore.toLocaleString()}</span> BDT).
            </p>
            <div className="mt-3">
              <Label>Effective From (month the increment applies)</Label>
              <Input
                type="month"
                value={form.effective_from_month}
                onChange={(e) => setForm((f) => ({ ...f, effective_from_month: e.target.value }))}
              />
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-sm mt-2 space-y-1">
              <p>Final Annual Increment % (incl. retention): <span className="font-mono font-semibold">{totalPct}%</span></p>
              {retentionAmount > 0 && (
                <p className="text-xs text-muted-foreground">
                  Performance {basePct}% (<span className="font-mono">{baseAmount.toLocaleString()}</span> BDT) + retention {retentionPct}%{" "}
                  (<span className="font-mono">{retentionAmount.toLocaleString()}</span> BDT)
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Increment amount: <span className="font-mono">{totalAmount.toLocaleString()}</span> BDT · Gross salary after increment:{" "}
                <span className="font-mono">{grossAfter.toLocaleString()}</span> BDT
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Checkbox checked={form.retention_recommended} onCheckedChange={(c) => setForm((f) => ({ ...f, retention_recommended: !!c }))} />
              <p className="text-sm font-medium">Section 3: Recommend a Retention Increment</p>
            </div>
            {form.retention_recommended && (
              <div className="space-y-3 mt-2 pl-6">
                <div className="space-y-1">
                  {RETENTION_CHECKLIST_ITEMS.map((item) => (
                    <label key={item} className="flex items-start gap-2 text-xs">
                      <Checkbox checked={form.retention_checklist.includes(item)} onCheckedChange={() => toggleChecklistItem(item)} className="mt-0.5" />
                      {item}
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Retention Amount (BDT)</Label>
                    <Input type="number" value={form.retention_pct ? "" : form.retention_amount} disabled={!!form.retention_pct}
                      onChange={(e) => setForm((f) => ({ ...f, retention_amount: e.target.value }))} />
                  </div>
                  <div>
                    <Label>OR Retention % of Basic</Label>
                    <Input type="number" value={form.retention_amount ? "" : form.retention_pct} disabled={!!form.retention_amount}
                      onChange={(e) => setForm((f) => ({ ...f, retention_pct: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Required Retention Period</Label>
                  <Select value={form.retention_period} onValueChange={(v) => setForm((f) => ({ ...f, retention_period: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select period" /></SelectTrigger>
                    <SelectContent>
                      {RETENTION_PERIODS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>OR Required Retention Condition</Label>
                  <Textarea rows={2} value={form.retention_condition} onChange={(e) => setForm((f) => ({ ...f, retention_condition: e.target.value }))} />
                </div>
                <div>
                  <Label>Retention Justification (required)</Label>
                  <Textarea rows={2} value={form.retention_justification} onChange={(e) => setForm((f) => ({ ...f, retention_justification: e.target.value }))} />
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Section 4: Final Approval Summary</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Final Approved Retention % (Basic)</Label>
                <Input type="number" value={form.final_approved_retention_pct} onChange={(e) => setForm((f) => ({ ...f, final_approved_retention_pct: e.target.value }))} />
              </div>
              <div>
                <Label>Final Approved Bonus (BDT)</Label>
                <Input type="number" value={form.final_approved_bonus_amount} onChange={(e) => setForm((f) => ({ ...f, final_approved_bonus_amount: e.target.value }))} />
              </div>
            </div>
            <div className="mt-2">
              <Label>Final Notes / Comments</Label>
              <Textarea rows={2} value={form.final_notes} onChange={(e) => setForm((f) => ({ ...f, final_notes: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? "Saving…" : "Decide Final Increment & Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PerformanceEvaluation;
