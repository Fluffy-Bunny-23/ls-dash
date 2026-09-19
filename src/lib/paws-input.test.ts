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

  it("rejects empty and oversized payloads", () => {
    expect(() => normalizePawsFileInput({})).toThrow(/no dates found/);
    expect(() => normalizePawsFileInput(null)).toThrow(/must be a JSON object/);
  });
});
