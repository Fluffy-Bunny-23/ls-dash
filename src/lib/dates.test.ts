import { describe, expect, it } from "vitest";
import {
  advancePastWeekendForward,
  addDaysId,
  isWeekendId,
  monthWeekdayIds,
  rangeIds,
  retentionWindow,
  stepSchoolDay,
  todayPtId,
  toSageDate,
  weekAnchorsForWindow,
} from "./dates";

describe("weekend guard", () => {
  it("advances Sat/Sun forward to Monday", () => {
    // 2026-09-12 is a Saturday, 09-13 Sunday, 09-14 Monday.
    expect(advancePastWeekendForward("2026-09-12")).toBe("2026-09-14");
    expect(advancePastWeekendForward("2026-09-13")).toBe("2026-09-14");
    expect(advancePastWeekendForward("2026-09-14")).toBe("2026-09-14");
    expect(advancePastWeekendForward("2026-09-11")).toBe("2026-09-11"); // Friday stays
  });

  it("auto-advances Fri->Mon on next step", () => {
    expect(stepSchoolDay("2026-09-11", 1)).toBe("2026-09-14");
    expect(stepSchoolDay("2026-09-14", -1)).toBe("2026-09-11");
    expect(stepSchoolDay("2026-09-14", 1)).toBe("2026-09-15");
  });

  it("never lands on a weekend stepping either direction", () => {
    let id = "2026-09-01";
    for (let i = 0; i < 40; i++) {
      id = stepSchoolDay(id, 1);
      expect(isWeekendId(id)).toBe(false);
    }
    for (let i = 0; i < 40; i++) {
      id = stepSchoolDay(id, -1);
      expect(isWeekendId(id)).toBe(false);
    }
  });

  it("month grid contains weekdays only", () => {
    const ids = monthWeekdayIds("2026-09");
    expect(ids.length).toBeGreaterThan(15);
    for (const id of ids) expect(isWeekendId(id)).toBe(false);
    expect(ids).not.toContain("2026-09-12"); // Saturday
    expect(ids).not.toContain("2026-09-13"); // Sunday
    expect(ids).toContain("2026-09-07"); // Labor Day Monday still listed (no-school cell)
    expect(() => monthWeekdayIds("2026-13")).toThrow();
  });
});

describe("retention window", () => {
  it("is [today-30d, today+30d]", () => {
    const { startId, endId } = retentionWindow("2026-09-11");
    expect(startId).toBe("2026-08-12");
    expect(endId).toBe("2026-10-11");
    expect(rangeIds(startId, endId)).toHaveLength(61);
  });
});

describe("sage anchors", () => {
  it("covers the window with Monday anchors (Sunday buggy)", () => {
    const anchors = weekAnchorsForWindow("2026-08-12", "2026-10-11");
    expect(anchors[0]).toBe("08/10/2026"); // Monday anchor (Sage returns previous week on Sunday)
    expect(anchors[anchors.length - 1]).toBe("10/12/2026"); // Monday after Sunday end
    expect(anchors.length).toBe(10); // ~9 per the plan; exact count depends on alignment
    expect(toSageDate("2026-09-11")).toBe("09/11/2026");
  });
});

describe("todayPtId", () => {
  it("resolves America/Los_Angeles day across the UTC boundary", () => {
    // 2026-09-06T02:00:00Z is still Sept 5 in Los Angeles (PDT, UTC-7).
    expect(todayPtId(new Date("2026-09-06T02:00:00Z"))).toBe("2026-09-05");
    // 2026-09-06T08:00:00Z is Sept 6 01:00 PDT.
    expect(todayPtId(new Date("2026-09-06T08:00:00Z"))).toBe("2026-09-06");
  });
  it("addDaysId crosses month boundaries", () => {
    expect(addDaysId("2026-08-31", 1)).toBe("2026-09-01");
  });
});
