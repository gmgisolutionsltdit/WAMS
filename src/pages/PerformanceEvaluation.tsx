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
import { ClipboardList, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  EVALUATION_SECTIONS, TOTAL_CRITERIA_COUNT, summarizeScores, weightedFinalCategory,
  CATEGORY_BADGE_CLASS, type CriterionScore, type EvaluationCategory,
} from "@/lib/performanceEvaluation";
import { notifyEmployee } from "@/lib/notifications";

type Profile = { id: string; full_name: string | null; email: string | null };

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

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm, setRequestForm] = useState(emptyRequestForm());
  const [saving, setSaving] = useState(false);

  const [answerRequest, setAnswerRequest] = useState<EvalRequest | null>(null);
  const [answerForm, setAnswerForm] = useState(emptyAnswerForm());

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
      const { data: pf } = await supabase.from("profiles").select("id, full_name, email").order("full_name");
      setProfiles((pf || []) as Profile[]);
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
            ) : employeeGroups.map((g) => (
              <div key={g.employeeId} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="font-medium">{profileMap[g.employeeId]?.full_name || profileMap[g.employeeId]?.email || "—"}</p>
                  {g.final && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Final weighted average: {g.final.weightedAverage} / 5</span>
                      <Badge className={CATEGORY_BADGE_CLASS[g.final.category]}>{g.final.category}</Badge>
                    </div>
                  )}
                </div>
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
            ))}
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
    </div>
  );
};

export default PerformanceEvaluation;
