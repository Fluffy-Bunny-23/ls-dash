import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/admin";
import { addDaysId, retentionWindow, todayPtId } from "@/lib/dates";

const EMU = !!process.env.FIRESTORE_EMULATOR_HOST;
const SAMPLE_ICS = readFileSync(join(__dirname, "__fixtures__", "calendar_436.sample.ics"), "utf8");
const TEST_ICAL_URL = "https://calendar.example-school.org/feed.ics";

/** The route requires ICAL_URL; point it at a stubbed URL for the duration. */
function stubIcalEnv(): () => void {
  const prev = process.env.ICAL_URL;
  process.env.ICAL_URL = TEST_ICAL_URL;
  return () => {
    if (prev === undefined) delete process.env.ICAL_URL;
    else process.env.ICAL_URL = prev;
  };
}

function mondayPlus(dateMmDdYyyy: string, n: number): string {
  const [m, d, y] = dateMmDdYyyy.split("/").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${t.getUTCFullYear()}`;
}

/** Stub: ICS sample + synthesized Sage weeklies with per-day names. */
function stubFetch(opts: { icalOk?: boolean; sageEmpty?: boolean } = {}) {
  const { icalOk = true, sageEmpty = false } = opts;
  const realFetch = globalThis.fetch;
  const stub = vi.fn(async (input: unknown, _init?: unknown) => {
    const url = String(input);
    if (url.includes("calendar_436") || url.includes("icalcache") || url.endsWith(".ics")) {
      if (!icalOk) return new Response("ics down", { status: 500 });
      return new Response(SAMPLE_ICS, { status: 200 });
    }
    if (url.includes("getWeeklyMenuItems")) {
      const u = new URL(url);
      const menuId = u.searchParams.get("menuId") ?? "";
      const anchor = u.searchParams.get("date") ?? "09/06/2026";
      const isLunch = menuId === "139455";
      const week: Record<string, Record<string, { meal: string; name: string }[]>> = {};
      for (let i = 0; i < 7; i++) {
        const key = mondayPlus(anchor, i);
        week[key] = sageEmpty
          ? {}
          : {
              Entrées: [{ meal: isLunch ? "Lunch" : "Breakfast", name: `${isLunch ? "Lunch" : "BF"} Entree ${key}` }],
              Specials: [{ meal: isLunch ? "Lunch" : "Breakfast", name: `${isLunch ? "Lunch" : "BF"} Special ${key}` }],
              "Today's Menu Features": [],
              Soups: [],
              Sides: [],
            };
      }
      return Response.json(week);
    }
    if (url.includes("getMenuItems")) {
      const u = new URL(url);
      const anchor = u.searchParams.get("date") ?? "09/06/2026";
      return Response.json({
        Entrées: [{ meal: "Breakfast", name: `BF Entree ${anchor}` }],
        Specials: [],
        "Today's Menu Features": [],
        Soups: [],
        Sides: [],
        Daily: [{ meal: "Daily", name: `Daily item ${anchor}` }],
      });
    }
    if (url.includes("getMonthlyEvents")) {
      return Response.json({});
    }
    return new Response("not stubbed: " + url, { status: 500 });
  });
  globalThis.fetch = stub as unknown as typeof fetch;
  return () => {
    globalThis.fetch = realFetch;
  };
}

describe.skipIf(!EMU)("cron route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // These tests write the full ±30d window via the Admin SDK (like the real
  // cron job). Afterwards the emulator holds stub data, NOT the dev seed —
  // re-run scripts/seed.ts before browser testing (see README).
  afterAll(async () => {
    const db = getAdminDb();
    const docs = await db.collection("days").listDocuments();
    for (let i = 0; i < docs.length; i += 400) {
      const b = db.batch();
      for (const d of docs.slice(i, i + 400)) b.delete(d);
      await b.commit();
    }
    await db.collection("meta").doc("sync").delete().catch(() => {});
  });

  it("rejects without the secret (401)", async () => {
    const { GET } = await import("@/app/api/cron/sync/route");
    const res = await GET(new NextRequest("http://localhost/api/cron/sync"));
    expect(res.status).toBe(401);
  });

  it("rejects a wrong secret (401)", async () => {
    const { GET } = await import("@/app/api/cron/sync/route");
    const res = await GET(
      new NextRequest("http://localhost/api/cron/sync", {
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("with the secret: writes the window and prunes to ±30d", async () => {
    const restoreEnv = stubIcalEnv();
    const restore = stubFetch();
    try {
      const { GET } = await import("@/app/api/cron/sync/route");
      const db = getAdminDb();
      const today = todayPtId();
      const { startId, endId } = retentionWindow(today);
      const staleOld = addDaysId(startId, -5);
      const staleFuture = addDaysId(endId, 5);
      await db.collection("days").doc(staleOld).set({ seed: "old" });
      await db.collection("days").doc(staleFuture).set({ seed: "future" });

      const res = await GET(
        new NextRequest("http://localhost/api/cron/sync", {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; datesWritten: number; pruned: number; warnings: string[] };

      // Expected weekday count in the window.
      let expected = 0;
      {
        const [ys, ms, ds] = startId.split("-").map(Number);
        let t = Date.UTC(ys, ms - 1, ds);
        const [ye, me, de] = endId.split("-").map(Number);
        const endT = Date.UTC(ye, me - 1, de);
        while (t <= endT) {
          const w = new Date(t).getUTCDay();
          if (w !== 0 && w !== 6) expected++;
          t += 86_400_000;
        }
      }
      expect(body.ok).toBe(true);
      expect(body.datesWritten).toBe(expected);
      expect(body.pruned).toBe(2);

      // Spot-check a written weekday: stub names + ICS classification.
      const sample = await db.collection("days").doc("2026-09-08").get();
      expect(sample.exists).toBe(true);
      const data = sample.data() as Record<string, unknown>;
      expect((data["lunch"] as { entree: string }).entree).toContain("Lunch Entree");
      expect((data["breakfast"] as { daily: string[] }).daily).toContain("Daily item 09/08/2026");
      expect(data["abc"]).toBe("A");

      // Pruned docs are gone.
      expect((await db.collection("days").doc(staleOld).get()).exists).toBe(false);
      expect((await db.collection("days").doc(staleFuture).get()).exists).toBe(false);

      // meta/sync powers the badge.
      const meta = (await db.collection("meta").doc("sync").get()).data() as Record<string, unknown>;
      expect(typeof meta["lastSuccess"]).toBe("string");
      expect(meta["errors"]).toEqual([]);
      expect(body.warnings).toEqual([]);
      expect(meta["datesWritten"]).toBe(expected);
    } finally {
      restore();
      restoreEnv();
    }
  });

  it("on fetch failure: 500s, records the error, and never wipes the window", async () => {
    const restoreEnv = stubIcalEnv();
    const restore = stubFetch({ icalOk: false });
    try {
      const { GET } = await import("@/app/api/cron/sync/route");
      const db = getAdminDb();
      const keepId = "2026-09-08";
      await db.collection("days").doc(keepId).set({ sentinel: true });
      const before = await db.collection("meta").doc("sync").get();
      const beforeSuccess = (before.data() as Record<string, unknown> | undefined)?.["lastSuccess"] ?? null;

      const res = await GET(
        new NextRequest("http://localhost/api/cron/sync", {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        }),
      );
      expect(res.status).toBe(500);
      const body = (await res.json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);

      // Stale data kept: sentinel doc untouched, lastSuccess not clobbered.
      expect((await db.collection("days").doc(keepId).get()).exists).toBe(true);
      const meta = (await db.collection("meta").doc("sync").get()).data() as Record<string, unknown>;
      expect((meta["errors"] as string[]).length).toBeGreaterThan(0);
      expect(meta["lastAttempt"]).toBeTruthy();
      if (beforeSuccess) expect(meta["lastSuccess"]).toBe(beforeSuccess);
    } finally {
      restore();
      restoreEnv();
    }
  });

  it("warns (not silent) when Sage returns nothing on school days", async () => {
    const restoreEnv = stubIcalEnv();
    const restore = stubFetch({ sageEmpty: true });
    try {
      const { GET } = await import("@/app/api/cron/sync/route");
      const res = await GET(
        new NextRequest("http://localhost/api/cron/sync", {
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean; warnings: string[] };
      expect(body.ok).toBe(true);
      expect(body.warnings.length).toBeGreaterThan(0);
      expect(body.warnings[0]).toContain("139455");
      const meta = (await getAdminDb().collection("meta").doc("sync").get()).data() as Record<string, unknown>;
      expect((meta["errors"] as string[]).length).toBeGreaterThan(0); // surfaces the stale badge
    } finally {
      restore();
      restoreEnv();
    }
  });
});
