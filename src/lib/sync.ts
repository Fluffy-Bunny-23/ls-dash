import { dowShort, isWeekendId } from "./dates";
import type { SchoolDayOccurrence } from "./ical";
import type { BreakfastExtract, LunchExtract } from "./sage";
import type { DayDoc, SyncMeta } from "./types";
import { STALE_AFTER_MS } from "./types";

export interface MergedInput {
  dateId: string;
  occurrence: SchoolDayOccurrence | undefined;
  lunch: LunchExtract;
  breakfast: BreakfastExtract;
  /** e.g. "Labor Day" from Sage getMonthlyEvents, if any. */
  sageEventLabel: string | undefined;
  sageWeek: string | null;
}

/**
 * Merge iCal + Sage into one DayDoc (§§3–4).
 * Rule: Mon–Fri with no event in the feed = no school.
 */
export function mergeDay(input: MergedInput): DayDoc {
  const { dateId, occurrence, lunch, breakfast, sageEventLabel, sageWeek } = input;
  const isNoSchool = !occurrence && !isWeekendId(dateId);
  return {
    date: dateId,
    dow: dowShort(dateId),
    abc: occurrence?.abc ?? null,
    isSpecial: occurrence?.isSpecial ?? false,
    specialLabel: occurrence?.specialLabel ?? null,
    isNoSchool,
    noSchoolLabel: isNoSchool ? (sageEventLabel ?? "No school") : null,
    lunch: {
      entree: lunch.entree,
      special: lunch.special,
      feature: lunch.feature,
      soups: lunch.soups,
      sides: lunch.sides,
      all: lunch.all,
    },
    breakfast: { entree: breakfast.entree, all: breakfast.all },
    sources: { icalUid: occurrence?.uid ?? null, sageWeek },
    updatedAt: undefined,
  };
}

/** Ids present in Firestore but outside the retention window => delete. */
export function datesToPrune(existingIds: string[], startId: string, endId: string): string[] {
  return existingIds.filter((id) => id < startId || id > endId);
}

export function isMetaStale(meta: SyncMeta | null, nowMs: number = Date.now()): boolean {
  if (!meta?.lastSuccess) return true;
  const t = Date.parse(meta.lastSuccess);
  if (Number.isNaN(t)) return true;
  return nowMs - t > STALE_AFTER_MS;
}
