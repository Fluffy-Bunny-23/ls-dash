"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { collection, query, where } from "firebase/firestore";
import { getDb } from "./firebase-client";
import type { DayDoc, SyncMeta } from "./types";

export function useDay(dateId: string | null): { day: DayDoc | null; loaded: boolean } {
  const [day, setDay] = useState<DayDoc | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!dateId) {
      setLoaded(true);
      return;
    }
    setLoaded(false);
    const unsub = onSnapshot(
      doc(getDb(), "days", dateId),
      (snap) => {
        setDay((snap.data() as DayDoc | undefined) ?? null);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return unsub;
  }, [dateId]);
  return { day, loaded };
}

export function useMonthDays(month: string): { days: Map<string, DayDoc>; loaded: boolean } {
  const [days, setDays] = useState<Map<string, DayDoc>>(new Map());
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
    const q = query(
      collection(getDb(), "days"),
      where("date", ">=", `${month}-01`),
      where("date", "<", `${month}-32`),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const m = new Map<string, DayDoc>();
        for (const d of snap.docs) m.set(d.id, d.data() as DayDoc);
        setDays(m);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return unsub;
  }, [month]);
  return { days, loaded };
}

export function useSyncMeta(enabled = true): { meta: SyncMeta | null; loaded: boolean } {
  const [meta, setMeta] = useState<SyncMeta | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setMeta(null);
      setLoaded(false);
      return;
    }
    const unsub = onSnapshot(
      doc(getDb(), "meta", "sync"),
      (snap) => {
        setMeta((snap.data() as SyncMeta | undefined) ?? null);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return unsub;
  }, [enabled]);
  return { meta, loaded };
}
