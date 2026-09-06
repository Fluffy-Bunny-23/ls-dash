"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { useSyncMeta as useSyncMetaSub } from "@/lib/use-days";
import type { SyncMeta } from "@/lib/types";

const SyncMetaCtx = createContext<{ meta: SyncMeta | null; loaded: boolean }>({
  meta: null,
  loaded: false,
});

/**
 * Subscribes to meta/sync ONCE per session (the layout persists across the
 * Today↔Month client-side navigations), instead of re-listening on every
 * page view. Fewer reads, fewer streams, same badge everywhere.
 */
export function SyncMetaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const value = useSyncMetaSub(!!user);
  return <SyncMetaCtx.Provider value={value}>{children}</SyncMetaCtx.Provider>;
}

export function useSyncMetaValue(): { meta: SyncMeta | null; loaded: boolean } {
  return useContext(SyncMetaCtx);
}
