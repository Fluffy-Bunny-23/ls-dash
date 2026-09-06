import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  categoryNames,
  extractBreakfast,
  extractLunch,
  normalizeName,
  pickCellEntree,
  type SageWeek,
} from "./sage";

function loadHar(name: string): { weekly: SageWeek; monthly: Record<string, { label: string; date: string; meal: string }> } {
  const har = JSON.parse(readFileSync(join(process.cwd(), "ref", name), "utf8")) as {
    log: { entries: { request: { url: string }; response: { content: { text: string } } }[] };
  };
  let weekly: SageWeek = {};
  let monthly: Record<string, { label: string; date: string; meal: string }> = {};
  for (const e of har.log.entries) {
    const url = e.request.url;
    const body = JSON.parse(e.response.content.text) as SageWeek & Record<string, { label: string; date: string; meal: string }>;
    if (url.includes("getWeeklyMenuItems")) weekly = body as SageWeek;
    if (url.includes("getMonthlyEvents")) monthly = body;
  }
  return { weekly, monthly };
}

const lunch = loadHar("Sage.har");
const breakfast = loadHar("Sage-breakfast.har");

describe("lunch extractor (menuId 139455)", () => {
  it("extracts 09/09 entrée/special/feature", () => {
    const day = lunch.weekly["09/09/2026"];
    expect(Array.isArray(day)).toBe(false);
    const ex = extractLunch(day as Parameters<typeof extractLunch>[0]);
    expect(ex.entree).toBe("Fajita Chicken Breast");
    expect(ex.special).toBe("Taco Bar"); // whitespace-normalized from "Taco   Bar"
    expect(ex.feature).toBe("Cuisine from Mexico");
    expect(ex.soups).toEqual(["Creamy Tomato-Basil Soup"]);
    expect(ex.sides).toContain("Mexican Rice with Stewed Tomatoes");
    expect(pickCellEntree(ex)).toBe("Fajita Chicken Breast");
  });
  it("normalizes heavy whitespace (09/11)", () => {
    const ex = extractLunch(lunch.weekly["09/11/2026"] as Parameters<typeof extractLunch>[0]);
    expect(ex.entree).toBe("House-Roasted Cajun Chicken Thigh");
    expect(ex.special).toBe("Build-Your-Own Burger Bar");
    expect(ex.feature).toBe("Cantonese Cuisine From China");
  });
  it("treats empty days (Sun 09/06, Mon 09/07, Sat 09/12) as no service", () => {
    for (const k of ["09/06/2026", "09/07/2026", "09/12/2026"]) {
      const ex = extractLunch(lunch.weekly[k] as Parameters<typeof extractLunch>[0]);
      expect(ex).toMatchObject({ entree: null, special: null, feature: null, all: [] });
    }
  });
  it("month-cell fallback order: entrée -> special -> feature", () => {
    expect(pickCellEntree({ ...extractLunch(undefined), special: "S", feature: "F" })).toBe("S");
    expect(pickCellEntree({ ...extractLunch(undefined), feature: "F" })).toBe("F");
    expect(pickCellEntree(extractLunch(undefined))).toBeNull();
  });
  it("confirms Labor Day + event labels on the lunch monthly-events call", () => {
    const byDate = new Map(Object.values(lunch.monthly).map((e) => [e.date, e.label]));
    expect(byDate.get("2026-09-07")).toBe("Labor Day");
    expect(byDate.get("2026-09-15")).toBe("Chef Carved Brisket");
    expect(byDate.get("2026-09-24")).toBe("Educational Seasonings: An Abudance of Apples");
  });
});

describe("breakfast extractor (menuId 138778)", () => {
  it("extracts 09/09 breakfast entrée per the plan", () => {
    const ex = extractBreakfast(breakfast.weekly["09/09/2026"] as Parameters<typeof extractBreakfast>[0]);
    expect(ex.entree).toBe("Bacon");
    expect(ex.all).toContain("Sticky Rice");
    expect(ex.all).toContain("Pineapple Cup");
    expect(ex.all).toContain("Lions Cucumber Shakers");
  });
  it("excludes Morning/Afternoon Snack items sharing the same categories", () => {
    const ex = extractBreakfast(breakfast.weekly["09/09/2026"] as Parameters<typeof extractBreakfast>[0]);
    // Morning Snack entrées + Afternoon Snack specials must not leak into breakfast.
    expect(ex.all).not.toContain("Mozzarella Sticks with Marinara Sauce");
    const raw = breakfast.weekly["09/09/2026"] as Record<string, { meal?: string; name?: string }[]>;
    const snackNames = Object.values(raw)
      .flat()
      .filter((it) => it.meal === "Morning Snack" || it.meal === "Afternoon Snack")
      .map((it) => normalizeName(String(it.name)));
    expect(snackNames.length).toBeGreaterThan(0);
    for (const n of snackNames) expect(ex.all).not.toContain(n);
  });
  it("breakfast monthly events are empty (closures come from lunch menuId)", () => {
    expect(Object.keys(breakfast.monthly)).toHaveLength(0);
  });
});

describe("normalizeName", () => {
  it("collapses whitespace", () => {
    expect(normalizeName("Pho    Bar")).toBe("Pho Bar");
    expect(normalizeName("Build-Your-Own Burger              Bar")).toBe("Build-Your-Own Burger Bar");
  });
  it("categoryNames filters by served meal", () => {
    const day = breakfast.weekly["09/09/2026"] as Record<string, { meal?: string; name?: string }[]>;
    expect(categoryNames(day, "Entrées", "Breakfast")[0]).toBe("Bacon");
    expect(categoryNames(day, "Entrées", "Lunch")).toEqual([]);
  });
});
