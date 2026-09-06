"use client";

import { Suspense, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { LoginWall } from "@/components/login-wall";
import { AppHeader } from "@/components/app-header";
import { SyncFooter } from "@/components/sync-footer";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useMonthDays } from "@/lib/use-days";
import { monthWeekdayIds, weekdayOfId } from "@/lib/dates";
import { pickCellEntree } from "@/lib/sage";
import type { DayDoc } from "@/lib/types";
import { cn } from "@/lib/utils";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonthPt(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function shiftMonth(m: string, delta: number): string {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7));
  const t = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

function CellBody({ day }: { day: DayDoc | undefined }) {
  if (!day) return <p className="text-xs text-stone-400">—</p>;
  const lunchEntree = pickCellEntree(day.lunch);
  return (
    <div className="min-w-0">
      {/* Priority: 1) day off / special, 2) ABC (top-right corner), 3) lunch, 4) breakfast */}
      {day.isNoSchool ? (
        <p className="truncate text-xs font-semibold text-red-800" title={day.noSchoolLabel ?? "No school"}>
          {day.noSchoolLabel ?? "No school"}
        </p>
      ) : (
        <>
          {day.isSpecial && (
            <p className="truncate text-xs font-semibold text-amber-800" title={day.specialLabel ?? "Special schedule"}>
              {day.specialLabel ?? "Special schedule"}
            </p>
          )}
          {lunchEntree ? (
            <p className="truncate text-xs text-stone-700" title={lunchEntree}>
              {lunchEntree}
            </p>
          ) : (
            <p className="text-xs text-stone-400">No menu posted</p>
          )}
          {day.breakfast.entree && (
            <p className="truncate text-[11px] text-stone-500" title={`Breakfast: ${day.breakfast.entree}`}>
              B: {day.breakfast.entree}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function MonthInner() {
  const params = useSearchParams();
  const { user, loading: authLoading, schoolUser, signOutAll } = useAuth();

  const requested = params.get("m");
  const month = requested && MONTH_RE.test(requested) ? requested : currentMonthPt();

  useEffect(() => {
    document.title = user && schoolUser ? "LS Dash" : "Please sign in to continue";
  }, [user, schoolUser]);

  const ids = useMemo(() => monthWeekdayIds(month), [month]);
  const { days, loaded } = useMonthDays(user && schoolUser ? month : "0000-00");

  // Weekday-only rows: chunk Mon–Fri ids into Mon-start weeks.
  const weeks = useMemo(() => {
    const rows: string[][] = [];
    let row: string[] = [];
    for (const id of ids) {
      if (weekdayOfId(id) === 1 && row.length > 0) {
        rows.push(row);
        row = [];
      }
      row.push(id);
    }
    if (row.length > 0) rows.push(row);
    return rows;
  }, [ids]);

  if (authLoading) {
    return (
      <main className="mx-auto max-w-5xl p-4">
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }
  if (!user) return <LoginWall />;
  if (!schoolUser) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-stone-100 p-4">
        <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">No access</h1>
          <p className="mt-1 text-sm text-stone-500">
            This account doesn&apos;t have access. Please use an authorized account.
          </p>
          <Button className="mt-4 w-full" variant="outline" onClick={() => void signOutAll()}>
            Sign out
          </Button>
        </div>
      </main>
    );
  }

  const monthLabel = `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

  return (
    <div className="min-h-dvh">
      <AppHeader active="month" />
      <main className="mx-auto max-w-5xl space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/month?m=${shiftMonth(month, -1)}`}
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100"
          >
            ← Prev
          </Link>
          <h1 className="text-xl font-bold">{monthLabel}</h1>
          <Link
            href={`/month?m=${shiftMonth(month, 1)}`}
            className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100"
          >
            Next →
          </Link>
        </div>

        {!loaded ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <div className="space-y-2" data-testid="month-grid">
            <div className="grid grid-cols-5 gap-1 text-center text-xs font-semibold text-stone-500 sm:gap-2">
              {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            {weeks.map((row, i) => {
              const allOff =
                row.length === 5 && row.every((id) => days.get(id)?.isNoSchool);
              return (
                <div key={i}>
                  {allOff && (
                    <p
                      data-testid="noschool-banner"
                      className="mb-1 rounded-md bg-red-100 px-2 py-1 text-center text-xs font-semibold text-red-800"
                    >
                      No school all week
                    </p>
                  )}
                  <div className="grid grid-cols-5 gap-1 sm:gap-2">
                    {row.map((id) => {
                      const day = days.get(id);
                      const off = day?.isNoSchool ?? false;
                      return (
                        <Link
                          key={id}
                          href={`/?d=${id}`}
                          data-date={id}
                          data-noschool={off ? "true" : "false"}
                          title={id}
                          className={cn(
                            "min-h-20 rounded-lg border bg-white p-1.5 text-left hover:border-secondary sm:min-h-24 sm:p-2",
                            off
                              ? "border-red-200 bg-red-50"
                              : day?.isSpecial
                                ? "border-amber-300"
                                : "border-stone-200",
                          )}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-xs font-semibold text-stone-500">
                              {Number(id.slice(8, 10))}
                            </p>
                            {day?.abc && !off && (
                              <Badge variant={day.isSpecial ? "secondary" : "default"}>
                                {day.abc}
                              </Badge>
                            )}
                          </div>
                          <CellBody day={day} />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <SyncFooter />
      </main>
    </div>
  );
}

export default function MonthPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-5xl p-4">
          <Skeleton className="h-64 w-full" />
        </main>
      }
    >
      <MonthInner />
    </Suspense>
  );
}
