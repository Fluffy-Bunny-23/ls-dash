"use client";

import { useSyncMetaValue } from "./sync-meta-provider";
import { staleLine } from "@/lib/format";
import { Skeleton } from "./ui/card";
import { cn } from "@/lib/cn";

/** "updated X ago" footer; stale => badge with support email (§1). */
export function SyncFooter() {
  const { meta, loaded } = useSyncMetaValue();
  if (!loaded) return <Skeleton className="mx-auto h-4 w-48" />;
  const { text, stale } = staleLine(meta);
  return (
    <p
      data-testid="sync-footer"
      data-stale={stale ? "true" : "false"}
      className={cn(
        "text-center text-xs",
        stale ? "rounded-md bg-red-50 px-2 py-1 font-medium text-red-800" : "text-stone-500",
      )}
    >
      {text}
    </p>
  );
}
