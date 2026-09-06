import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyIcalSummary,
  expandOccurrences,
  parseIcalEvents,
} from "./ical";

const SAMPLE = readFileSync(join(__dirname, "__fixtures__", "calendar_436.sample.ics"), "utf8");

describe("classifyIcalSummary", () => {
  it("parses plain A/B/C days", () => {
    expect(classifyIcalSummary("MS A day")).toEqual({ abc: "A", isSpecial: false, specialLabel: null });
    expect(classifyIcalSummary("MS B day")).toEqual({ abc: "B", isSpecial: false, specialLabel: null });
    expect(classifyIcalSummary("MS C day")).toEqual({ abc: "C", isSpecial: false, specialLabel: null });
  });
  it("parses special letter days, keeping the raw label", () => {
    expect(classifyIcalSummary("MS special B day schedule")).toEqual({
      abc: "B",
      isSpecial: true,
      specialLabel: "MS special B day schedule",
    });
    expect(classifyIcalSummary("MS special A day schedule").abc).toBe("A");
    expect(classifyIcalSummary("MS special C day schedule").abc).toBe("C");
  });
  it("nulls ABC on the no-schedule override", () => {
    expect(classifyIcalSummary("MS sports day (no ABC schedule today)")).toEqual({
      abc: null,
      isSpecial: true,
      specialLabel: "MS sports day (no ABC schedule today)",
    });
  });
  it("treats special schedules without a letter as special with null ABC", () => {
    expect(classifyIcalSummary("MS special schedule (first day of school)")).toEqual({
      abc: null,
      isSpecial: true,
      specialLabel: "MS special schedule (first day of school)",
    });
    expect(classifyIcalSummary("MS Field Day (special schedule)")).toEqual({
      abc: null,
      isSpecial: true,
      specialLabel: "MS Field Day (special schedule)",
    });
  });
  it("does not mistake other words for ABC letters", () => {
    // 'S' in "sports"/"schedule"/"school" and 'F' in "Field" must not match [ABC].
    expect(classifyIcalSummary("MS sports day").abc).toBeNull();
    expect(classifyIcalSummary("MS Field Day").abc).toBeNull();
  });
});

describe("feed parsing on the saved live snapshot", () => {
  it("finds all 160 events", () => {
    expect(parseIcalEvents(SAMPLE)).toHaveLength(160);
  });
  it("maps known dates", () => {
    const byDay = expandOccurrences(parseIcalEvents(SAMPLE));
    expect(byDay.get("2026-09-08")).toMatchObject({ abc: "A", isSpecial: false });
    expect(byDay.get("2026-09-09")).toMatchObject({ abc: "B", isSpecial: false });
    expect(byDay.get("2026-09-10")).toMatchObject({ abc: "C", isSpecial: false });
    expect(byDay.get("2026-09-02")).toMatchObject({ abc: null, isSpecial: true });
    // Labor Day Monday is absent from the feed => caller treats as no-school.
    expect(byDay.get("2026-09-07")).toBeUndefined();
  });
});

describe("ranged-event support (DTEND/DURATION)", () => {
  const ranged = `BEGIN:VCALENDAR\r
BEGIN:VEVENT\r
UID:break-1\r
DTSTART;VALUE=DATE:20261125\r
DTEND;VALUE=DATE:20261130\r
SUMMARY:Thanksgiving Break\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:dur-1\r
DTSTART;VALUE=DATE:20261224\r
DURATION:P3D\r
SUMMARY:Winter Break\r
END:VEVENT\r
END:VCALENDAR\r
`;
  it("expands exclusive ranges per day", () => {
    const byDay = expandOccurrences(parseIcalEvents(ranged));
    expect([...byDay.keys()].sort()).toEqual([
      "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29",
      "2026-12-24", "2026-12-25", "2026-12-26",
    ]);
  });
});
