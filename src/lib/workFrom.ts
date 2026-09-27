export const WORK_FROM_OPTIONS = ["Office", "Home", "Field"] as const;
export type WorkFrom = (typeof WORK_FROM_OPTIONS)[number];
export const DEFAULT_WORK_FROM: WorkFrom = "Office";
