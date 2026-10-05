/** Section 1 of the Increment Evaluation Form: company performance scenario and its approved increment-factor range. */
export type CompanyScenario = "strong" | "average" | "weak" | "freeze";

export const COMPANY_SCENARIOS: { value: CompanyScenario; label: string; detail: string; range: { min: number; max: number } | null }[] = [
  { value: "strong", label: "Strong", detail: "Financial backup 2 years+", range: { min: 80, max: 100 } },
  { value: "average", label: "Average", detail: "Financial backup 1 year+", range: { min: 60, max: 80 } },
  { value: "weak", label: "Weak", detail: "Financial backup below 1 year", range: { min: 0, max: 60 } },
  { value: "freeze", label: "Increment Freeze", detail: "Final increment = 0%", range: null },
];

export const companyScenario = (value: CompanyScenario) =>
  COMPANY_SCENARIOS.find((s) => s.value === value) ?? COMPANY_SCENARIOS[0];

/** Section 2: Final Annual Increment % = (Recommended % × Approved Increment Factor %) ÷ 100. */
export const finalIncrementPct = (averageRecommendedPct: number, approvedFactorPct: number, scenario: CompanyScenario): number => {
  if (scenario === "freeze") return 0;
  return Math.round(((averageRecommendedPct * approvedFactorPct) / 100) * 100) / 100;
};

/** Annual increment is applied only on Basic Salary. Basic = 50% of gross, both before and after the increment (new Basic = new Gross / 2). */
export const basicFromGross = (gross: number): number => Math.round(gross * 0.5 * 100) / 100;

/** Increment % applied to Basic Salary, converted to a BDT amount. */
export const incrementAmountFromBasic = (basic: number, pct: number): number =>
  Math.round(((basic * pct) / 100) * 100) / 100;

export const grossAfterIncrement = (grossBefore: number, incrementAmount: number): number =>
  Math.round((grossBefore + incrementAmount) * 100) / 100;

export const RETENTION_CHECKLIST_ITEMS = [
  "Employee is in a key/critical role essential to operations",
  "Employee holds leadership responsibilities or strong leadership contribution",
  "Employee shows exceptional or consistently high performance",
  "Organizational restructuring / growth requires retention support",
  "Promotion or role expansion",
  "Annual increment adjustment required for fairness",
];

export const RETENTION_PERIODS = ["3 Months", "6 Months", "1 Year"];
