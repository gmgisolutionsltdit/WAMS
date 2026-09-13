import { describe, expect, it } from "vitest";
import { classifyDay, DEFAULT_WEEKEND_DAYS } from "@/lib/workSchedule";

// 2026-09-11 is a Friday, 2026-09-12 a Saturday, 2026-09-13 a Sunday.
const holidays = new Map([["2026-09-16", "Victory Day"]]);

describe("classifyDay", () => {
  it("flags a declared holiday by name", () => {
    const d = classifyDay("2026-09-16", holidays, DEFAULT_WEEKEND_DAYS);
    expect(d.nonWorking).toBe(true);
    expect(d.reason).toBe("holiday");
    expect(d.holidayName).toBe("Victory Day");
  });

  it("flags the configured weekend", () => {
    expect(classifyDay("2026-09-11", holidays).reason).toBe("weekend");
    expect(classifyDay("2026-09-12", holidays).reason).toBe("weekend");
  });

  it("treats a normal working day as working", () => {
    const d = classifyDay("2026-09-13", holidays);
    expect(d.nonWorking).toBe(false);
    expect(d.reason).toBe(null);
  });

  it("honours a custom weekend, so Sunday can be a working day", () => {
    expect(classifyDay("2026-09-13", holidays, [0, 6]).reason).toBe("weekend");
    expect(classifyDay("2026-09-11", holidays, [0, 6]).nonWorking).toBe(false);
  });

  it("prefers holiday over weekend when a holiday lands on one", () => {
    const withWeekendHoliday = new Map([["2026-09-11", "Eid"]]);
    expect(classifyDay("2026-09-11", withWeekendHoliday).reason).toBe("holiday");
  });

  it("accepts a plain Set of dates without names", () => {
    const d = classifyDay("2026-09-16", new Set(["2026-09-16"]));
    expect(d.nonWorking).toBe(true);
    expect(d.reason).toBe("holiday");
    expect(d.holidayName).toBe(null);
  });
});
