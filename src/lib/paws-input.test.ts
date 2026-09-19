import { describe, expect, it } from "vitest";
import { normalizePawsFileInput } from "./paws-input";

describe("normalizePawsFileInput", () => {
  it("accepts a flat date map", () => {
    const out = normalizePawsFileInput(
      {
        "2026-09-28": { title: "Assembly", details: ["Theater"], week: "PAWS 9/28-10/2" },
        "2026-09-29": { title: "Advisory", details: [] },
      },
      "PAWS 9/28-10/2",
    );
    expect(out.get("2026-09-28")).toEqual({
      title: "Assembly",
      details: ["Theater"],
      week: "PAWS 9/28-10/2",
    });
    expect(out.get("2026-09-29")).toEqual({
      title: "Advisory",
      details: [],
      week: "PAWS 9/28-10/2",
    });
  });

  it("accepts the { week, days } wrapper and applies the week", () => {
    const out = normalizePawsFileInput({
      week: "PAWS 9/28-10/2",
      days: {
        "2026-09-28": { title: "Assembly", details: ["Theater"] },
      },
    });
    expect(out.get("2026-09-28")).toEqual({
      title: "Assembly",
      details: ["Theater"],
      week: "PAWS 9/28-10/2",
    });
  });

  it("rejects bad dates, blank titles, and non-array details with one error", () => {
    expect(() =>
      normalizePawsFileInput({
        "09/28/2026": { title: "wrong shape" },
        "2026-09-29": { title: "   " },
        "2026-09-30": { title: "Ok", details: "Theater" },
      }),
    ).toThrow(/PAWS file invalid/);
  });

  it("rejects impossible dates and weekends", () => {
    expect(() =>
      normalizePawsFileInput({ "2026-02-30": { title: "Assembly" } }),
    ).toThrow(/not a real calendar date/);
    // 2026-09-26 is a Saturday.
    expect(() =>
      normalizePawsFileInput({ "2026-09-26": { title: "Assembly" } }),
    ).toThrow(/weekend/);
  });

  it("rejects overlong values instead of truncating them", () => {
    const longTitle = "A".repeat(121);
    expect(() =>
      normalizePawsFileInput({ "2026-09-28": { title: longTitle } }),
    ).toThrow(/max 120/);
    expect(() =>
      normalizePawsFileInput({ "2026-09-28": { title: "Ok", details: ["B".repeat(121)] } }),
    ).toThrow(/max 120/);
    expect(() =>
      normalizePawsFileInput({ "2026-09-28": { title: "Ok", week: "W".repeat(61) } }),
    ).toThrow(/max 60/);
    expect(() => normalizePawsFileInput({}, "W".repeat(61))).toThrow(/max 60/);
  });

  it("rejects empty and oversized payloads", () => {
    expect(() => normalizePawsFileInput({})).toThrow(/no dates found/);
    expect(() => normalizePawsFileInput(null)).toThrow(/must be a JSON object/);
  });
});
