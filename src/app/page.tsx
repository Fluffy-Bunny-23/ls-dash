"use client";

import { Suspense, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { LoginWall } from "@/components/login-wall";
import { AppHeader } from "@/components/app-header";
import { SyncFooter } from "@/components/sync-footer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useDay } from "@/lib/use-days";
import {
  advancePastWeekendForward,
  isWeekendId,
  prettyDate,
  stepSchoolDay,
  todayPtId,
} from "@/lib/dates";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveDay(param: string | null): string {
  const base = param && DAY_RE.test(param) ? param : todayPtId();
  return advancePastWeekendForward(base);
}

function TodayInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading, schoolUser, signOutAll } = useAuth();

  const requested = params.get("d");
  const dayId = useMemo(() => resolveDay(requested), [requested]);

  useEffect(() => {
    document.title = user && schoolUser ? "LS Dash" : "Please sign in to continue";
  }, [user, schoolUser]);

  // Weekends are not navigable: bounce Sat/Sun (or bad input) forward to Monday.
  useEffect(() => {
    if (requested && requested !== dayId) router.replace(`/?d=${dayId}`);
    else if (!requested && isWeekendId(todayPtId())) router.replace(`/?d=${dayId}`);
  }, [requested, dayId, router]);

  const { day, loaded } = useDay(user && schoolUser ? dayId : null);

  if (authLoading) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-4">
        <Skeleton className="h-10 w-full" />
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

  const prevId = stepSchoolDay(dayId, -1);
  const nextId = stepSchoolDay(dayId, 1);
  const todayId = advancePastWeekendForward(todayPtId());

  return (
    <div className="min-h-dvh">
      <AppHeader active="today" />
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/?d=${prevId}`} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100">
            ← Prev
          </Link>
          <h1 className="text-center text-xl font-bold">{prettyDate(dayId)}</h1>
          <Link href={`/?d=${nextId}`} className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100">
            Next →
          </Link>
        </div>
        {dayId !== todayId && (
          <div className="text-center">
            <Link href={`/?d=${todayId}`} className="text-sm font-medium text-primary underline">
              Back to today
            </Link>
          </div>
        )}

        {!loaded ? (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        ) : !day ? (
          <Card>
            <CardContent className="pt-4 text-center text-sm text-stone-500">
              No data for this day yet.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" data-testid="day-badges">
              {day.isNoSchool && <Badge variant="destructive">No school</Badge>}
              {day.isSpecial && <Badge variant="secondary">Special schedule</Badge>}
              {day.abc && !day.isNoSchool && <Badge>{day.abc} day</Badge>}
            </div>
            {day.specialLabel && (
              <p className="text-sm text-stone-700" data-testid="special-label">
                {day.specialLabel}
              </p>
            )}
            {day.isNoSchool && day.noSchoolLabel && (
              <p className="text-sm text-stone-700" data-testid="noschool-label">
                {day.noSchoolLabel}
              </p>
            )}

            {!day.isNoSchool && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Lunch</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {day.lunch.entree ? (
                      <>
                        <p className="text-lg font-semibold" data-testid="lunch-entree">
                          {day.lunch.entree}
                        </p>
                        {day.lunch.special && (
                          <p className="text-sm" data-testid="lunch-special">
                            <span className="font-medium">Special: </span>
                            {day.lunch.special}
                          </p>
                        )}
                        {day.lunch.feature && (
                          <p className="text-sm" data-testid="lunch-feature">
                            <span className="font-medium">Feature: </span>
                            {day.lunch.feature}
                          </p>
                        )}
                        {day.lunch.soups.length > 0 && (
                          <p className="text-sm" data-testid="lunch-soups">
                            <span className="font-medium">Soups: </span>
                            {day.lunch.soups.join("; ")}
                          </p>
                        )}
                        {day.lunch.sides.length > 0 && (
                          <p className="text-sm" data-testid="lunch-sides">
                            <span className="font-medium">Sides: </span>
                            {day.lunch.sides.join("; ")}
                          </p>
                        )}
                        {day.lunch.all.length > 0 && (
                          <details className="text-sm">
                            <summary className="cursor-pointer font-medium text-primary">
                              Full menu
                            </summary>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-stone-700">
                              {day.lunch.all.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-stone-500" data-testid="lunch-empty">
                        No menu posted
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Breakfast</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {day.breakfast.entree ? (
                      <>
                        <p className="text-lg font-semibold" data-testid="breakfast-entree">
                          {day.breakfast.entree}
                        </p>
                        {day.breakfast.all.length > 1 && (
                          <p className="mt-1 text-sm text-stone-600">
                            {day.breakfast.all.filter((x) => x !== day.breakfast.entree).join("; ")}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-stone-500" data-testid="breakfast-empty">
                        No menu posted
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
        <SyncFooter />
      </main>
    </div>
  );
}

export default function TodayPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl space-y-3 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </main>
      }
    >
      <TodayInner />
    </Suspense>
  );
}
