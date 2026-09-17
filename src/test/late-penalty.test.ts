import { describe, expect, it } from "vitest";
import { mergeDailySessions } from "@/lib/attendance";

const session = (over: Record<string, unknown>) => ({
  id: "1",
  user_id: "u1",
  date: "2026-09-10",
  clock_in: "2026-09-10T09:00:00Z",
  clock_out: "2026-09-10T17:00:00Z",
  total_hours: 8,
  ...over,
});

describe("late-arrival penalty recorded at clock-in", () => {
  it("carries the penalty fixed on the first session of the day", () => {
    const [day] = mergeDailySessions([
      session({ clock_in: "2026-09-10T09:30:00Z", late_minutes: 30, penalty_minutes: 160, penalty_reviewed: true }),
    ]);
    expect(day.lateMinutes).toBe(30);
    expect(day.penaltyMinutes).toBe(160);
    expect(day.penaltyReviewed).toBe(true);
    expect(day.approvedStartTime).toBeNull();
  });

  it("reflects an approved waiver via approved_start_time", () => {
    const [day] = mergeDailySessions([
      session({
        clock_in: "2026-09-10T09:30:00Z",
        late_minutes: 30,
        penalty_minutes: 0,
        penalty_reviewed: true,
        approved_start_time: "2026-09-10T09:00:00Z",
      }),
    ]);
    expect(day.penaltyMinutes).toBe(0);
    expect(day.approvedStartTime).toBe("2026-09-10T09:00:00Z");
    expect(day.approvedStartTime).not.toBe(day.firstIn);
  });

  it("leaves approvedStartTime null when nothing has been approved yet", () => {
    const [day] = mergeDailySessions([session({ clock_in: "2026-09-10T09:00:00Z" })]);
    expect(day.approvedStartTime).toBeNull();
    expect(day.penaltyReviewed).toBe(false);
  });

  it("defaults to no penalty for an on-time day", () => {
    const [day] = mergeDailySessions([session({ late_minutes: 0, penalty_minutes: 0 })]);
    expect(day.lateMinutes).toBe(0);
    expect(day.penaltyMinutes).toBe(0);
  });

  it("takes the penalty from whichever session is earliest, not the last inserted", () => {
    const [day] = mergeDailySessions([
      session({ id: "2", clock_in: "2026-09-10T13:00:00Z", late_minutes: 0, penalty_minutes: 0 }),
      session({ id: "1", clock_in: "2026-09-10T09:20:00Z", late_minutes: 20, penalty_minutes: 160 }),
    ]);
    expect(day.firstIn).toBe("2026-09-10T09:20:00Z");
    expect(day.penaltyMinutes).toBe(160);
  });
});
