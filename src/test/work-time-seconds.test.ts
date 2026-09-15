import { describe, expect, it } from "vitest";
import { sessionWorkedSeconds, mergeDailySessions } from "@/lib/attendance";
import { fmtHMS } from "@/lib/time";

describe("Work Time keeps real seconds instead of rounding through total_hours", () => {
  it("computes from the raw clock span even when total_hours is coarsely rounded", () => {
    const session = {
      id: "1",
      user_id: "u1",
      date: "2026-09-10",
      clock_in: "2026-09-10T09:00:00Z",
      // 7h 0m 23s span - not representable exactly at 2-decimal hours.
      clock_out: "2026-09-10T16:00:23Z",
      total_hours: 7, // what the DB actually stores, rounded
      break_minutes: 0,
    };
    expect(sessionWorkedSeconds(session)).toBe(7 * 3600 + 23);
  });

  it("shows real seconds on the merged day's Work Time", () => {
    const [day] = mergeDailySessions([
      {
        id: "1",
        user_id: "u1",
        date: "2026-09-10",
        clock_in: "2026-09-10T09:00:00Z",
        clock_out: "2026-09-10T17:00:47Z",
        total_hours: 8,
        break_minutes: 0,
      },
    ]);
    expect(fmtHMS(day.workedSeconds)).toBe("08:00:47");
  });

  it("still deducts the break precisely", () => {
    const session = {
      id: "1",
      user_id: "u1",
      date: "2026-09-10",
      clock_in: "2026-09-10T09:00:00Z",
      clock_out: "2026-09-10T17:00:00Z",
      total_hours: 7,
      break_minutes: 30.5,
    };
    expect(sessionWorkedSeconds(session)).toBe(8 * 3600 - 30.5 * 60);
  });
});
