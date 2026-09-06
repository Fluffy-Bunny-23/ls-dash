import { SUPPORT_EMAIL } from "./types";
import { isMetaStale } from "./sync";
import type { SyncMeta } from "./types";

/** "updated 3 hours ago" — the X in the stale badge. */
export function formatUpdatedAgo(lastSuccessIso: string | null, nowMs: number = Date.now()): string {
  if (!lastSuccessIso) return "updated never";
  const t = Date.parse(lastSuccessIso);
  if (Number.isNaN(t)) return "updated never";
  const mins = Math.max(0, Math.floor((nowMs - t) / 60_000));
  if (mins < 1) return "updated just now";
  if (mins < 60) return `updated ${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `updated ${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Footer line per §1/§6. Fresh => plain "updated X ago".
 * Stale (or sync errors) => "updated X ago, please email <addr> for help".
 */
export function staleLine(meta: SyncMeta | null, nowMs: number = Date.now()): { text: string; stale: boolean } {
  const ago = formatUpdatedAgo(meta?.lastSuccess ?? null, nowMs);
  const stale = isMetaStale(meta, nowMs) || (meta?.errors?.length ?? 0) > 0;
  if (stale) return { text: `${ago}, please email ${SUPPORT_EMAIL} for help`, stale: true };
  return { text: ago, stale: false };
}
