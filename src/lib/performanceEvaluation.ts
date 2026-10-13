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
 * Section 6: the four final Performance Categories an evaluation's average
 * score resolves to (via categoryForAverage) — what each one means and the
 * behaviors expected at that level. Shown as the reference legend in the
 * Evaluate form, the View Answers popup and its PDF.
 */
export const PERFORMANCE_CATEGORY_GUIDE: { score: number; category: EvaluationCategory; description: string; behaviors: string[] }[] = [
  {
    score: 4,
    category: "Outstanding",
    description: "Exceptional performance exceeding expectations.",
    behaviors: [
      "Consistently exceeds targets and goals.",
      "Demonstrates leadership and innovation in the role.",
      "Highly proactive, often leading initiatives beyond their scope.",
      "Plays a critical role in team success and company growth.",
    ],
  },
  {
    score: 3,
    category: "Above Expectation",
    description: "Performance consistently meeting and occasionally exceeding expectations.",
    behaviors: [
      "Regularly meets and exceeds goals in their job.",
      "Contributes to team success with minimal supervision.",
      "Takes on additional responsibilities and is reliable.",
      "Actively seek opportunities for improvement.",
    ],
  },
  {
    score: 2,
    category: "Meet Expectation",
    description: "Performance meets the required standards and job expectations.",
    behaviors: [
      "Consistently meets job requirements and performs as expected.",
      "Follows company guidelines and completes tasks on time.",
      "Reliable, with consistent performance but limited initiative beyond assigned tasks.",
    ],
  },
  {
    score: 1,
    category: "Below Expectation",
    description: "Performance does not meet the required standards.",
    behaviors: [
      "Fails to meet set goals and deadlines.",
      "Requires frequent supervision or guidance.",
      "Shows a lack of initiative and contributes minimally to team success.",
      "Needs improvement in critical job-related skills.",
    ],
  },
];

export type CriterionScore = {
  section: string;
  criterion: string;
  score: number;
  comment: string;
};

export type EvaluationCategory = "Outstanding" | "Above Expectation" | "Meet Expectation" | "Below Expectation";

/** Section 6 thresholds, applied to an average score out of 4 — admin-editable via performance_evaluation_settings. */
export type CategoryThresholds = { outstanding: number; above: number; meet: number };
export const DEFAULT_CATEGORY_THRESHOLDS: CategoryThresholds = { outstanding: 3.6, above: 2.8, meet: 2.0 };

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

/** Section 6A: Annual Increment Range Table (Policy Reference) — % range by salary category x performance category. */
const INCREMENT_POLICY: Record<SalaryCategory, Record<EvaluationCategory, IncrementRange>> = {
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

export const recommendedIncrementRange = (salaryCategory: SalaryCategory, performanceCategory: EvaluationCategory): IncrementRange =>
  INCREMENT_POLICY[salaryCategory][performanceCategory];

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
}) {
  const { employeeName, employeeDesignation, scores, totalScore, criteriaCount, averageScore, category, justification, submittedAt } = args;
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
  doc.text(`Total Score: ${totalScore} / ${criteriaCount * 4}`, left, y);
  y += 16;
  doc.text(`Average Score: ${averageScore} / 4`, left, y);
  y += 16;
  doc.text(`Category: ${category}`, left, y);
  y += 24;

  // Performance Category legend, same as the View Answers popup's table.
  ensureSpace(20);
  doc.setFontSize(11);
  doc.text("Performance Category", left, y);
  y += 16;
  const scoreCol = left;
  const catCol = left + 34;
  const descCol = left + 110;
  const behaviorCol = left + 250;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Score", scoreCol, y);
  doc.text("Category", catCol, y);
  doc.text("Description", descCol, y);
  doc.text("Expected Contributions and Behaviors", behaviorCol, y);
  doc.setFont("helvetica", "normal");
  y += 12;
  doc.setDrawColor(210);
  doc.line(left, y - 9, right, y - 9);
  PERFORMANCE_CATEGORY_GUIDE.forEach((c) => {
    const descLines = doc.splitTextToSize(c.description, behaviorCol - descCol - 8);
    const behaviorLines = c.behaviors.flatMap((b) => doc.splitTextToSize(`- ${b}`, right - behaviorCol));
    const rowLines = Math.max(1, descLines.length, behaviorLines.length);
    ensureSpace(rowLines * 11 + 4);
    doc.text(String(c.score), scoreCol, y);
    doc.text(c.category, catCol, y);
    doc.text(descLines, descCol, y);
    doc.text(behaviorLines, behaviorCol, y);
    y += rowLines * 11 + 6;
  });
  y += 10;

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
      doc.text(`${answer?.score ?? "—"} / 4`, right, y, { align: "right" });
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
