import { describe, expect, it } from "vitest";
import {
  breakSeconds,
  computeDailyTotals,
  expectedEndMinutes,
  isWorkingDay,
  netRequiredHours,
  standardDailyHours,
  workingDaysPerWeek,
} from "@/lib/workSchedule";

const day = (time: string) => new Date(`2026-09-06T${time}:00`);

describe("computeDailyTotals", () => {
  it("settles a 09:00-17:00 day as complete with no overtime", () => {
    const t = computeDailyTotals({ clockIn: day("09:00"), clockOut: day("17:00") });
    expect(t.grossHours).toBe(8);
    expect(t.totalHours).toBe(7);
    expect(t.overtimeHours).toBe(0);
    expect(t.shortfallHours).toBe(0);
  });

  it("counts overtime only past the 17:00 window", () => {
    const t = computeDailyTotals({ clockIn: day("09:00"), clockOut: day("18:00") });
    expect(t.totalHours).toBe(8);
    expect(t.overtimeHours).toBe(1);
    expect(t.shortfallHours).toBe(0);
  });

  it("reports a shortfall for an early finish", () => {
    const t = computeDailyTotals({ clockIn: day("09:00"), clockOut: day("15:00") });
    expect(t.totalHours).toBe(5);
    expect(t.overtimeHours).toBe(0);
    expect(t.shortfallHours).toBe(2);
  });

  it("honours a 9-hour employee override", () => {
    const t = computeDailyTotals({
      clockIn: day("09:00"),
      clockOut: day("18:00"),
      schedule: { standard_daily_hours: 9 },
    });
    expect(t.totalHours).toBe(8);
    expect(t.overtimeHours).toBe(0);
    expect(t.shortfallHours).toBe(0);
  });

  it("deducts a longer recorded break instead of the scheduled one", () => {
    const t = computeDailyTotals({
      clockIn: day("09:00"),
      clockOut: day("17:00"),
      breakMinutes: 90,
    });
    expect(t.breakMinutes).toBe(90);
    expect(t.totalHours).toBe(6.5);
    expect(t.overtimeHours).toBe(0);
    expect(t.shortfallHours).toBe(0.5);
  });

  it("returns an empty day for a missing or inverted clock-out", () => {
    expect(computeDailyTotals({ clockIn: day("09:00"), clockOut: null }).totalHours).toBe(0);
    expect(computeDailyTotals({ clockIn: day("18:00"), clockOut: day("09:00") }).totalHours).toBe(0);
  });
});

describe("break precision", () => {
  it("keeps sub-minute breaks instead of rounding them to zero", () => {
    expect(breakSeconds(day("13:00"), new Date("2026-09-06T13:00:45"))).toBe(45);
  });

  it("ignores an inverted break window", () => {
    expect(breakSeconds(day("13:30"), day("13:00"))).toBe(0);
  });
});

describe("schedule configuration", () => {
  it("defaults to an 8-hour window holding 7h of net work, 5 days a week", () => {
    expect(standardDailyHours(null)).toBe(8);
    expect(netRequiredHours(null)).toBe(7);
    expect(workingDaysPerWeek(null)).toBe(5);
  });

  it("treats a 9-hour window as 8h of net work", () => {
    expect(netRequiredHours({ standard_daily_hours: 9 })).toBe(8);
  });

  it("supports a 6-day working week", () => {
    const six = { working_days: [0, 1, 2, 3, 4, 6] };
    expect(workingDaysPerWeek(six)).toBe(6);
    expect(isWorkingDay("2026-09-12", six)).toBe(true); // Saturday
    expect(isWorkingDay("2026-09-11", six)).toBe(false); // Friday
  });

  it("derives the expected end time from the window, break included", () => {
    expect(expectedEndMinutes({ office_start_time: "09:00" })).toBe(17 * 60);
    expect(expectedEndMinutes({ office_start_time: "09:50" })).toBe(17 * 60 + 50);
    expect(expectedEndMinutes({ office_start_time: "09:00", standard_daily_hours: 9 })).toBe(
      18 * 60,
    );
  });
});
