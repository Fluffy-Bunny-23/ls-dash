/** America/Los_Angeles calendar-day helpers. Date ids are `YYYY-MM-DD`. */

export const PT_TZ = "America/Los_Angeles";

const ptFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PT_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Current day id in America/Los_Angeles. */
export function todayPtId(now: Date = new Date()): string {
  return ptFormatter.format(now); // en-CA => YYYY-MM-DD
}

const ID_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateId(id: string): { y: number; m: number; d: number } {
  const m = ID_RE.exec(id);
  if (!m) throw new Error(`bad date id: ${id}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** 0=Sun..6=Sat. Calendar weekday is timezone-independent for a bare date. */
export function weekdayOfId(id: string): number {
  const { y, m, d } = parseDateId(id);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWeekendId(id: string): boolean {
  const w = weekdayOfId(id);
  return w === 0 || w === 6;
}

export function addDaysId(id: string, n: number): string {
  const { y, m, d } = parseDateId(id);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  const yy = t.getUTCFullYear();
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dowShort(id: string): string {
  return DOW_SHORT[weekdayOfId(id)];
}

/** Weekends are not navigable: Sat/Sun advance forward to Monday. */
export function advancePastWeekendForward(id: string): string {
  let cur = id;
  while (isWeekendId(cur)) cur = addDaysId(cur, 1);
  return cur;
}

/** Step one school day, skipping weekends. dir = +1 (next) or -1 (prev). */
export function stepSchoolDay(id: string, dir: 1 | -1): string {
  let cur = addDaysId(id, dir);
  while (isWeekendId(cur)) cur = addDaysId(cur, dir);
  return cur;
}

/** Inclusive list of date ids from `startId` to `endId`. */
export function rangeIds(startId: string, endId: string): string[] {
  const out: string[] = [];
  let cur = startId;
  for (let i = 0; i < 500 && cur <= endId; i++) {
    out.push(cur);
    cur = addDaysId(cur, 1);
  }
  return out;
}

/** Rolling retention window: [today-30d, today+30d], PT. */
export function retentionWindow(todayId: string): { startId: string; endId: string } {
  return { startId: addDaysId(todayId, -30), endId: addDaysId(todayId, 30) };
}

/** All Mon–Fri date ids in a `YYYY-MM` month. */
export function monthWeekdayIds(yyyyMM: string): string[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yyyyMM)) throw new Error(`bad month: ${yyyyMM}`);
  const [ys, ms] = yyyyMM.split("-");
  const y = Number(ys);
  const m = Number(ms);
  // Days in month via UTC to avoid DST edge cases.
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= dim; d++) {
    const id = `${ys}-${ms}-${String(d).padStart(2, "0")}`;
    if (!isWeekendId(id)) out.push(id);
  }
  return out;
}

/** Pretty header label, e.g. "Friday, September 11". Avoids Date tz pitfalls. */
export function prettyDate(id: string): string {
  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const DAYS = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  ];
  const { y, m, d } = parseDateId(id);
  return `${DAYS[weekdayOfId(id)]}, ${MONTHS[m - 1]} ${d}${y !== new Date().getFullYear() ? ` ${y}` : ""}`;
}

/** `MM/DD/YYYY` anchor form the Sage endpoints expect. */
export function toSageDate(id: string): string {
  const { y, m, d } = parseDateId(id);
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

/** Monday anchor for a dateId — Sage weekly API returns the previous week when queried on a Sunday, so anchors must be Mon–Sat. */
export function mondayAnchorForId(id: string): string {
  const w = weekdayOfId(id);
  if (w === 0) return addDaysId(id, 1); // Sunday -> next Monday
  if (w === 1) return id;
  return addDaysId(id, -(w - 1));
}

/**
 * Monday-based week anchors covering [startId, endId]. Sage weekly API is
 * buggy on Sundays (returns previous week), so we anchor on Mondays (Sun–Sat
 * keys still returned, but fetch is done via Monday). ~9 calls for ±30d.
 */
export function weekAnchorsForWindow(startId: string, endId: string): string[] {
  const startMon = mondayAnchorForId(startId);
  const endMon = mondayAnchorForId(endId);
  const anchors: string[] = [];
  let cur = startMon;
  while (cur <= endMon) {
    anchors.push(toSageDate(cur));
    cur = addDaysId(cur, 7);
  }
  return anchors;
}
