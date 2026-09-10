import admin from "firebase-admin";
import {
  isWeekendId,
  mondayAnchorForId,
  rangeIds,
  retentionWindow,
  toSageDate,
  weekAnchorsForWindow,
} from "@/lib/dates";
import { expandOccurrences, parseIcalEvents } from "@/lib/ical";
import {
  extractBreakfast,
  extractLunch,
  fetchMonthlyEvents,
  fetchSingleDayMenuItems,
  fetchWeeklyMenuItems,
  weekDayForId,
  type SageMonthlyEvent,
  type SageWeek,
} from "@/lib/sage";
import { datesToPrune, mergeDay } from "@/lib/sync";

export interface SyncDeps {
  fetchText: (url: string) => Promise<string>;
  sageFetch: typeof fetch;
  db: admin.firestore.Firestore;
  todayId: string;
  icalUrl: string;
  lunchMenuId: string;
  breakfastMenuId: string;
}

export interface SyncResult {
  datesWritten: number;
  pruned: number;
  /** Non-fatal warnings (e.g. Sage returned nothing on school days). */
  warnings: string[];
}

/** Monday anchor matching weekAnchorsForWindow — avoids Sage Sunday bug. */
function anchorForId(dateId: string): string {
  return toSageDate(mondayAnchorForId(dateId));
}

export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const { fetchText, sageFetch, db, todayId, icalUrl, lunchMenuId, breakfastMenuId } = deps;
  const { startId, endId } = retentionWindow(todayId);
  const warnings: string[] = [];

  // 1. iCal feed across the window.
  const icalText = await fetchText(icalUrl);
  const occurrences = expandOccurrences(parseIcalEvents(icalText));

  // 2. Sage weeklies: ~9 anchors x 2 menuIds, sequential (no hammering).
  const anchors = weekAnchorsForWindow(startId, endId);
  const lunchWeeks = new Map<string, SageWeek>();
  const breakfastWeeks = new Map<string, SageWeek>();
  for (const anchor of anchors) {
    lunchWeeks.set(anchor, await fetchWeeklyMenuItems(lunchMenuId, anchor, sageFetch));
    breakfastWeeks.set(anchor, await fetchWeeklyMenuItems(breakfastMenuId, anchor, sageFetch));
  }

  // 3. Monthly events (lunch menuId only) for months covering the window.
  const eventMaps: Map<string, SageMonthlyEvent>[] = [];
  const seenMonths = new Set<string>();
  for (const id of [startId, endId]) {
    const monthKey = id.slice(0, 7);
    if (seenMonths.has(monthKey)) continue;
    seenMonths.add(monthKey);
    eventMaps.push(await fetchMonthlyEvents(lunchMenuId, toSageDate(id), sageFetch));
  }
  const eventsByDate = new Map<string, string>();
  for (const m of eventMaps) for (const [date, ev] of m) eventsByDate.set(date, ev.label);

  // 3b. Daily offerings (platter, beverages, accompaniments) exist only in
  // single-day payloads — one extra call per weekday. Concurrency 5: still
  // gentle on Sage (browsers open 6/host), but ~44 sequential calls at
  // ~0.7s each would eat most of a 60s cron budget. Failures are isolated
  // per date so one miss never aborts the sync.
  const weekdayIds = rangeIds(startId, endId).filter((id) => !isWeekendId(id));
  const dailyById = new Map<string, string[]>();
  const dailyDetailsById = new Map<string, import("./types").MenuItemDetail[]>();
  {
    let cursor = 0;
    const workers = Array.from({ length: 5 }, async () => {
      while (cursor < weekdayIds.length) {
        const id = weekdayIds[cursor++];
        try {
          const single = await fetchSingleDayMenuItems(breakfastMenuId, toSageDate(id), "Breakfast", sageFetch);
          const ex = extractBreakfast(single);
          dailyById.set(id, ex.daily);
          dailyDetailsById.set(id, ex.dailyDetails);
        } catch (e) {
          warnings.push(`daily offerings missing for ${id}: ${(e as Error)?.message ?? e}`);
        }
      }
    });
    await Promise.all(workers);
  }

  // 4. Merge + upsert weekdays only (weekends are never navigable).
  const batch = db.batch();
  let datesWritten = 0;
  let lunchItemsTotal = 0;
  let schoolDaysWithoutLunch = 0;
  for (const id of rangeIds(startId, endId)) {
    if (isWeekendId(id)) continue;
    const anchor = anchorForId(id);
    const lunch = extractLunch(weekDayForId(lunchWeeks.get(anchor) ?? {}, id));
    const breakfastBase = extractBreakfast(weekDayForId(breakfastWeeks.get(anchor) ?? {}, id));
    const breakfast = { ...breakfastBase, daily: dailyById.get(id) ?? [], dailyDetails: dailyDetailsById.get(id) ?? [] };
    const occurrence = occurrences.get(id);
    lunchItemsTotal += lunch.all.length;
    if (occurrence && lunch.all.length === 0) schoolDaysWithoutLunch++;
    const merged = mergeDay({
      dateId: id,
      occurrence,
      lunch,
      breakfast,
      sageEventLabel: eventsByDate.get(id),
      sageWeek: anchor,
      todayId,
    });
    batch.set(db.collection("days").doc(id), {
      ...merged,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    datesWritten++;
  }
  await batch.commit();

  // 5. Prune out-of-window docs, update meta/sync.
  const existing = await db.collection("days").listDocuments();
  const existingIds = existing.map((d) => d.id);
  const prune = datesToPrune(existingIds, startId, endId);
  for (let i = 0; i < prune.length; i += 400) {
    const b = db.batch();
    for (const id of prune.slice(i, i + 400)) b.delete(db.collection("days").doc(id));
    await b.commit();
  }

  // §8: menuIds can rotate yearly — an all-empty Sage response on school days
  // is surfaced as a sync warning (shows the stale badge) instead of silence.
  if (lunchItemsTotal === 0 && schoolDaysWithoutLunch > 0) {
    warnings.push(
      `sage lunch menu ${lunchMenuId} returned no items for ${schoolDaysWithoutLunch} school days (menuId may have rotated?)`,
    );
  }

  return { datesWritten, pruned: prune.length, warnings };
}

