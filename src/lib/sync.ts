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
  /** PT today id (YYYY-MM-DD). Only past/today dates may be rescued by Sage food. */
  todayId: string;
  /**
   * Human-supplied reason from the `overrides/reasons` Firestore doc
   * (e.g. "Staff Development Day"). Only labels days already determined
   * no-school — it never overrides an ABC/special school day.
   */
  overrideLabel?: string;
}

/** Firestore `overrides/reasons` doc id. */
export const REASONS_DOC = "overrides/reasons";

/**
 * Parse the reasons doc into dateId -> label. Lenient by design: the sync
 * must never fail because of a hand-edited doc — bad entries are skipped.
 */
export function parseOverrideLabels(data: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (typeof value !== "string") continue;
    const label = value.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!label) continue;
    out.set(key, label);
  }
  return out;
}

/**
 * Merge iCal + Sage into one DayDoc (§§3–4).
 * Rule: Mon–Fri with no event in the feed = no school, EXCEPT when Sage shows
 * food was actually served on a past/today weekday (e.g. 2026-09-03 full lunch
 * + 2026-09-04 breakfast served, but the feed posts no ABC event for either).
 * Feed absence on those days means "no ABC rotation posted", not "day off".
 * Future dates still trust the feed alone — Sage doesn't publish that far
 * ahead, so empty menus there prove nothing.
 */
export function mergeDay(input: MergedInput): DayDoc {
  const { dateId, occurrence, lunch, breakfast, sageEventLabel, sageWeek, todayId, overrideLabel } = input;
  const servedFood =
    lunch.all.length > 0 || breakfast.all.length > 0 || breakfast.daily.length > 0;
  const servedWithoutSchedule =
    !occurrence && !isWeekendId(dateId) && dateId <= todayId && servedFood;
  const isClosureDay = occurrence?.isClosure === true;
  // A closure event in the feed means no school even if Sage posted a menu
  // (future cycle menus can be retracted); the raw summary is the reason.
  const isNoSchool =
    !isWeekendId(dateId) && (isClosureDay || (!occurrence && !servedWithoutSchedule));
  return {
    date: dateId,
    dow: dowShort(dateId),
    abc: isClosureDay ? null : (occurrence?.abc ?? null),
    isSpecial: occurrence && !isClosureDay ? occurrence.isSpecial : false,
    specialLabel: !isClosureDay ? (occurrence?.specialLabel ?? null) : null,
    isNoSchool,
    noSchoolLabel: isNoSchool
      ? (overrideLabel ??
        (isClosureDay ? occurrence?.specialLabel : undefined) ??
        sageEventLabel ??
        "No school")
      : null,
    lunch: {
      entree: lunch.entree,
      special: lunch.special,
      feature: lunch.feature,
      soups: lunch.soups,
      sides: lunch.sides,
      all: lunch.all,
      details: lunch.details,
    },
    breakfast: { entree: breakfast.entree, all: breakfast.all, daily: breakfast.daily, details: breakfast.details, dailyDetails: breakfast.dailyDetails },
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
