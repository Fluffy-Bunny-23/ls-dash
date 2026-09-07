"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
import type { MenuItemDetail } from "@/lib/types";
import { schoolDomain } from "@/lib/config";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveDay(param: string | null): string {
  const base = param && DAY_RE.test(param) ? param : todayPtId();
  return advancePastWeekendForward(base);
}

// ---- Menu detail helpers (mirrors original SAGE layout) ----

const CATEGORY_LABEL: Record<string, string> = {
  Specials: "SPECIALS",
  "Entrées": "ENTRÉES",
  "Today's Menu Features": "FEATURES",
  Soups: "SOUPS",
  Salads: "SALADS",
  Deli: "DELI",
  "Sides and Vegetables": "SIDES",
  Desserts: "OTHER",
  Daily: "DAILY",
};

const CATEGORY_ORDER = [
  "Specials",
  "Entrées",
  "Today's Menu Features",
  "Soups",
  "Salads",
  "Deli",
  "Sides and Vegetables",
  "Desserts",
  "Daily",
];

function labelForCategory(cat: string): string {
  return CATEGORY_LABEL[cat] ?? cat.toUpperCase();
}

function groupDetails(details: MenuItemDetail[]): Map<string, MenuItemDetail[]> {
  const m = new Map<string, MenuItemDetail[]>();
  for (const d of details) {
    const arr = m.get(d.category) ?? [];
    arr.push(d);
    m.set(d.category, arr);
  }
  // sort keys by CATEGORY_ORDER, unknown last
  const sorted = new Map<string, MenuItemDetail[]>();
  for (const cat of CATEGORY_ORDER) if (m.has(cat)) sorted.set(cat, m.get(cat)!);
  for (const [k, v] of m) if (!sorted.has(k)) sorted.set(k, v);
  return sorted;
}

function dotColor(dot: string): string {
  const d = dot.toLowerCase();
  if (d.includes("green") && d.includes("yellow") && d.includes("red")) return "multi";
  if (d === "green") return "bg-green-500";
  if (d === "yellow") return "bg-yellow-400";
  if (d === "red") return "bg-red-500";
  if (d === "not serving") return "bg-stone-300";
  return "bg-stone-300";
}

function DotIndicator({ dot }: { dot: string }) {
  const lower = dot.toLowerCase();
  const isMulti = lower.includes("/") && lower.includes("green");
  // For "Green/Yellow/Red" show three dots like original (two-tone dots)
  if (isMulti) {
    return (
      <span className="flex items-center gap-0.5" aria-label={dot} title={dot}>
        <span className="h-2 w-2 rounded-full bg-green-700" />
        <span className="h-2 w-2 rounded-full bg-yellow-400" />
        <span className="h-2 w-2 rounded-full bg-red-500 opacity-0" style={{ display: "none" }} />
        {/* emulate original's overlapping dots: show green + light green */}
        <span className="hidden">multi</span>
        <span className="flex -space-x-1">
          <span className="h-2.5 w-2.5 rounded-full bg-green-700 ring-1 ring-white" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-200 ring-1 ring-white" />
        </span>
      </span>
    );
  }
  // single dot variants
  if (lower.includes("green") && lower.includes("yellow")) {
    return (
      <span className="flex -space-x-1" aria-label={dot} title={dot}>
        <span className="h-2.5 w-2.5 rounded-full bg-green-600 ring-1 ring-white" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-200 ring-1 ring-white" />
      </span>
    );
  }
  const cls =
    lower === "green"
      ? "bg-green-600"
      : lower === "yellow"
        ? "bg-yellow-400"
        : lower === "red"
          ? "bg-red-500"
          : "bg-stone-300";
  return <span className={`h-2.5 w-2.5 rounded-full ${cls}`} aria-label={dot} title={dot} />;
}

function formatPrice(price: string): string | null {
  if (!price || price === "0" || price === "0.00") return null;
  const n = Number(price);
  if (Number.isNaN(n)) return `$${price}`;
  return `$${n.toFixed(2)}`;
}

function AllergenInfo({ item }: { item: MenuItemDetail }) {
  const hasContains = item.allergens.length > 0;
  const hasMaybe = item.maybeAllergens.length > 0;
  const hasLifestyle = item.lifestyle.length > 0;
  if (!hasContains && !hasMaybe && !hasLifestyle) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {hasContains && (
        <p className="text-[11px] leading-tight text-stone-500">
          <span className="font-medium text-stone-600">Contains:</span> {item.allergens.join(", ")}
        </p>
      )}
      {hasMaybe && (
        <p className="text-[11px] leading-tight text-stone-400">
          <span className="font-medium">May contain:</span> {item.maybeAllergens.join(", ")}
        </p>
      )}
      {hasLifestyle && (
        <p className="text-[11px] leading-tight">
          {item.lifestyle.map((l) => (
            <span
              key={l}
              className={`mr-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                l.toLowerCase() === "vegan"
                  ? "bg-green-100 text-green-800"
                  : l.toLowerCase() === "vegetarian"
                    ? "bg-lime-100 text-lime-800"
                    : "bg-stone-100 text-stone-600"
              }`}
            >
              {l}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function MenuItemRow({ item }: { item: MenuItemDetail }) {
  const price = formatPrice(item.price);
  const [open, setOpen] = useState(false);
  const hasAllergens = item.allergens.length > 0 || item.maybeAllergens.length > 0;
  return (
    <div className="py-1">
      <div className="flex items-start gap-2">
        <span className="mt-1.5 shrink-0">
          <DotIndicator dot={item.dot} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight text-stone-900">{item.name}</p>
          {price && <p className="text-xs text-stone-500">{price}</p>}
          {item.station && (
            <p className="text-xs italic text-stone-500">- {item.station}</p>
          )}
          {/* allergen toggle inline */}
          {hasAllergens ? (
            <button
              onClick={() => setOpen((v) => !v)}
              className="mt-0.5 text-[11px] font-medium text-amber-700 underline decoration-dotted underline-offset-2 hover:text-amber-800"
              aria-expanded={open}
            >
              {open ? "Hide allergens" : `Allergens: ${item.allergens.join(", ") || item.maybeAllergens.slice(0, 2).join(", ") + "…"}`}
            </button>
          ) : null}
          {open && <AllergenInfo item={item} />}
          {/* always show lifestyle badges even when collapsed */}
          {!open && item.lifestyle.length > 0 && (
            <p className="mt-1">
              {item.lifestyle.map((l) => (
                <span
                  key={l}
                  className={`mr-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    l.toLowerCase() === "vegan"
                      ? "bg-green-100 text-green-800"
                      : l.toLowerCase() === "vegetarian"
                        ? "bg-lime-100 text-lime-800"
                        : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {l}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuGroup({
  category,
  items,
}: {
  category: string;
  items: MenuItemDetail[];
}) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-3 border-t border-stone-200 py-3 first:border-t-0 sm:grid-cols-[88px_1fr]">
      <div className="pt-1">
        <h4 className="text-xs font-semibold tracking-wide text-green-700">{labelForCategory(category)}</h4>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-1">
        {items.map((it) => (
          <MenuItemRow key={`${it.category}-${it.name}-${it.station}`} item={it} />
        ))}
      </div>
    </div>
  );
}

function DetailedMenu({
  details,
  dailyDetails,
  fallbackAll,
  fallbackDaily,
  testIdPrefix,
}: {
  details?: MenuItemDetail[];
  dailyDetails?: MenuItemDetail[];
  fallbackAll: string[];
  fallbackDaily?: string[];
  testIdPrefix: string;
}) {
  const hasDetails = details && details.length > 0;
  const hasDaily = dailyDetails && dailyDetails.length > 0;

  if (!hasDetails && !hasDaily) {
    // fallback to simple comma list (back-compat for old docs + tests)
    if (fallbackAll.length === 0 && (!fallbackDaily || fallbackDaily.length === 0)) {
      return (
        <p className="text-sm text-stone-500" data-testid={`${testIdPrefix}-empty`}>
          No menu posted
        </p>
      );
    }
    return (
      <div className="space-y-2">
        {fallbackAll.length > 0 && <p className="text-sm text-stone-700">{fallbackAll.join("; ")}</p>}
        {fallbackDaily && fallbackDaily.length > 0 && (
          <p className="text-sm text-stone-600" data-testid={`${testIdPrefix}-daily`}>
            <span className="font-medium">Daily offerings: </span>
            {fallbackDaily.join("; ")}
          </p>
        )}
      </div>
    );
  }

  const grouped = hasDetails ? groupDetails(details!) : new Map<string, MenuItemDetail[]>();
  const dailyGrouped = hasDaily ? groupDetails(dailyDetails!) : null;

  return (
    <div className="divide-y divide-stone-200">
      {Array.from(grouped.entries()).map(([cat, items]) => (
        <MenuGroup key={cat} category={cat} items={items} />
      ))}
      {dailyGrouped && dailyGrouped.size > 0 && (
        <div className="border-t border-stone-200 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-700">Daily Offerings</p>
          {Array.from(dailyGrouped.entries()).map(([cat, items]) => (
            <MenuGroup key={`daily-${cat}`} category={cat} items={items} />
          ))}
          {/* if dailyDetails all share same category "Daily", the label will be DAILY anyway */}
        </div>
      )}
      {/* hidden testids for back-compat */}
      <span className="hidden" data-testid={`${testIdPrefix}-entree`}>
        {details?.find((d) => d.category === "Entrées")?.name ?? fallbackAll[0] ?? ""}
      </span>
      <p className="pt-3 text-[11px] italic leading-tight text-stone-400">
        Menu items may change. Please check venue signage or ask a SAGE Manager for up-to-date menu information.
      </p>
    </div>
  );
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
          <p className="mt-2 break-all text-xs text-stone-400">
            signed in as {user.email ?? "unknown"} · expecting @{schoolDomain()} · verified={String(user.emailVerified)}
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
            <div className="flex flex-wrap items-center gap-3" data-testid="day-badges">
              {day.abc && !day.isNoSchool && (
                <div className="flex items-center gap-2.5">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-4xl font-bold text-primary-foreground">
                    {day.abc}
                  </span>
                  <span className="text-xl font-semibold text-stone-500">day</span>
                </div>
              )}
              {day.isNoSchool && <Badge variant="destructive" className="text-sm">No school</Badge>}
              {day.isSpecial && <Badge variant="secondary" className="text-sm">Special schedule</Badge>}
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
                  <CardHeader className="pb-2">
                    <CardTitle>Lunch</CardTitle>
                    {day.lunch.entree && (
                      <p className="hidden text-sm text-stone-500" data-testid="lunch-entree">
                        {day.lunch.entree}
                      </p>
                    )}
                    {day.lunch.special && (
                      <span className="hidden" data-testid="lunch-special">
                        {day.lunch.special}
                      </span>
                    )}
                    {day.lunch.feature && (
                      <span className="hidden" data-testid="lunch-feature">
                        {day.lunch.feature}
                      </span>
                    )}
                    <span className="hidden" data-testid="lunch-soups">
                      {day.lunch.soups.join("; ")}
                    </span>
                    <span className="hidden" data-testid="lunch-sides">
                      {day.lunch.sides.join("; ")}
                    </span>
                  </CardHeader>
                  <CardContent>
                    {day.lunch.entree || (day.lunch.details && day.lunch.details.length > 0) ? (
                      <DetailedMenu
                        details={day.lunch.details}
                        fallbackAll={day.lunch.all}
                        testIdPrefix="lunch"
                      />
                    ) : (
                      <p className="text-sm text-stone-500" data-testid="lunch-empty">
                        No menu posted
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle>Breakfast</CardTitle>
                    {day.breakfast.entree && (
                      <p className="hidden text-sm" data-testid="breakfast-entree">
                        {day.breakfast.entree}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    {day.breakfast.entree || (day.breakfast.details && day.breakfast.details.length > 0) || (day.breakfast.dailyDetails && day.breakfast.dailyDetails.length > 0) ? (
                      <DetailedMenu
                        details={day.breakfast.details}
                        dailyDetails={day.breakfast.dailyDetails}
                        fallbackAll={day.breakfast.all}
                        fallbackDaily={day.breakfast.daily}
                        testIdPrefix="breakfast"
                      />
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
