import { describe, expect, it } from "vitest";
import { mergeDailySessions } from "@/lib/attendance";
import { fmtHMS } from "@/lib/time";

const session = (over: Record<string, unknown>) => ({
  id: "1",
  user_id: "u1",
  date: "2026-09-10",
  clock_in: "2026-09-10T09:00:00Z",
  clock_out: "2026-09-10T17:00:00Z",
  total_hours: 7,
  ...over,
});

describe("break seconds survive into attendance history", () => {
  it("renders the seconds of a sub-minute break", () => {
    const [day] = mergeDailySessions([session({ break_minutes: 0.75 })]);
    expect(day.breakSeconds).toBe(45);
    expect(fmtHMS(day.breakSeconds)).toBe("00:00:45");
  });

  it("keeps seconds on a break that is not a whole number of minutes", () => {
    const [day] = mergeDailySessions([session({ break_minutes: 61.5 })]);
    expect(fmtHMS(day.breakSeconds)).toBe("01:01:30");
  });

  it("sums several breaks across sessions without losing seconds", () => {
    const [day] = mergeDailySessions([
      session({ id: "1", break_minutes: 10.25 }),
      session({ id: "2", break_minutes: 5.5 }),
    ]);
    expect(fmtHMS(day.breakSeconds)).toBe("00:15:45");
  });

  it("still formats a whole-minute break correctly", () => {
    const [day] = mergeDailySessions([session({ break_minutes: 30 })]);
    expect(fmtHMS(day.breakSeconds)).toBe("00:30:00");
  });
});
