/** Section 1 of the Increment Evaluation Form: company performance scenario and its approved increment-factor range. */
export type CompanyScenario = "strong" | "average" | "weak" | "freeze";

/** Ranges are admin-editable via performance_evaluation_settings.company_scenario_ranges; label/detail/freeze stay fixed (same form, values-only editing). */
export type CompanyScenarioRange = { min: number; max: number };
export type CompanyScenarioRanges = Record<"strong" | "average" | "weak", CompanyScenarioRange>;

export const DEFAULT_COMPANY_SCENARIO_RANGES: CompanyScenarioRanges = {
  strong: { min: 80, max: 100 },
  average: { min: 60, max: 80 },
  weak: { min: 0, max: 60 },
};

const SCENARIO_META: { value: CompanyScenario; label: string; detail: string }[] = [
  { value: "strong", label: "Strong", detail: "Financial backup 2 years+" },
  { value: "average", label: "Average", detail: "Financial backup 1 year+" },
  { value: "weak", label: "Weak", detail: "Financial backup below 1 year" },
  { value: "freeze", label: "Increment Freeze", detail: "Final increment = 0%" },
];

export const companyScenarios = (
  ranges: CompanyScenarioRanges = DEFAULT_COMPANY_SCENARIO_RANGES,
): { value: CompanyScenario; label: string; detail: string; range: CompanyScenarioRange | null }[] =>
  SCENARIO_META.map((s) => ({ ...s, range: s.value === "freeze" ? null : ranges[s.value] }));

/** @deprecated use companyScenarios(ranges) so admin-edited ranges apply; kept for any caller that genuinely wants the hardcoded defaults. */
export const COMPANY_SCENARIOS = companyScenarios();

export const companyScenario = (value: CompanyScenario, ranges: CompanyScenarioRanges = DEFAULT_COMPANY_SCENARIO_RANGES) =>
  companyScenarios(ranges).find((s) => s.value === value) ?? companyScenarios(ranges)[0];

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

export const RETENTION_PERIODS = ["No period needed", "3 Months", "6 Months", "1 Year"];
