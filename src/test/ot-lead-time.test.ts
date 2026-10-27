import { describe, expect, it } from "vitest";
import { violatesOTLeadTime, OT_MIN_LEAD_HOURS } from "@/lib/dateRules";

const now = new Date("2026-09-10T12:00:00");
const dateISO = "2026-09-10";

describe("OT lead-time rule (apply at least 3h before a planned future start)", () => {
  it("blocks a start time only 10 minutes away", () => {
    expect(violatesOTLeadTime(dateISO, "12:10", now)).toBe(true);
  });

  it(`blocks a start time just under ${OT_MIN_LEAD_HOURS}h away`, () => {
    expect(violatesOTLeadTime(dateISO, "14:59", now)).toBe(true);
  });

  it(`allows a start time exactly ${OT_MIN_LEAD_HOURS}h away`, () => {
    expect(violatesOTLeadTime(dateISO, "15:00", now)).toBe(false);
  });

  it("allows a start time well in the future", () => {
    expect(violatesOTLeadTime(dateISO, "18:00", now)).toBe(false);
  });

  it("does not block a start time already in the past (retroactive logging)", () => {
    expect(violatesOTLeadTime(dateISO, "09:00", now)).toBe(false);
  });

  it("is a no-op without both a date and a time", () => {
    expect(violatesOTLeadTime("", "12:10", now)).toBe(false);
    expect(violatesOTLeadTime(dateISO, "", now)).toBe(false);
  });
});
