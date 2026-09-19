import type { PawsInfo } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Real calendar date check: rejects impossible dates like 2026-02-30. */
function isRealDate(id: string): boolean {
  const y = Number(id.slice(0, 4));
  const m = Number(id.slice(5, 7));
  const d = Number(id.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Saturday/Sunday check on the calendar date (PAWS runs Mon-Fri). */
function isWeekendDate(id: string): boolean {
  const y = Number(id.slice(0, 4));
  const m = Number(id.slice(5, 7));
  const d = Number(id.slice(8, 10));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Normalize an agent-transcribed PAWS JSON file into dateId -> PawsInfo.
 *
 * Accepted shapes (both keep the Firestore `overrides/paws` field shape):
 *   flat:    { "2026-09-28": { title, details?, week? }, ... }
 *   wrapped: { "week": "PAWS 9/28-10/2", "days": { "2026-09-28": { title, details? }, ... } }
 *
 * Strict by design (unlike the lenient `parseOverridePaws` used by the cron):
 * any problem throws a single Error listing every issue, so the agent fixes
 * the transcription instead of silently dropping a day.
 *
 * `defaultWeek` (from `--week`) fills entries that omit `week`.
 */
export function normalizePawsFileInput(data: unknown, defaultWeek?: string): Map<string, PawsInfo> {
  const errors: string[] = [];
  const fail = (msg: string): void => {
    errors.push(msg);
  };

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("PAWS file must be a JSON object (flat date map or { week, days } wrapper).");
  }
  const obj = data as Record<string, unknown>;

  let weekDefault: string | null = null;
  if (typeof defaultWeek === "string" && defaultWeek.trim()) {
    weekDefault = norm(defaultWeek);
    if (weekDefault.length > 60) {
      throw new Error(`PAWS file invalid:\n- default --week is ${weekDefault.length} chars (max 60)`);
    }
  }

  let daysObj: Record<string, unknown>;
  if ("days" in obj) {
    const days = obj["days"];
    if (!days || typeof days !== "object" || Array.isArray(days)) {
      throw new Error('PAWS file: "days" must be an object mapping YYYY-MM-DD to { title, details?, week? }.');
    }
    daysObj = days as Record<string, unknown>;
    if (typeof obj["week"] === "string" && obj["week"].trim()) {
      const w = norm(obj["week"] as string);
      if (w.length > 60) fail(`shared "week" is ${w.length} chars (max 60)`);
      else weekDefault = w;
    }
    for (const k of Object.keys(obj)) {
      if (k !== "days" && k !== "week") fail(`unknown top-level key "${k}" (want only "week" + "days")`);
    }
  } else {
    daysObj = obj;
  }

  const entries = new Map<string, PawsInfo>();
  const ids = Object.keys(daysObj);
  if (ids.length === 0) fail("no dates found (want 1-10 YYYY-MM-DD entries)");
  if (ids.length > 10) fail(`too many dates (${ids.length}; want a single week, max 10)`);

  for (const id of ids) {
    if (!DATE_RE.test(id)) {
      fail(`"${id}": not YYYY-MM-DD`);
      continue;
    }
    if (!isRealDate(id)) {
      fail(`"${id}": not a real calendar date`);
      continue;
    }
    if (isWeekendDate(id)) {
      fail(`"${id}": falls on a weekend (PAWS runs Mon-Fri)`);
      continue;
    }
    const v = daysObj[id];
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      fail(`"${id}": must be { title, details?, week? }`);
      continue;
    }
    const rec = v as Record<string, unknown>;
    if (typeof rec["title"] !== "string" || !norm(rec["title"])) {
      fail(`"${id}": missing/blank "title"`);
      continue;
    }
    const title = norm(rec["title"] as string);
    if (title.length > 120) {
      fail(`"${id}": "title" is ${title.length} chars (max 120)`);
      continue;
    }

    let details: string[] = [];
    if (rec["details"] !== undefined) {
      if (!Array.isArray(rec["details"])) {
        fail(`"${id}": "details" must be an array of strings`);
        continue;
      }
      const raw = rec["details"] as unknown[];
      if (raw.length > 12) fail(`"${id}": "details" has ${raw.length} items (max 12)`);
      let badDetail: string | null = null;
      for (const d of raw) {
        if (typeof d !== "string" || !norm(d)) {
          badDetail = "every \"details\" item must be a non-blank string";
          break;
        }
        if (norm(d).length > 120) {
          badDetail = `"details" item is ${norm(d).length} chars (max 120)`;
          break;
        }
      }
      if (badDetail) {
        fail(`"${id}": ${badDetail}`);
        continue;
      }
      details = (raw as string[]).map((d) => norm(d));
    }

    let week: string | null = weekDefault;
    if (rec["week"] !== undefined) {
      if (typeof rec["week"] !== "string" || !norm(rec["week"] as string)) {
        fail(`"${id}": "week" must be a non-blank string`);
        continue;
      }
      const w = norm(rec["week"] as string);
      if (w.length > 60) {
        fail(`"${id}": "week" is ${w.length} chars (max 60)`);
        continue;
      }
      week = w;
    }
    entries.set(id, { title, details, week });
  }

  if (errors.length > 0) {
    throw new Error(`PAWS file invalid:\n- ${errors.join("\n- ")}`);
  }
  return entries;
}
