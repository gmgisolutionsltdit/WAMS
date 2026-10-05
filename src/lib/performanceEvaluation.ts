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

export type CriterionScore = {
  section: string;
  criterion: string;
  score: number;
  comment: string;
};

export type EvaluationCategory = "Outstanding" | "Above Expectation" | "Meet Expectation" | "Below Expectation";

/** Section 6 thresholds, applied to an average score out of 5. */
export const categoryForAverage = (average: number): EvaluationCategory => {
  if (average >= 4.5) return "Outstanding";
  if (average >= 3.5) return "Above Expectation";
  if (average >= 2.5) return "Meet Expectation";
  return "Below Expectation";
};

export const CATEGORY_BADGE_CLASS: Record<EvaluationCategory, string> = {
  "Outstanding": "bg-success text-success-foreground hover:bg-success/90",
  "Above Expectation": "bg-lime-500 text-white border-lime-500",
  "Meet Expectation": "bg-primary/15 text-primary border-primary/30",
  "Below Expectation": "bg-destructive/15 text-destructive border-destructive/30",
};

/** Section 5: total and average score from this evaluator's 14 criterion scores. */
export const summarizeScores = (scores: CriterionScore[]) => {
  const total = scores.reduce((sum, s) => sum + (Number(s.score) || 0), 0);
  const average = scores.length ? Math.round((total / scores.length) * 100) / 100 : 0;
  return { total, average, category: categoryForAverage(average) };
};

/** Final Section 6 category when an employee has multiple evaluators, combined via the admin-assigned weight on each. */
export const weightedFinalCategory = (evaluations: { average_score: number; weight: number }[]): {
  weightedAverage: number;
  category: EvaluationCategory;
} | null => {
  const totalWeight = evaluations.reduce((sum, e) => sum + (Number(e.weight) || 0), 0);
  if (totalWeight <= 0) return null;
  const weightedSum = evaluations.reduce((sum, e) => sum + (Number(e.average_score) || 0) * (Number(e.weight) || 0), 0);
  const weightedAverage = Math.round((weightedSum / totalWeight) * 100) / 100;
  return { weightedAverage, category: categoryForAverage(weightedAverage) };
};
