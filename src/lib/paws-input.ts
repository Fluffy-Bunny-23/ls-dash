import type { PawsInfo } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(s: string, max: number): string {
  return s.replace(/\s+/g, " ").trim().slice(0, max);
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

  let weekDefault: string | null =
    typeof defaultWeek === "string" && defaultWeek.trim()
      ? clean(defaultWeek, 60)
      : null;

  let daysObj: Record<string, unknown>;
  if ("days" in obj) {
    const days = obj["days"];
    if (!days || typeof days !== "object" || Array.isArray(days)) {
      throw new Error('PAWS file: "days" must be an object mapping YYYY-MM-DD to { title, details?, week? }.');
    }
    daysObj = days as Record<string, unknown>;
    if (typeof obj["week"] === "string" && obj["week"].trim()) {
      weekDefault = clean(obj["week"] as string, 60);
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
    const v = daysObj[id];
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      fail(`"${id}": must be { title, details?, week? }`);
      continue;
    }
    const rec = v as Record<string, unknown>;
    if (typeof rec["title"] !== "string" || !clean(rec["title"], 120)) {
      fail(`"${id}": missing/blank "title"`);
      continue;
    }
    const title = clean(rec["title"] as string, 120);
    if ((rec["title"] as string).length > 200) fail(`"${id}": "title" implausibly long, check transcription`);

    let details: string[] = [];
    if (rec["details"] !== undefined) {
      if (!Array.isArray(rec["details"])) {
        fail(`"${id}": "details" must be an array of strings`);
        continue;
      }
      const raw = rec["details"] as unknown[];
      if (raw.length > 12) fail(`"${id}": "details" has ${raw.length} items (max 12)`);
      for (const d of raw) {
        if (typeof d !== "string" || !clean(d, 120)) {
          fail(`"${id}": every "details" item must be a non-blank string`);
          break;
        }
      }
      details = (raw as string[]).filter((d) => clean(d, 120)).map((d) => clean(d, 120));
    }

    let week: string | null = weekDefault;
    if (rec["week"] !== undefined) {
      if (typeof rec["week"] !== "string" || !clean(rec["week"], 60)) {
        fail(`"${id}": "week" must be a non-blank string`);
        continue;
      }
      week = clean(rec["week"] as string, 60);
    }
    entries.set(id, { title, details, week });
  }

  if (errors.length > 0) {
    throw new Error(`PAWS file invalid:\n- ${errors.join("\n- ")}`);
  }
  return entries;
}
