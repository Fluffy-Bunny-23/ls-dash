export type AbcDay = "A" | "B" | "C";

export interface MenuItemDetail {
  name: string;
  category: string; // Sage displayCategory, e.g. "Entrées", "Specials", "Sides and Vegetables"
  station: string; // displayStation, e.g. "Free Style™" — may be "" for Daily staples
  price: string; // normalized string, "0" | "0.00" means not priced / included
  dot: string; // "Green" | "Yellow" | "Red" | "Green/Yellow/Red" | "Not Serving"
  allergens: string[]; // allergenNames (contains)
  maybeAllergens: string[]; // lmAllergenNames (may contain / cross-contact)
  lifestyle: string[]; // lifestyleNames (Vegetarian, Vegan, etc.)
  desc?: string;
}

export interface LunchInfo {
  entree: string | null;
  special: string | null;
  feature: string | null;
  soups: string[];
  sides: string[];
  /** Every entrée-relevant item name (entrées, specials, features, soups, salads, deli, sides, desserts). */
  all: string[];
  /** Detailed items with price/station/allergens. Optional for back-compat. */
  details?: MenuItemDetail[];
  /** Daily not used for lunch but kept for symmetry. */
}

export interface BreakfastInfo {
  entree: string | null;
  all: string[];
  /** Daily-meal offerings. Absent on docs written before the field existed — readers must default to []. */
  daily?: string[];
  details?: MenuItemDetail[];
  dailyDetails?: MenuItemDetail[];
}

/**
 * Hand-supplied PAWS schedule, baked in by the cron sync from the
 * `overrides/paws` Firestore doc (one field per date). Absent on docs
 * written before the field existed — readers must default to null.
 * Lives on the day doc so only authenticated school users can read it;
 * it must never be hardcoded in the client bundle (the logged-out wall
 * reveals nothing school-specific).
 */
export interface PawsInfo {
  title: string;
  details: string[];
  /** Week banner from the source table, e.g. "PAWS 9/21-9/25". */
  week: string | null;
}

export interface DayDoc {
  date: string; // YYYY-MM-DD (America/Los_Angeles)
  dow: string; // Mon..Fri
  abc: AbcDay | null;
  isSpecial: boolean;
  specialLabel: string | null;
  isNoSchool: boolean;
  noSchoolLabel: string | null;
  lunch: LunchInfo;
  breakfast: BreakfastInfo;
  /** PAWS schedule for the date, or null when none was supplied. */
  paws: PawsInfo | null;
  sources: { icalUid: string | null; sageWeek: string | null };
  updatedAt: unknown; // serverTimestamp on write
}

export interface SyncMeta {
  lastSuccess: string | null; // ISO timestamp
  lastAttempt: string | null; // ISO timestamp
  datesWritten: number;
  errors: string[];
}

/** Cron is stale when the last success is older than this. Daily 5am PT
 *  cron + same-day viewing => 26h gives ample headroom without false alarms. */
export const STALE_AFTER_MS = 26 * 60 * 60 * 1000;
