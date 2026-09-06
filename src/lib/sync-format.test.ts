import { describe, expect, it } from "vitest";
import { PLACEHOLDER_SUPPORT_EMAIL, supportEmail } from "./config";
import { formatUpdatedAgo, staleLine } from "./format";
import { datesToPrune, isMetaStale, mergeDay } from "./sync";
import { extractBreakfast, extractLunch } from "./sage";

const EMPTY_LUNCH = extractLunch(undefined);
const EMPTY_BREAKFAST = extractBreakfast(undefined);

describe("stale badge", () => {
  const now = Date.parse("2026-09-11T15:00:00Z");
  it("fresh sync shows plain 'updated X ago'", () => {
    const r = staleLine(
      { lastSuccess: "2026-09-11T12:00:00Z", lastAttempt: "2026-09-11T12:00:00Z", datesWritten: 43, errors: [] },
      now,
    );
    expect(r.stale).toBe(false);
    expect(r.text).toBe("updated 3 hours ago");
  });
  it("stale sync appends the support email", () => {
    const r = staleLine(
      { lastSuccess: "2026-09-09T12:00:00Z", lastAttempt: "2026-09-11T12:00:00Z", datesWritten: 43, errors: [] },
      now,
    );
    expect(r.stale).toBe(true);
    expect(r.text).toBe(
      `updated 2 days ago, please email ${supportEmail()} for help`,
    );
  });
  it("sync errors force the badge even when fresh", () => {
    const r = staleLine(
      { lastSuccess: new Date(now - 60_000).toISOString(), lastAttempt: new Date(now).toISOString(), datesWritten: 0, errors: ["ical 500"] },
      now,
    );
    expect(r.stale).toBe(true);
    expect(r.text).toContain(supportEmail());
    // Default placeholder (a deployment overrides it via env).
    expect(PLACEHOLDER_SUPPORT_EMAIL).toContain("@");
  });
  it("missing meta is stale", () => {
    expect(isMetaStale(null, now)).toBe(true);
    expect(staleLine(null, now).text).toContain("please email");
  });
  it("formats minutes and just-now", () => {
    expect(formatUpdatedAgo(new Date(now - 30_000).toISOString(), now)).toBe("updated just now");
    expect(formatUpdatedAgo(new Date(now - 5 * 60_000).toISOString(), now)).toBe("updated 5 minutes ago");
    expect(formatUpdatedAgo(new Date(now - 60 * 60_000).toISOString(), now)).toBe("updated 1 hour ago");
  });
});

describe("mergeDay", () => {
  it("missing weekday => no-school with the Sage closure label", () => {
    const day = mergeDay({
      dateId: "2026-09-07",
      occurrence: undefined,
      lunch: EMPTY_LUNCH,
      breakfast: EMPTY_BREAKFAST,
      sageEventLabel: "Labor Day",
      sageWeek: "09/06/2026",
    });
    expect(day).toMatchObject({
      date: "2026-09-07",
      dow: "Mon",
      abc: null,
      isSpecial: false,
      isNoSchool: true,
      noSchoolLabel: "Labor Day",
    });
  });
  it("missing weekday without a Sage label falls back to 'No school'", () => {
    const day = mergeDay({
      dateId: "2026-09-07",
      occurrence: undefined,
      lunch: EMPTY_LUNCH,
      breakfast: EMPTY_BREAKFAST,
      sageEventLabel: undefined,
      sageWeek: null,
    });
    expect(day.noSchoolLabel).toBe("No school");
  });
  it("ABC + special + entrées merge", () => {
    const day = mergeDay({
      dateId: "2026-09-09",
      occurrence: { abc: "B", isSpecial: true, specialLabel: "MS special B day schedule", uid: "u1" },
      lunch: { ...EMPTY_LUNCH, entree: "Fajita Chicken Breast" },
      breakfast: { ...EMPTY_BREAKFAST, entree: "Bacon" },
      sageEventLabel: undefined,
      sageWeek: "09/06/2026",
    });
    expect(day).toMatchObject({
      abc: "B",
      isSpecial: true,
      specialLabel: "MS special B day schedule",
      isNoSchool: false,
      noSchoolLabel: null,
    });
    expect(day.lunch.entree).toBe("Fajita Chicken Breast");
    expect(day.breakfast.entree).toBe("Bacon");
    expect(day.sources).toMatchObject({ icalUid: "u1", sageWeek: "09/06/2026" });
  });
});

describe("prune", () => {
  it("keeps the window, deletes outside ±30d", () => {
    expect(
      datesToPrune(["2026-08-11", "2026-08-12", "2026-09-11", "2026-10-11", "2026-10-12"], "2026-08-12", "2026-10-11"),
    ).toEqual(["2026-08-11", "2026-10-12"]);
  });
});
