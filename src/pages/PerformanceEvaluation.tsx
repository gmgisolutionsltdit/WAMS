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
import { ClipboardList, Plus, TrendingUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  EVALUATION_SECTIONS, TOTAL_CRITERIA_COUNT, summarizeScores, weightedFinalCategory,
  CATEGORY_BADGE_CLASS, salaryCategoryForGross, SALARY_CATEGORY_LABEL, recommendedIncrementRange, SCORE_SCALE,
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
  company_scenario: CompanyScenario;
  approved_increment_factor_pct: number;
  average_recommended_pct: number;
  final_increment_pct: number;
  gross_salary_before: number;
  gross_salary_after: number;
  retention_recommended: boolean;
  retention_checklist: string[] | null;
  retention_pct: number | null;
  retention_amount: number | null;
  retention_period: string | null;
  retention_condition: string | null;
  retention_justification: string | null;
  final_approved_retention_pct: number | null;
  final_approved_bonus_amount: number | null;
  final_notes: string | null;
  salary_increment_id: string | null;
  created_at: string;
};

type SalaryIncrementLink = { id: string; effective_from: string; cycle_label: string; base_salary: number };

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

const emptyRequestForm = () => ({ employee_id: "", evaluator_ids: [] as string[], period_from: "", period_to: "" });

const emptyAnswerForm = (): { scores: CriterionScore[]; justification: string } => ({
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
  const [editingIncrementEval, setEditingIncrementEval] = useState<IncrementEval | null>(null);
  const [viewEvaluation, setViewEvaluation] = useState<Evaluation | null>(null);
  const [viewFinalizationDetails, setViewFinalizationDetails] = useState<Finalization | null>(null);
  const [salaryIncrementMap, setSalaryIncrementMap] = useState<Record<string, SalaryIncrementLink>>({});

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
        supabase.from("increment_evaluations").select("*"),
      ]);
      setProfiles((pf || []) as Profile[]);
      setFinalizations((finals || []) as unknown as Finalization[]);
      setIncrementEvals((incEvals || []) as IncrementEval[]);

      const incrementIds = Array.from(new Set((incEvals || []).map((e) => e.salary_increment_id).filter(Boolean))) as string[];
      if (incrementIds.length > 0) {
        const { data: links } = await supabase.from("salary_increments").select("id, effective_from, cycle_label, base_salary").in("id", incrementIds);
        const map: Record<string, SalaryIncrementLink> = {};
        (links || []).forEach((l) => { map[l.id] = l as SalaryIncrementLink; });
        setSalaryIncrementMap(map);
      } else {
        setSalaryIncrementMap({});
      }
    } else {
      // Non-admin (manager-evaluator): fetch just the employee profiles
      // named in this user's own requests, so names render instead of
      // falling back to "—" everywhere an employee is shown.
      const employeeIds = Array.from(new Set((reqs || []).map((r) => r.employee_id)));
      if (employeeIds.length > 0) {
        const { data: pf } = await supabase.from("profiles").select("id, full_name, email").in("id", employeeIds);
        setProfiles((pf || []) as Profile[]);
      }
    }
  }, [user, isAdmin]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleRequestEvaluator = (id: string) =>
    setRequestForm((f) => ({
      ...f,
      evaluator_ids: f.evaluator_ids.includes(id) ? f.evaluator_ids.filter((x) => x !== id) : [...f.evaluator_ids, id],
    }));

  const submitRequest = async () => {
    if (!user || !requestForm.employee_id || requestForm.evaluator_ids.length === 0) {
      toast.error("Employee and at least one evaluator are required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("performance_evaluation_requests").insert(
      requestForm.evaluator_ids.map((evaluatorId) => ({
        employee_id: requestForm.employee_id,
        evaluator_id: evaluatorId,
        requested_by: user.id,
        period_from: requestForm.period_from || null,
        period_to: requestForm.period_to || null,
      })),
    );
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    const employeeName = profileMap[requestForm.employee_id]?.full_name || "an employee";
    await Promise.all(
      requestForm.evaluator_ids.map((evaluatorId) =>
        notifyEmployee(
          evaluatorId,
          "Performance Evaluation Requested",
          `You've been asked to evaluate ${employeeName}'s performance.`,
          undefined,
          { route: "/performance-evaluation", type: "performance_evaluation" },
        ),
      ),
    );
    toast.success(`Evaluation requested from ${requestForm.evaluator_ids.length} evaluator${requestForm.evaluator_ids.length === 1 ? "" : "s"}`);
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

  const deleteRequest = async (requestId: string) => {
    if (!window.confirm("Delete this evaluation? This also removes the evaluator's submitted answers, if any, and cannot be undone.")) return;
    const { error } = await supabase.from("performance_evaluation_requests").delete().eq("id", requestId);
    if (error) { toast.error(error.message); return; }
    toast.success("Evaluation deleted");
    fetchAll();
  };

  // Lets an admin undo a finalize (e.g. to let evaluators redo their scores
  // and refinalize) without going into Supabase directly. This also cascades
  // to the linked increment_evaluations row, so a stale finalization left
  // behind is the usual reason "Finalize" stays stuck on "Finalized" and
  // See Details keeps showing old data after evaluations were deleted and
  // redone — the performance_evaluation_finalizations row itself wasn't.
  const deleteFinalization = async (finalizationId: string) => {
    if (!window.confirm("Delete this finalization? This also removes any increment decision made from it (but not the salary increment ledger entry it may have created) and cannot be undone.")) return;
    // RLS blocking this (e.g. a stale session role) doesn't error — it just
    // matches 0 rows, which would otherwise look like silent success while
    // the stale row (and the stuck Finalize button) stays put.
    const { data, error } = await supabase.from("performance_evaluation_finalizations").delete().eq("id", finalizationId).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("Delete didn't go through — you may not have permission to delete this."); return; }
    toast.success("Finalization deleted");
    fetchAll();
  };

  // Section 3 + Section 6A: persists the weighted final category alongside
  // the employee's current gross salary, salary category and the
  // policy-based increment % range, so the Increment Evaluation Form below
  // can pick it up without recomputing it from scratch each time.
  const finalizeEmployee = async (employeeId: string, empRequests: EvalRequest[], final: { weightedAverage: number; category: EvaluationCategory }) => {
    if (!user) return;
    if (latestFinalization(employeeId)) {
      toast.error("Already finalized — this can only be done once per employee.");
      return;
    }
    // Read the gross salary fresh rather than from this page's local
    // profiles list, which was only fetched once on mount and can go stale
    // if the admin updates it (e.g. from the employee's Financial tab)
    // without reloading this page.
    const { data: freshProfile, error: profileErr } = await supabase
      .from("profiles").select("base_salary").eq("id", employeeId).maybeSingle();
    if (profileErr) { toast.error(profileErr.message); return; }
    const gross = Number(freshProfile?.base_salary) || 0;
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
  // Matched by employee_id (not finalization_id) and picks the most recent:
  // older test data can have more than one finalization row per employee
  // from before finalize was made one-time-only, and an increment decided
  // against an earlier finalization would otherwise never be found once
  // latestFinalization() moved on to the newer row.
  const incrementEvalFor = useCallback(
    (employeeId: string) => incrementEvals
      .filter((e) => e.employee_id === employeeId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0],
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
                  <Label>Evaluators ({requestForm.evaluator_ids.length} selected)</Label>
                  <div className="mt-1 rounded-md border p-2 max-h-40 overflow-y-auto space-y-1">
                    {evaluators.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-1 py-0.5">No managers or admins available.</p>
                    ) : evaluators.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm px-1 py-0.5">
                        <Checkbox
                          checked={requestForm.evaluator_ids.includes(p.id)}
                          onCheckedChange={() => toggleRequestEvaluator(p.id)}
                        />
                        {p.full_name || p.email}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Select more than one to require multiple evaluators — set each one's weight below once submitted.</p>
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
                  <TableHead></TableHead>
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
                      <TableCell><Button size="sm" variant="outline" onClick={() => setViewEvaluation(ev)}>View Answers</Button></TableCell>
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
              const incrementEval = finalization ? incrementEvalFor(g.employeeId) : undefined;
              const hasSubmitted = g.evaluations.length > 0;
              return (
              <div key={g.employeeId} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-medium">{profileMap[g.employeeId]?.full_name || profileMap[g.employeeId]?.email || "—"}</p>
                  {g.final && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground">Weighted average: {g.final.weightedAverage} / 5</span>
                      <Badge className={CATEGORY_BADGE_CLASS[g.final.category]}>{g.final.category}</Badge>
                      <Button size="sm" variant="outline" disabled={!hasSubmitted || !!finalization} onClick={() => finalizeEmployee(g.employeeId, g.requests, g.final!)}>
                        {finalization ? "Finalized" : "Finalize"}
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
                      {incrementEval && (
                        <span className="text-success-foreground">
                          {" "}Increment decided: <span className="font-mono">{incrementEval.final_increment_pct}%</span>
                          {incrementEval.salary_increment_id && " — applied to Salary Increments"}
                        </span>
                      )}
                      {" "}
                      <Button size="sm" variant="outline" className="h-6" onClick={() => setViewFinalizationDetails(finalization)}>See Details</Button>
                      {" "}
                      <Button size="sm" variant="ghost" className="h-6 text-destructive hover:text-destructive" onClick={() => deleteFinalization(finalization.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </p>
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
                      <TableHead></TableHead>
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
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {ev && (
                                <Button size="sm" variant="outline" onClick={() => setViewEvaluation(ev)}>View Answers</Button>
                              )}
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                                aria-label="Delete this evaluation"
                                onClick={() => deleteRequest(r.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
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
            <Table>
              <TableHeader>
                <TableRow><TableHead className="w-12">Score</TableHead><TableHead className="w-32">Meaning</TableHead><TableHead>Description</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {SCORE_SCALE.map((s) => (
                  <TableRow key={s.score}>
                    <TableCell className="font-mono font-semibold">{s.score}</TableCell>
                    <TableCell className="font-medium">{s.label}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

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

      <Dialog open={!!viewEvaluation} onOpenChange={(o) => !o && setViewEvaluation(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewEvaluation ? (profileMap[viewEvaluation.evaluator_id]?.full_name || profileMap[viewEvaluation.evaluator_id]?.email) : ""}'s Evaluation of{" "}
              {viewEvaluation ? (profileMap[viewEvaluation.employee_id]?.full_name || profileMap[viewEvaluation.employee_id]?.email) : ""}
            </DialogTitle>
          </DialogHeader>
          {viewEvaluation && (
            <div className="space-y-5">
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                Total Score: <span className="font-mono">{viewEvaluation.total_score} / {viewEvaluation.criteria_count * 5}</span>{" "}
                · Average: <span className="font-mono">{viewEvaluation.average_score} / 5</span>{" "}
                · Category: <Badge className={CATEGORY_BADGE_CLASS[viewEvaluation.category]}>{viewEvaluation.category}</Badge>
                {" "}· Submitted {format(new Date(viewEvaluation.created_at), "MMM d, yyyy")}
              </div>

              <Table>
                <TableHeader>
                  <TableRow><TableHead className="w-12">Score</TableHead><TableHead className="w-32">Meaning</TableHead><TableHead>Description</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {SCORE_SCALE.map((s) => (
                    <TableRow key={s.score}>
                      <TableCell className="font-mono font-semibold">{s.score}</TableCell>
                      <TableCell className="font-medium">{s.label}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {EVALUATION_SECTIONS.map((section) => (
                <div key={section.key} className="space-y-2">
                  <p className="text-sm font-medium">{section.key}. {section.title}</p>
                  {section.criteria.map((criterion) => {
                    const answer = viewEvaluation.scores.find((s) => s.criterion === criterion);
                    return (
                      <div key={criterion} className="rounded-md border p-2 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs flex-1">{criterion}</p>
                          <Badge variant="outline" className="shrink-0">{answer?.score ?? "—"} / 5</Badge>
                        </div>
                        {answer?.comment && <p className="text-xs text-muted-foreground">{answer.comment}</p>}
                      </div>
                    );
                  })}
                </div>
              ))}

              <div>
                <Label className="text-xs">Justification</Label>
                <p className="text-sm rounded-md border p-2 mt-1 whitespace-pre-wrap">{viewEvaluation.justification || "—"}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewFinalizationDetails} onOpenChange={(o) => !o && setViewFinalizationDetails(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Increment Recommendation — {viewFinalizationDetails ? (profileMap[viewFinalizationDetails.employee_id]?.full_name || profileMap[viewFinalizationDetails.employee_id]?.email) : ""}
            </DialogTitle>
          </DialogHeader>
          {viewFinalizationDetails && (() => {
            const finalization = viewFinalizationDetails;
            const incrementEval = incrementEvalFor(finalization.employee_id);
            return (
              <div className="space-y-4 text-sm">
                <div className="rounded-md bg-muted/40 p-3 space-y-1">
                  <p>Final Category: <Badge className={CATEGORY_BADGE_CLASS[finalization.final_category]}>{finalization.final_category}</Badge></p>
                  <p>Weighted Average: <span className="font-mono">{finalization.weighted_average} / 5</span></p>
                  <p>Salary Category: {SALARY_CATEGORY_LABEL[finalization.salary_category]}</p>
                  <p>Recommended Increment Range: <span className="font-mono">{finalization.recommended_min_pct}% – {finalization.recommended_max_pct}%</span></p>
                  <p>Gross Salary: <span className="font-mono">{finalization.gross_salary.toLocaleString()}</span> BDT</p>
                  <p className="text-xs text-muted-foreground">Finalized {format(new Date(finalization.created_at), "MMM d, yyyy")}</p>
                </div>

                {incrementEval ? (() => {
                  const link = incrementEval.salary_increment_id ? salaryIncrementMap[incrementEval.salary_increment_id] : undefined;
                  const basicBefore = basicFromGross(incrementEval.gross_salary_before);
                  const performancePct = Math.round((incrementEval.final_increment_pct - (incrementEval.retention_pct || 0)) * 100) / 100;
                  const performanceAmount = incrementAmountFromBasic(basicBefore, performancePct);
                  const totalAmount = incrementAmountFromBasic(basicBefore, incrementEval.final_increment_pct);
                  return (
                  <>
                    <div className="rounded-md bg-muted/40 p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">Decided Increment</p>
                        <Button size="sm" variant="outline" onClick={() => { setViewFinalizationDetails(null); setEditingIncrementEval(incrementEval); setIncrementDialogFinalization(finalization); }}>
                          Edit
                        </Button>
                      </div>
                      <p>Company Scenario: <span className="font-medium">{companyScenario(incrementEval.company_scenario).label}</span></p>
                      <p>Approved Increment Factor: <span className="font-mono">{incrementEval.approved_increment_factor_pct}%</span></p>
                      <p>Average Recommended %: <span className="font-mono">{incrementEval.average_recommended_pct}%</span></p>
                      <p>Basic Salary: <span className="font-mono">{basicBefore.toLocaleString()}</span> BDT</p>
                      <p>Performance Increment: <span className="font-mono">{performancePct}%</span> (<span className="font-mono">{performanceAmount.toLocaleString()}</span> BDT)</p>
                      <p>Gross Salary: <span className="font-mono">{incrementEval.gross_salary_before.toLocaleString()}</span> → <span className="font-mono">{incrementEval.gross_salary_after.toLocaleString()}</span> BDT</p>
                      <p>Final Increment % (incl. retention): <span className="font-mono font-semibold">{incrementEval.final_increment_pct}%</span> (<span className="font-mono">{totalAmount.toLocaleString()}</span> BDT)</p>
                      {link && <p>Effective From: {format(new Date(link.effective_from), "MMM yyyy")} · Cycle: {link.cycle_label}</p>}
                      {incrementEval.salary_increment_id && <p className="text-success-foreground">Applied to Salary Increments</p>}
                    </div>

                    {incrementEval.retention_recommended ? (
                      <div className="rounded-md border p-3 space-y-2">
                        <p className="font-medium">Retention Increment</p>
                        {incrementEval.retention_checklist && incrementEval.retention_checklist.length > 0 && (
                          <ul className="list-disc list-inside text-xs text-muted-foreground">
                            {incrementEval.retention_checklist.map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        )}
                        {incrementEval.retention_pct != null && <p>Retention %: <span className="font-mono">{incrementEval.retention_pct}%</span></p>}
                        {incrementEval.retention_amount != null && <p>Retention Amount: <span className="font-mono">{incrementEval.retention_amount.toLocaleString()}</span> BDT</p>}
                        {incrementEval.retention_period && <p>Required Period: {incrementEval.retention_period}</p>}
                        {incrementEval.retention_condition && <p>Required Condition: {incrementEval.retention_condition}</p>}
                        {incrementEval.retention_justification && (
                          <p className="text-xs text-muted-foreground">Justification: {incrementEval.retention_justification}</p>
                        )}
                        {incrementEval.final_approved_retention_pct != null && (
                          <p>Final Approved Retention %: <span className="font-mono">{incrementEval.final_approved_retention_pct}%</span></p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No retention increment was recommended.</p>
                    )}

                    {incrementEval.final_approved_bonus_amount != null && (
                      <p>Final Approved Bonus: <span className="font-mono">{incrementEval.final_approved_bonus_amount.toLocaleString()}</span> BDT</p>
                    )}
                    {incrementEval.final_notes && (
                      <div>
                        <Label className="text-xs">Final Notes</Label>
                        <p className="rounded-md border p-2 mt-1 whitespace-pre-wrap">{incrementEval.final_notes}</p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Decided {format(new Date(incrementEval.created_at), "MMM d, yyyy")}</p>
                  </>
                  );
                })() : (
                  <Button
                    onClick={() => { setViewFinalizationDetails(null); setEditingIncrementEval(null); setIncrementDialogFinalization(finalization); }}
                  >
                    <TrendingUp className="h-3.5 w-3.5 mr-1" /> Create Increment Recommendation
                  </Button>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {incrementDialogFinalization && (
        <IncrementEvaluationDialog
          finalization={incrementDialogFinalization}
          employeeName={profileMap[incrementDialogFinalization.employee_id]?.full_name || profileMap[incrementDialogFinalization.employee_id]?.email || "this employee"}
          existing={editingIncrementEval}
          existingEffectiveFrom={editingIncrementEval?.salary_increment_id ? salaryIncrementMap[editingIncrementEval.salary_increment_id]?.effective_from : undefined}
          onClose={() => { setIncrementDialogFinalization(null); setEditingIncrementEval(null); }}
          onSaved={() => { setIncrementDialogFinalization(null); setEditingIncrementEval(null); fetchAll(); }}
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

const emptyIncrementForm = (finalization: Finalization, existing?: IncrementEval | null, existingEffectiveFrom?: string) => {
  if (existing) {
    return {
      company_scenario: existing.company_scenario,
      approved_increment_factor_pct: existing.approved_increment_factor_pct,
      average_recommended_pct: existing.average_recommended_pct,
      effective_from_month: existingEffectiveFrom ? existingEffectiveFrom.slice(0, 7) : nextMonthValue(),
      retention_recommended: existing.retention_recommended,
      retention_checklist: existing.retention_checklist || [],
      retention_pct: existing.retention_pct != null ? String(existing.retention_pct) : "",
      retention_amount: existing.retention_amount != null ? String(existing.retention_amount) : "",
      retention_period: existing.retention_period || "",
      retention_condition: existing.retention_condition || "",
      retention_justification: existing.retention_justification || "",
    };
  }
  return {
    company_scenario: "average" as CompanyScenario,
    approved_increment_factor_pct: companyScenario("average").range?.max ?? 0,
    average_recommended_pct: finalization.recommended_max_pct,
    effective_from_month: nextMonthValue(),
    retention_recommended: false,
    retention_checklist: [] as string[],
    retention_pct: "",
    retention_amount: "",
    retention_period: "",
    retention_condition: "",
    retention_justification: "",
  };
};

const IncrementEvaluationDialog = ({
  finalization, employeeName, existing, existingEffectiveFrom, onClose, onSaved,
}: {
  finalization: Finalization;
  employeeName: string;
  existing?: IncrementEval | null;
  existingEffectiveFrom?: string;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const { user } = useAuth();
  const [form, setForm] = useState(() => emptyIncrementForm(finalization, existing, existingEffectiveFrom));
  const [saving, setSaving] = useState(false);

  const scenario = companyScenario(form.company_scenario);
  // Annual increment is applied only on Basic Salary, not gross.
  const basicBefore = basicFromGross(finalization.gross_salary);
  const basePct = finalIncrementPct(form.average_recommended_pct, form.approved_increment_factor_pct, form.company_scenario);
  const baseAmount = incrementAmountFromBasic(basicBefore, basePct);

  // Retention stacks on top of the performance-based increment. Pct takes
  // priority when both are filled in (e.g. when editing a previously
  // decided increment that has both stored).
  let retentionPct = 0;
  let retentionAmount = 0;
  if (form.retention_recommended) {
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
      const incrementEvalPayload = {
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
      };
      const salaryIncrementPayload = {
        effective_from: `${form.effective_from_month}-01`,
        base_salary: basicBefore,
        increment_amount: totalAmount,
        increment_pct: totalPct,
        retention_pct: retentionPct > 0 ? retentionPct : null,
        retention_amount: retentionAmount > 0 ? retentionAmount : null,
        gross_salary_before: finalization.gross_salary,
        gross_salary_after: grossAfter,
        reason: `Performance: ${finalization.final_category} (weighted avg ${finalization.weighted_average}/5)${retentionAmount > 0 ? "; includes a retention increment" : ""}.`,
      };

      if (existing) {
        const { error: incError } = await supabase.from("increment_evaluations").update(incrementEvalPayload).eq("id", existing.id);
        if (incError) throw incError;
        if (existing.salary_increment_id) {
          const { error: incrError } = await supabase.from("salary_increments").update(salaryIncrementPayload).eq("id", existing.salary_increment_id);
          if (incrError) throw incrError;
        }
        toast.success("Increment decision updated");
      } else {
        const { data: incEval, error: incError } = await supabase.from("increment_evaluations").insert({
          ...incrementEvalPayload,
          finalization_id: finalization.id,
          employee_id: finalization.employee_id,
          created_by: user.id,
        }).select().single();
        if (incError) throw incError;

        const { data: increment, error: incrError } = await supabase.from("salary_increments").insert({
          ...salaryIncrementPayload,
          user_id: finalization.employee_id,
          cycle_label: `Performance Review ${format(new Date(), "MMM yyyy")}`,
          approved_by: user.id,
        }).select().single();
        if (incrError) throw incrError;

        const { error: linkError } = await supabase.from("increment_evaluations").update({ salary_increment_id: increment.id }).eq("id", incEval.id);
        if (linkError) throw linkError;

        toast.success("Increment decided and applied to Salary Increments");
      }
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
        <DialogHeader><DialogTitle>{existing ? "Edit Increment Decision" : "Increment Evaluation"} — {employeeName}</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <div className="rounded-md bg-muted/40 p-3 text-xs">
            {SALARY_CATEGORY_LABEL[finalization.salary_category]} · {finalization.final_category} · Policy range{" "}
            <span className="font-mono">{finalization.recommended_min_pct}%–{finalization.recommended_max_pct}%</span> · Gross salary{" "}
            <span className="font-mono">{finalization.gross_salary.toLocaleString()}</span> BDT
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Section 1: Annual Increment</p>
            <div className="grid grid-cols-2 gap-2">
              {COMPANY_SCENARIOS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`rounded-md border p-2 text-left text-xs ${form.company_scenario === s.value ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => setForm((f) => ({ ...f, company_scenario: s.value, approved_increment_factor_pct: s.range?.max ?? 0 }))}
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
            <div className="mt-3">
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
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-sm mt-2 space-y-1">
              <p>Increment %: <span className="font-mono font-semibold">{basePct}%</span>{" "}
                · Amount: <span className="font-mono">{baseAmount.toLocaleString()}</span> BDT</p>
              <p>Gross Salary After Increment: <span className="font-mono">{grossAfterIncrement(finalization.gross_salary, baseAmount).toLocaleString()}</span> BDT</p>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Checkbox checked={form.retention_recommended} onCheckedChange={(c) => setForm((f) => ({ ...f, retention_recommended: !!c }))} />
              <p className="text-sm font-medium">Section 2: Recommend a Retention Increment</p>
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
                    <Input type="number" value={form.retention_amount}
                      onChange={(e) => setForm((f) => ({ ...f, retention_amount: e.target.value }))} />
                  </div>
                  <div>
                    <Label>OR Retention % of Basic</Label>
                    <Input type="number" value={form.retention_pct}
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
            <div className="rounded-md bg-muted/40 p-3 text-sm mt-3 space-y-1">
              <p>Increment: <span className="font-mono">{basePct}%</span> (<span className="font-mono">{baseAmount.toLocaleString()}</span> BDT)</p>
              <p>Retention: <span className="font-mono">{retentionPct}%</span> (<span className="font-mono">{retentionAmount.toLocaleString()}</span> BDT)</p>
              <p className="font-semibold">Final: <span className="font-mono">{totalPct}%</span> (<span className="font-mono">{totalAmount.toLocaleString()}</span> BDT)</p>
              <p>Gross Salary After Increment: <span className="font-mono">{grossAfter.toLocaleString()}</span> BDT</p>
            </div>
          </div>

          <div>
            <Label>Effective From (month the increment applies)</Label>
            <Input
              type="month"
              value={form.effective_from_month}
              onChange={(e) => setForm((f) => ({ ...f, effective_from_month: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? "Saving…" : existing ? "Save Changes" : "Decide Final Increment & Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PerformanceEvaluation;
