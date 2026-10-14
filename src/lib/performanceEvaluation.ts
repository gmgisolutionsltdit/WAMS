import jsPDF from "jspdf";
import { format } from "date-fns";

/** Section 4 of the Employee Performance Evaluation Form: 5 scored categories, 14 criteria total, each scored 1-5. */
export const EVALUATION_SECTIONS: { key: string; title: string; criteria: string[] }[] = [
  {
    key: "A",
    title: "Performance Against Targets and Deliverables",
    criteria: [
      "Consistently meets assigned goals / targets",
      "Completes tasks on time with quality",
      "Maintains accuracy and accountability",
    ],
  },
  {
    key: "B",
    title: "Work Behavior and Professionalism",
    criteria: [
      "Works independently with minimal supervision",
      "Reliability and discipline (attendance, punctuality, commitment)",
      "Follows organizational policies and guidelines",
    ],
  },
  {
    key: "C",
    title: "Initiative, Proactiveness and Improvement",
    criteria: [
      "Takes initiative beyond assigned responsibilities",
      "Actively seeks improvement opportunities",
      "Demonstrates creativity / innovation",
    ],
  },
  {
    key: "D",
    title: "Leadership and Team Contribution",
    criteria: [
      "Supports team success and collaboration",
      "Demonstrates leadership in role (formal/informal)",
      "Mentors / guides colleagues when needed",
    ],
  },
  {
    key: "E",
    title: "Overall Impact on Organization Growth",
    criteria: [
      "Plays a critical role in organizational success",
      "Contributes significantly to project / organizational outcomes",
    ],
  },
];

export const TOTAL_CRITERIA_COUNT = EVALUATION_SECTIONS.reduce((n, s) => n + s.criteria.length, 0);

/**
 * What each 1-5 per-criterion score means — the reference legend shown in
 * the Evaluate form, the View Answers popup and its PDF. Admin-editable via
 * performance_evaluation_settings; values only (5 rows stay fixed).
 */
export type ScoreScaleRow = { score: number; label: string; description: string };

export const DEFAULT_SCORE_SCALE: ScoreScaleRow[] = [
  { score: 1, label: "Poor", description: "Consistently fails to meet expectations" },
  { score: 2, label: "Below Average", description: "Occasionally meets expectations; needs improvement" },
  { score: 3, label: "Satisfactory", description: "Meets expectations consistently" },
  { score: 4, label: "Good", description: "Frequently exceeds expectations" },
  { score: 5, label: "Excellent", description: "Consistently exceeds expectations" },
];

export type CriterionScore = {
  section: string;
  criterion: string;
  score: number;
  comment: string;
};

export type EvaluationCategory = "Outstanding" | "Above Expectation" | "Meet Expectation" | "Below Expectation";

/** Section 6 thresholds, applied to an average score out of 5 — admin-editable via performance_evaluation_settings. */
export type CategoryThresholds = { outstanding: number; above: number; meet: number };
export const DEFAULT_CATEGORY_THRESHOLDS: CategoryThresholds = { outstanding: 4.5, above: 3.5, meet: 2.5 };

export const categoryForAverage = (average: number, thresholds: CategoryThresholds = DEFAULT_CATEGORY_THRESHOLDS): EvaluationCategory => {
  if (average >= thresholds.outstanding) return "Outstanding";
  if (average >= thresholds.above) return "Above Expectation";
  if (average >= thresholds.meet) return "Meet Expectation";
  return "Below Expectation";
};

export const CATEGORY_BADGE_CLASS: Record<EvaluationCategory, string> = {
  "Outstanding": "bg-success text-success-foreground hover:bg-success/90",
  "Above Expectation": "bg-lime-500 text-white border-lime-500",
  "Meet Expectation": "bg-primary/15 text-primary border-primary/30",
  "Below Expectation": "bg-destructive/15 text-destructive border-destructive/30",
};

/** Section 5: total and average score from this evaluator's 14 criterion scores. */
export const summarizeScores = (scores: CriterionScore[], thresholds: CategoryThresholds = DEFAULT_CATEGORY_THRESHOLDS) => {
  const total = scores.reduce((sum, s) => sum + (Number(s.score) || 0), 0);
  const average = scores.length ? Math.round((total / scores.length) * 100) / 100 : 0;
  return { total, average, category: categoryForAverage(average, thresholds) };
};

/** Section 3: Employee Category (Salary Range Based), from current gross salary (BDT) — bands are admin-editable via performance_evaluation_settings. */
export type SalaryCategory = "A" | "B" | "C";
export type SalaryBands = { bMin: number; aMin: number };
export const DEFAULT_SALARY_BANDS: SalaryBands = { bMin: 20000, aMin: 40000 };

export const salaryCategoryLabel = (category: SalaryCategory, bands: SalaryBands = DEFAULT_SALARY_BANDS): string => {
  if (category === "A") return `Category A (Above ${bands.aMin.toLocaleString()} BDT)`;
  if (category === "B") return `Category B (Above ${bands.bMin.toLocaleString()} to ${bands.aMin.toLocaleString()} BDT)`;
  return `Category C (Up to ${bands.bMin.toLocaleString()} BDT)`;
};

/** A gross above the top band is still treated as Category A. */
export const salaryCategoryForGross = (gross: number, bands: SalaryBands = DEFAULT_SALARY_BANDS): SalaryCategory => {
  if (gross > bands.aMin) return "A";
  if (gross > bands.bMin) return "B";
  return "C";
};

export type IncrementRange = { min: number; max: number };
export type IncrementPolicy = Record<SalaryCategory, Record<EvaluationCategory, IncrementRange>>;

/** Section 6A: Annual Increment Range Table (Policy Reference) — % range by salary category x performance category. */
export const DEFAULT_INCREMENT_POLICY: IncrementPolicy = {
  A: {
    "Outstanding": { min: 20, max: 30 },
    "Above Expectation": { min: 10, max: 20 },
    "Meet Expectation": { min: 5, max: 10 },
    "Below Expectation": { min: 0, max: 5 },
  },
  B: {
    "Outstanding": { min: 20, max: 40 },
    "Above Expectation": { min: 20, max: 25 },
    "Meet Expectation": { min: 10, max: 20 },
    "Below Expectation": { min: 0, max: 10 },
  },
  C: {
    "Outstanding": { min: 40, max: 50 },
    "Above Expectation": { min: 30, max: 40 },
    "Meet Expectation": { min: 20, max: 30 },
    "Below Expectation": { min: 0, max: 20 },
  },
};

export const recommendedIncrementRange = (
  salaryCategory: SalaryCategory,
  performanceCategory: EvaluationCategory,
  policy: IncrementPolicy = DEFAULT_INCREMENT_POLICY,
): IncrementRange => policy[salaryCategory][performanceCategory];

/** "Above 20 to 30%" (min > 0) or "0 to 5% or freeze" (min = 0, i.e. Below Expectation) — the policy table's own wording. */
export const formatIncrementRange = (range: IncrementRange): string =>
  range.min > 0 ? `Above ${range.min} to ${range.max}%` : `0 to ${range.max}% or freeze`;

/** Final Section 6 category when an employee has multiple evaluators, combined via the admin-assigned weight on each. */
export const weightedFinalCategory = (
  evaluations: { average_score: number; weight: number }[],
  thresholds: CategoryThresholds = DEFAULT_CATEGORY_THRESHOLDS,
): {
  weightedAverage: number;
  category: EvaluationCategory;
} | null => {
  const totalWeight = evaluations.reduce((sum, e) => sum + (Number(e.weight) || 0), 0);
  if (totalWeight <= 0) return null;
  const weightedSum = evaluations.reduce((sum, e) => sum + (Number(e.average_score) || 0) * (Number(e.weight) || 0), 0);
  const weightedAverage = Math.round((weightedSum / totalWeight) * 100) / 100;
  return { weightedAverage, category: categoryForAverage(weightedAverage, thresholds) };
};

/**
 * The "View Answers" popup's contents as a downloadable PDF — deliberately
 * takes no evaluator name/identifier, only the employee being evaluated
 * (name + designation), the scored criteria, comments, justification and
 * summary — the evaluator stays anonymous.
 */
export function downloadEvaluationAnswersPDF(args: {
  employeeName: string;
  employeeDesignation?: string | null;
  scores: CriterionScore[];
  totalScore: number;
  criteriaCount: number;
  averageScore: number;
  category: EvaluationCategory;
  justification: string;
  submittedAt: string;
  companyName?: string;
  scoreScale?: ScoreScaleRow[];
}) {
  const { employeeName, employeeDesignation, scores, totalScore, criteriaCount, averageScore, category, justification, submittedAt } = args;
  const scoreScale = args.scoreScale || DEFAULT_SCORE_SCALE;
  const company = args.companyName || "Workforce & Attendance Management System (WAMS)";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48;
  const right = 555;
  let y = 56;

  const ensureSpace = (needed: number) => {
    if (y + needed > 800) {
      doc.addPage();
      y = 56;
    }
  };

  doc.setFontSize(18);
  doc.text(company, left, y);
  y += 22;
  doc.setFontSize(13);
  doc.text("Performance Evaluation — Answers", left, y);
  y += 20;
  doc.setFontSize(10);
  doc.text(`Employee: ${employeeName}`, left, y);
  y += 16;
  doc.text(`Designation: ${employeeDesignation || "—"}`, left, y);
  y += 16;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Submitted: ${format(new Date(submittedAt), "d MMMM yyyy")}`, left, y);
  doc.setTextColor(0);
  y += 20;

  doc.setDrawColor(180);
  doc.line(left, y, right, y);
  y += 20;

  doc.setFontSize(11);
  doc.text(`Total Score: ${totalScore} / ${criteriaCount * 5}`, left, y);
  y += 16;
  doc.text(`Average Score: ${averageScore} / 5`, left, y);
  y += 16;
  doc.text(`Category: ${category}`, left, y);
  y += 24;

  // Score scale legend, same as the View Answers popup's table.
  ensureSpace(20 + scoreScale.length * 14);
  doc.setFontSize(11);
  doc.text("Score Scale", left, y);
  y += 16;
  const scoreCol = left;
  const meaningCol = left + 40;
  const descCol = left + 150;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Score", scoreCol, y);
  doc.text("Meaning", meaningCol, y);
  doc.text("Description", descCol, y);
  doc.setFont("helvetica", "normal");
  y += 12;
  doc.setDrawColor(210);
  doc.line(left, y - 9, right, y - 9);
  scoreScale.forEach((s) => {
    ensureSpace(14);
    doc.text(String(s.score), scoreCol, y);
    doc.text(s.label, meaningCol, y);
    const descLines = doc.splitTextToSize(s.description, right - descCol);
    doc.text(descLines, descCol, y);
    y += Math.max(12, descLines.length * 11);
  });
  y += 12;

  EVALUATION_SECTIONS.forEach((section) => {
    ensureSpace(30);
    doc.setFontSize(12);
    doc.text(`${section.key}. ${section.title}`, left, y);
    y += 18;
    section.criteria.forEach((criterion) => {
      const answer = scores.find((s) => s.criterion === criterion);
      ensureSpace(32);
      doc.setFontSize(9);
      const criterionLines = doc.splitTextToSize(criterion, 420);
      doc.text(criterionLines, left, y);
      doc.text(`${answer?.score ?? "—"} / 5`, right, y, { align: "right" });
      y += criterionLines.length * 11 + 2;
      if (answer?.comment) {
        doc.setTextColor(120);
        const commentLines = doc.splitTextToSize(answer.comment, 480);
        ensureSpace(commentLines.length * 11 + 4);
        doc.text(commentLines, left, y);
        doc.setTextColor(0);
        y += commentLines.length * 11 + 4;
      }
      y += 6;
    });
    y += 8;
  });

  ensureSpace(60);
  doc.setFontSize(11);
  doc.text("Justification", left, y);
  y += 16;
  doc.setFontSize(9);
  const justificationLines = doc.splitTextToSize(justification || "—", 500);
  ensureSpace(justificationLines.length * 12);
  doc.text(justificationLines, left, y);
  doc.save(`Performance_Evaluation_Answers_${new Date(submittedAt).toISOString().slice(0, 10)}.pdf`);
}
