import type { AbcDay } from "./types";
import { addDaysId, parseDateId } from "./dates";

export interface IcalEvent {
  uid: string | null;
  /** Local calendar date YYYY-MM-DD (all-day VALUE=DATE; date-times by their own calendar date). */
  startId: string;
  /** Exclusive end date id when DTEND/DURATION present, else null. */
  endExclusiveId: string | null;
  summary: string;
}

const ABC_RE = /\bMS\s+(?:special\s+)?([ABC])\s+day\b/i;
const NO_ABC_RE = /no ABC schedule today/i;
const SPECIAL_RE = /special/i;

export interface ClassifiedDay {
  abc: AbcDay | null;
  isSpecial: boolean;
  specialLabel: string | null;
}

/** Classify one SUMMARY per §3b. No-ABC override wins over the ABC letter. */
export function classifyIcalSummary(summary: string): ClassifiedDay {
  const s = summary.trim();
  if (NO_ABC_RE.test(s)) {
    return { abc: null, isSpecial: true, specialLabel: s };
  }
  const abcMatch = ABC_RE.exec(s);
  const abc = abcMatch ? (abcMatch[1].toUpperCase() as AbcDay) : null;
  if (SPECIAL_RE.test(s)) {
    return { abc, isSpecial: true, specialLabel: s };
  }
  return { abc, isSpecial: false, specialLabel: null };
}

/** RFC 5545 line unfolding: continuation lines begin with SP/HTAB. */
export function unfoldIcal(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out;
}

function parseDateProp(value: string): string | null {
  // VALUE=DATE:20260908  |  DTSTART:20260908T000000Z  |  floating local time
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseDurationDays(value: string): number | null {
  // Support day/week durations (PnD / PnW); others (hourly) unsupported.
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?$/i.exec(value.trim());
  if (!m || (m[1] == null && m[2] == null)) return null;
  return Number(m[1] ?? 0) * 7 + Number(m[2] ?? 0);
}

/** Parse VEVENTs. Multi-day DTEND/DURATION ranges expand to per-day entries. */
export function parseIcalEvents(text: string): IcalEvent[] {
  const lines = unfoldIcal(text);
  const events: IcalEvent[] = [];
  let cur: Record<string, string> | null = null;
  const flush = () => {
    if (!cur) return;
    const dtstartRaw = cur["DTSTART"] ?? "";
    const startId = parseDateProp(dtstartRaw.split(";").pop() ?? "");
    const summary = (cur["SUMMARY"] ?? "").trim();
    if (startId && summary) {
      let endExclusiveId: string | null = null;
      if (cur["DTEND"]) {
        endExclusiveId = parseDateProp(cur["DTEND"].split(";").pop() ?? "");
      } else if (cur["DURATION"]) {
        const days = parseDurationDays(cur["DURATION"]);
        if (days != null && days > 0) endExclusiveId = addDaysId(startId, days);
      }
      events.push({
        uid: cur["UID"]?.trim() || null,
        startId,
        endExclusiveId,
        summary,
      });
    }
    cur = null;
  };
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
    } else if (line === "END:VEVENT") {
      flush();
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx > 0) {
        const key = line.slice(0, idx).split(";")[0];
        // Keep first occurrence (DTSTART before DTEND in practice).
        if (!(key in cur)) cur[key] = line.slice(idx + 1);
      }
    }
  }
  return events;
}

/** One expanded day occurrence: date id + classification + source uid. */
export interface SchoolDayOccurrence extends ClassifiedDay {
  uid: string | null;
}

/**
 * Expand ranged events (DTEND/DURATION) into per-day occurrences.
 * Later events on the same day win (feed has no overlaps today, but stay deterministic).
 */
export function expandOccurrences(events: IcalEvent[]): Map<string, SchoolDayOccurrence> {
  const byDay = new Map<string, SchoolDayOccurrence>();
  for (const ev of events) {
    const days: string[] = [ev.startId];
    if (ev.endExclusiveId && ev.endExclusiveId > ev.startId) {
      days.length = 0;
      let cur = ev.startId;
      for (let i = 0; i < 400 && cur < ev.endExclusiveId; i++) {
        days.push(cur);
        cur = addDaysId(cur, 1);
      }
    }
    // Validate date shape; skip garbage.
    for (const id of days) {
      try {
        parseDateId(id);
      } catch {
        continue;
      }
      byDay.set(id, { ...classifyIcalSummary(ev.summary), uid: ev.uid });
    }
  }
  return byDay;
}
