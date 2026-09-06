import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/admin";
import { todayPtId } from "@/lib/dates";
import { runSync } from "@/lib/cron-sync";

export const runtime = "nodejs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET ?? "";
  const authz = request.headers.get("authorization") ?? "";
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const todayId = todayPtId();
  const nowIso = new Date().toISOString();
  const metaRef = db.collection("meta").doc("sync");

  try {
    const result = await runSync({
      fetchText: async (url: string) => {
        const res = await fetch(url, { headers: { "User-Agent": UA } });
        if (!res.ok) throw new Error(`ical ${res.status}`);
        return res.text();
      },
      sageFetch: fetch,
      db,
      todayId,
      icalUrl: process.env.ICAL_URL ?? "https://www.example-school.org/calendar/calendar_436.ics",
      lunchMenuId: process.env.SAGE_LUNCH_MENU_ID ?? "139455",
      breakfastMenuId: process.env.SAGE_BREAKFAST_MENU_ID ?? "138778",
    });
    await metaRef.set(
      {
        lastSuccess: nowIso,
        lastAttempt: nowIso,
        datesWritten: result.datesWritten,
        errors: result.warnings,
      },
      { merge: true },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Keep stale data: never wipe the window on a failed fetch.
    const message = err instanceof Error ? err.message : String(err);
    await metaRef.set(
      { lastAttempt: nowIso, errors: [message] },
      { merge: true },
    );
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
