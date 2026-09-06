/**
 * Sage Dining reverse-engineered client (§3a).
 *
 * Weekly payloads are keyed by `MM/DD/YYYY` (Sun–Sat) + a `daily` key.
 * Within one day, categories ("Entrées", "Specials", ...) are ARRAYS of
 * items, each carrying its own `meal` field. The breakfast menuId ALSO
 * serves Morning/Afternoon Snack in the same arrays, so extraction MUST
 * filter on `item.meal` (the plan's "same extractor" only works with this
 * filter — verified against ref/Sage-breakfast.har).
 */
import { toSageDate } from "./dates";

export const SAGE_BASE = "https://www.sagedining.com/microsites";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface SageItem {
  meal?: string;
  name?: string;
  displayCategory?: string;
  [k: string]: unknown;
}

/** day object: category name -> items */
export type SageDay = Record<string, SageItem[]>;
export type SageWeek = Record<string, SageDay | SageItem[]>;

export interface SageMonthlyEvent {
  label: string;
  date: string; // YYYY-MM-DD
  meal: string;
}

function sageFetch(
  path: string,
  fetchFn: typeof fetch = fetch,
): Promise<unknown> {
  return fetchFn(`${SAGE_BASE}${path}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  }).then(async (res) => {
    if (!res.ok) throw new Error(`sage ${path} -> ${res.status}`);
    return res.json();
  });
}

/** Preferred bulk call: one request = full week Sun–Sat + `daily` key. */
export async function fetchWeeklyMenuItems(
  menuId: string,
  anchorSageDate: string,
  fetchFn: typeof fetch = fetch,
): Promise<SageWeek> {
  const data = (await sageFetch(
    `/getWeeklyMenuItems?menuId=${encodeURIComponent(menuId)}&date=${encodeURIComponent(anchorSageDate)}`,
    fetchFn,
  )) as SageWeek;
  return data ?? {};
}

/** Single-day call: the ONLY source of per-date `Daily` offerings (displayed
 *  on the site as daily breakfast/beverages/accompaniments). Weekly payloads
 *  do not carry per-day Daily items. */
export async function fetchSingleDayMenuItems(
  menuId: string,
  sageDate: string,
  meal: string,
  fetchFn: typeof fetch = fetch,
): Promise<SageDay | undefined> {
  const data = (await sageFetch(
    `/getMenuItems?menuId=${encodeURIComponent(menuId)}&date=${encodeURIComponent(sageDate)}&meal=${encodeURIComponent(meal)}&mode=`,
    fetchFn,
  )) as SageDay;
  return data ?? undefined;
}

/** Closure/event labels. Only meaningful on the LUNCH menuId (breakfast returns []). */
export async function fetchMonthlyEvents(
  menuId: string,
  anchorSageDate: string,
  fetchFn: typeof fetch = fetch,
): Promise<Map<string, SageMonthlyEvent>> {
  const data = (await sageFetch(
    `/getMonthlyEvents?menuId=${encodeURIComponent(menuId)}&date=${encodeURIComponent(anchorSageDate)}`,
    fetchFn,
  )) as Record<string, { label?: string; date?: string; meal?: string }>;
  const out = new Map<string, SageMonthlyEvent>();
  for (const v of Object.values(data ?? {})) {
    if (v?.date && v?.label) {
      out.set(v.date, { label: v.label, date: v.date, meal: v.meal ?? "" });
    }
  }
  return out;
}

/** Collapse inner whitespace: "Pho    Bar" -> "Pho Bar". */
export function normalizeName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Categories that never hold entrées (condiments/dressings/milk, internals). */
const SKIP_CATEGORIES = new Set(["Exclude", "Snack", "Events", "Daily"]);

/**
 * Names in a category restricted to one served meal, whitespace-normalized.
 * `daily` payloads and `Daily`-meal condiments are skipped by the caller
 * (they live under the `daily` week key, never under a date key).
 */
export function categoryNames(day: SageDay | undefined, category: string, meal: string): string[] {
  if (!day) return [];
  const items = day[category];
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const it of items) {
    if (it?.meal !== meal) continue;
    const name = normalizeName(String(it?.name ?? ""));
    if (name) out.push(name);
  }
  return out;
}

export interface LunchExtract {
  entree: string | null;
  special: string | null;
  feature: string | null;
  soups: string[];
  sides: string[];
  all: string[];
}

export function extractLunch(day: SageDay | undefined): LunchExtract {
  const meal = "Lunch";
  const entrees = categoryNames(day, "Entrées", meal);
  const specials = categoryNames(day, "Specials", meal);
  const features = categoryNames(day, "Today's Menu Features", meal);
  const soups = categoryNames(day, "Soups", meal);
  const salads = categoryNames(day, "Salads", meal);
  const deli = categoryNames(day, "Deli", meal);
  const sides = categoryNames(day, "Sides and Vegetables", meal);
  const desserts = categoryNames(day, "Desserts", meal);
  // Any other non-skipped category future Sage adds still surfaces in `all`.
  const extra: string[] = [];
  if (day) {
    for (const [cat, items] of Object.entries(day)) {
      if (
        SKIP_CATEGORIES.has(cat) ||
        ["Entrées", "Specials", "Today's Menu Features", "Soups", "Salads", "Deli", "Sides and Vegetables", "Desserts"].includes(cat)
      ) {
        continue;
      }
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        if (it?.meal !== meal) continue;
        const name = normalizeName(String(it?.name ?? ""));
        if (name) extra.push(name);
      }
    }
  }
  const all = [...entrees, ...specials, ...features, ...soups, ...salads, ...deli, ...sides, ...desserts, ...extra];
  return {
    entree: entrees[0] ?? null,
    special: specials[0] ?? null,
    feature: features[0] ?? null,
    soups,
    sides,
    all,
  };
}

export interface BreakfastExtract {
  entree: string | null;
  all: string[];
  /** `Daily`-meal items (daily platter, beverages, accompaniments). Only
   *  present in single-day payloads; weekly day-objects have no Daily key. */
  daily: string[];
}

export function extractBreakfast(day: SageDay | undefined): BreakfastExtract {
  const meal = "Breakfast";
  const entrees = categoryNames(day, "Entrées", meal);
  const all = [
    ...entrees,
    ...categoryNames(day, "Specials", meal),
    ...categoryNames(day, "Today's Menu Features", meal),
    ...categoryNames(day, "Soups", meal),
    ...categoryNames(day, "Salads", meal),
    ...categoryNames(day, "Deli", meal),
    ...categoryNames(day, "Sides and Vegetables", meal),
    ...categoryNames(day, "Desserts", meal),
  ];
  return { entree: entrees[0] ?? null, all, daily: categoryNames(day, "Daily", "Daily") };
}

/** Month-cell priority (§3a): Entrées[0] → Specials[0] → Features[0]. */
export function pickCellEntree(lunch: LunchExtract): string | null {
  return lunch.entree ?? lunch.special ?? lunch.feature;
}

/** Find the week payload's day object for a YYYY-MM-DD id. */
export function weekDayForId(week: SageWeek, dateId: string): SageDay | undefined {
  const key = toSageDate(dateId);
  const v = week[key];
  if (!v || Array.isArray(v)) return undefined;
  return v as SageDay;
}
