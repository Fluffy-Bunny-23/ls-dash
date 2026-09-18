import { describe, expect, it } from "vitest";
import { getPaws, pawsSummary } from "./paws";

describe("paws week 9/21-9/25", () => {
  it("covers each weekday with the posted headline", () => {
    expect(getPaws("2026-09-21")?.title).toBe("Academic Advisory");
    expect(getPaws("2026-09-22")?.title).toBe("Assembly");
    expect(getPaws("2026-09-23")?.title).toBe("Advisory / GSL Prep");
    expect(getPaws("2026-09-24")?.title).toBe("All-School Study Hall");
    expect(getPaws("2026-09-25")?.title).toBe("Advisory");
  });

  it("returns null outside the known week", () => {
    expect(getPaws("2026-09-18")).toBeNull();
    expect(getPaws("2026-09-28")).toBeNull();
  });

  it("summarizes for month cells", () => {
    expect(pawsSummary(getPaws("2026-09-22")!)).toBe("PAWS: Assembly");
  });
});
