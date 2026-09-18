/** PAWS schedule for the week of 9/21–9/25 (2026).
 *
 * Only this week is known, so this is a static map keyed by date id
 * (YYYY-MM-DD). Days outside the map have no PAWS info and render nothing.
 * Source: school PAWS table "PAWS 9/21-9/25" (screenshot in PR).
 */

export interface PawsInfo {
  /** Short headline, e.g. "Academic Advisory" / "Assembly". */
  title: string;
  /** Remaining lines in table order (grade breakouts + locations). */
  details: string[];
}

export const PAWS_WEEK_LABEL = "PAWS 9/21–9/25";

const PAWS_BY_DATE: Record<string, PawsInfo> = {
  "2026-09-21": {
    title: "Academic Advisory",
    details: ["Advisory Locations"],
  },
  "2026-09-22": {
    title: "Assembly",
    details: ["Theater"],
  },
  "2026-09-23": {
    title: "Advisory / GSL Prep",
    details: [
      "5th: Advisory",
      "6th: Advisory",
      "7th: Advisory",
      "Advisory Locations",
      "8th: GSL Prep",
      "GSL Locations",
    ],
  },
  "2026-09-24": {
    title: "All-School Study Hall",
    details: ["5th: MS 185", "6th: Theater", "7th: Off campus", "8th: Library"],
  },
  "2026-09-25": {
    title: "Advisory",
    details: ["Advisory Locations"],
  },
};

/** PAWS info for a date id, or null when the week doesn't cover it. */
export function getPaws(dateId: string): PawsInfo | null {
  return PAWS_BY_DATE[dateId] ?? null;
}

/** One-line summary for dense surfaces (month cells). */
export function pawsSummary(info: PawsInfo): string {
  return `PAWS: ${info.title}`;
}
