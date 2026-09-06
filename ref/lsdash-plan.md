# LS Dash

## 1. What it is
Personal dashboard for Lakeside School: **Today (default) + Month toggle** showing ABC day, special schedule / day off, and Sage lunch + breakfast entrée per day. Weekends not navigable.

Locked decisions:
- Auth: Google + Firebase, `lakesideschool.org` only. Logged-out users see a generic login wall that reveals nothing school-specific.
- Writes: Vercel Cron only (1×/day, before 6am PT, Hobby limits). Clients never write.
- Stack: Next.js App Router + shadcn on Vercel, Firestore for data.
- Colors: maroon base `#820024`, gold accent `#ECAA1F`.
- Timezone: `America/Los_Angeles`. Cron ~5am PT.
- Stale/error badge: "updated X ago, please email zaned31@lakesideschool.org for help".
- Retention: rolling window only — 1 month back + 1 month ahead. Cache both iCal and menu.

## 2. Stack / project shape + data flow
- `Next.js (App Router) + TypeScript + shadcn + Tailwind`, deployed on Vercel.
- `Firebase Auth (Google provider, hd=lakesideschool.org)` + `Firestore` (client reads only).
- **Reads: client → Firestore directly (Firebase client SDK). No `/api/*` read routes.** Today/Month components subscribe to `days/*` + `meta/sync` with the logged-in user's ID token; security rules enforce school-email-only reads.
- **Writes: Vercel Cron → one private serverless function → Firestore.** On Vercel an "API route" IS the serverless function — Cron can only invoke an HTTP endpoint, so the writer lives at `GET /api/cron/sync`. It is never called by the client; only Vercel Cron triggers it, and it writes via Firebase Admin SDK (bypasses security rules).
- Suggested routes:
  - `/` → Today view (default), Month toggle (If authenticated)
  - `/month?m=2026-09` → month grid (weekdays only)
  - `/api/cron/sync` → private writer only (not for clients, no client fetch calls it)
  - `/login` or inline wall → generic sign-in

## 3. Data sources (verified 2026-09-05)

### 3a. Sage Dining — reverse-engineered from `ref/Sage.har` (Lunch) + `ref/Sage-breakfast.har` (Breakfast)
- Lunch `menuId=139455` (`tmp/Sage.har`, 3 requests):
  - `GET /microsites/getMenuItems?menuId=139455&date=MM/DD/YYYY&meal=Lunch&mode=`
  - `GET /microsites/getWeeklyMenuItems?menuId=139455&date=MM/DD/YYYY` ← preferred for sync (one call = full week Sun–Sat + `daily` key)
  - `GET /microsites/getMonthlyEvents?menuId=139455&date=MM/DD/YYYY` ← closures/events (use THIS menuId for events)
- Breakfast `menuId=138778` (`tmp/Sage-breakfast.har`, 5 requests):
  - `GET /microsites/getMenuItems?menuId=138778&date=MM/DD/YYYY&meal=Breakfast&mode=`
  - `GET /microsites/getWeeklyMenuItems?menuId=138778&date=MM/DD/YYYY` ← preferred for sync, same week-key shape
  - `GET /microsites/getMonthlyEvents?menuId=138778&...` returns `[]` — ignore, use lunch menuId for events
  - Same menuId also serves `meal=Morning Snack` / `meal=Afternoon Snack` — **out of scope**, sync only `meal=Breakfast`
- Env: `SAGE_LUNCH_MENU_ID=139455`, `SAGE_BREAKFAST_MENU_ID=138778`.

Observed:
- Weekly keys are `MM/DD/YYYY` (e.g. `09/06/2026`–`09/12/2026`) + `daily` (condiments/dressings/milk — ignore for entrée).
- Empty categories = no service. Verified: Sun 09/06, Mon 09/07, Sat 09/12 all empty. Monthly events confirms `09/07 Labor Day` + `09/15 Chef Carved Brisket`, `09/24 Apples`.
- Lunch categories include: `Today's Menu Features, Specials, Soups, Salads, Deli, Entrées, Sides and Vegetables, Desserts`.
- **Entrée rule (proposed):** month cell shows `Entrées[0].name` if present, else `Specials[0].name`, else first of `Today's Menu Features`. Today view shows all three + soups/sides. Normalize whitespace (`Pho    Bar` → `Pho Bar`). Breakfast verified 09/09/2026 e.g. Entrées: `Bacon`, Specials: `Lions Cucumber Shakers`, Sides: `Sticky Rice`, Desserts: `Pineapple Cup` — same extractor works for both menuIds; skip `Daily` (condiments) and `Morning/​Afternoon Snack` meals.

### 3b. ABC / special / days-off — `calendar_436.ics`
- URL: `https://www.lakesideschool.org/calendar/calendar_436.ics`, cal name `MS ABC Schedule` (Middle School only — confirm whether LS Dash is MS-only or needs US/LS feeds too).
- Format is simple all-day `VEVENT`s: `DTSTART;VALUE=DATE:YYYYMMDD` + `SUMMARY`.
- Observed summaries:
  - `MS A day`, `MS B day`, `MS C day`
  - `MS special B day schedule`, `MS special A day schedule`, `MS special C day schedule`, `MS special schedule (first day of school)`
  - `MS sports day (no ABC schedule today)`, `MS Field Day (special schedule)`
- Proposed regex (case-insensitive):
  - ABC: `/\bMS\s+([ABC])\s+day\b/` → `abc: A|B|C`
  - Special: `/special/i` → `isSpecial=true`, keep raw summary as `specialLabel`
  - No-ABC override: `/(no ABC schedule today)/i` → `abc=null`, `isSpecial=true`
- **Days off:** Sept 7 (Labor Day Mon) has **no VEVENT at all** — absence = day off. Rule: Mon–Fri with no event in feed = `isNoSchool=true` ("No school"). Cross-check with Sage empty + `getMonthlyEvents` label when available. Weekends are never school days and not navigable in UI.
- **Multi-day breaks:** no multi-day VEVENTs observed; breaks appear as consecutive missing weekdays (e.g. Thanksgiving, spring break). Month view renders each missing weekday as a "No school" cell and optionally groups them with a spanning banner. No special ICS `DURATION` handling needed unless a ranged event appears — parser should still support `DTEND`/`DURATION` if encountered.

## 4. Firestore schema
- `days/{YYYY-MM-DD}` (PT date id):
  ```json
  {
    "date": "2026-09-11",
    "dow": "Thu",
    "abc": "A",
    "isSpecial": false,
    "specialLabel": null,
    "isNoSchool": false,
    "noSchoolLabel": null,
    "lunch": {"entree": "…", "special": "…", "feature": "…", "all": ["…"]},
    "breakfast": {"entree": "…", "all": ["…"]},
    "sources": {"icalUid": "…", "sageWeek": "09/11/2026"},
    "updatedAt": "<serverTimestamp>"
  }
  ```
- `meta/sync`: `{ lastSuccess, lastAttempt, datesWritten, errors[] }` → powers the "updated X ago" badge.
- Retention: after each sync, delete `days/*` outside `[today-30d, today+30d]`.
- Rules: reads require `request.auth.token.email_verified && request.auth.token.email.matches('.*@lakesideschool\\.org$')`; **no client writes** (`allow write: if false`). Writes only via Admin SDK in cron.
- Secrets (server-only, never `NEXT_PUBLIC_`): `FIREBASE_SERVICE_ACCOUNT` (Admin service-account JSON), `CRON_SECRET` (random 16+ chars). No client-side admin keys.

## 5. Sync job — the only serverless writer (Vercel Cron, Hobby-safe)
- What handles the "API call": Vercel Cron makes one authenticated HTTP call per day to our own serverless function at `/api/cron/sync`. That function (Node.js runtime, NOT Edge — Admin SDK needs Node) imports `firebase-admin`, inits with `FIREBASE_SERVICE_ACCOUNT`, fetches Sage + iCal server-side, and edits Firestore directly. Clients never touch this endpoint and never write.
- Endpoint protection (Vercel's documented pattern): set `CRON_SECRET` env var; Vercel auto-sends `Authorization: Bearer <CRON_SECRET>` on cron invocations. Route rejects with `401` unless `request.headers.get('authorization') === 'Bearer ' + process.env.CRON_SECRET`. No client code references this route; Firestore rules deny client writes anyway, so a leaked URL alone grants nothing without the secret.
- Schedule: `0 12 * * *` (12:00 UTC = 5am PDT; 4am PST in winter — still before 6am). Single daily run = well within Hobby cron limits. Make upserts idempotent (same input → same doc) since cron delivery is best-effort.
- Flow in `/api/cron/sync` (after 401 check):
  1. Fetch iCal feed, parse events in window `[today-30, today+30]`.
  2. `getWeeklyMenuItems` for ~9 week-anchor dates covering the window × 2 menuIds (lunch `139455` + breakfast `138778`) = ~18 calls/day, trivial. Monthly events only on lunch menuId.
  3. `getMonthlyEvents` for current + next month (closure labels).
  4. Merge per PT date: iCal (abc/special/no-school) + Sage (entrées) → upsert `days/*`.
  5. Prune out-of-window docs, update `meta/sync`.
  6. On failure: keep stale data, record error in `meta/sync`, UI shows stale badge. Never wipe the window on a failed fetch.
- Rate/toS note: Sage has no public API; keep to 1 bulk weekly call per week-anchor, normal UA, no parallel hammering.

## 6. UI
- Global: maroon `#820024` base surfaces/headers, gold `#ECAA1F` accents/active states. shadcn `Button, Card, Badge, Calendar, Tabs/Toggle, Skeleton, Tooltip`. Mobile-first; Today is default.
- Login wall (logged-out / non-school domain): generic "Please sign in to continue" + Google button. No mention of Lakeside, ABC, or menu until authed.
- Today view: date header (skip weekends — auto-advance Fri→Mon), badges for `No school` / `Special` / `A·B·C`, lunch entrée + full sections, breakfast entrée, `specialLabel`/`noSchoolLabel`, footer "updated X ago…".
- Month view: weekday-only grid; cell priority from spec: **1) day off / special schedule, 2) ABC, 3) lunch, 4) breakfast**. Truncate entrée with tooltip/expand on mobile. Multi-day no-school stretches get a shared tint + optional span banner. Weekend columns hidden or disabled (per "don't even let the user navigate to weekends").
- States: loading skeletons, empty ("No menu posted"), stale badge with support email.

## 7. Build order (proposed)
1. Next.js + shadcn + theme tokens + login wall + Firebase Auth (hd check).
2. iCal parser + unit tests on saved feed sample (A/B/C, special, sports-day, missing-day=off).
3. Sage weekly fetcher + entrée extractor + tests on HAR fixtures.
4. Firestore schema + rules + read-only client hooks.
5. Cron route + Admin SDK + prune + `meta/sync`.
6. Today + Month UI, weekend guard, stale badge.
7. Vercel envs, cron schedule, domain allowlist check.

## 8. Open risks / TODOs
- Breakfast resolved (`138778`) — still ignore `Morning/​Afternoon Snack` on that menuId.
- Feed is **MS-only** — confirm US/LS out of scope.
- `calendar_436.ics` could rename summaries — regex + raw-label fallback covers it, but watch cron error logs first weeks.
- Sage `menuId`s could rotate yearly — kept as env vars, alert on all-empty weeks.
## 9. Build & verify protocol (agent follows this, no shortcuts)
- Location: build the app in your current dir (`coding/ls-dash/`, alongside `ref/`). References live in `./ref/` (`lsdash-plan.md`, `Sage.har`, `Sage-breakfast.har`). Never write to `~`. Never push remote.
- Fix-retest loop: any finding against §§1–8 (wrong entrée, bad ABC parse, weekend navigable, leaking login wall, stale badge missing, 401 missing, prune broken, etc.) must be fixed and re-tested. Repeat until zero findings, then report.
- tmux: load the tmux skill; use socket `~/tmux/sockets/agents` with named windows (`emulators`, `dev`, `tests`); poll via `capture-pane`. Never touch the `main` socket `servers` session.
- Dev against Firebase Emulators (Auth + Firestore) only. Seed: A-day + special day + no-school weekday + weekend, with HAR entrée names.
- Tests required: iCal regex cases, Sage extractor on BOTH HARs, weekend guard, stale badge. Cron without secret → 401, with secret → writes + prunes to ±30d.
- Browser-test the running dev server with whatever browser tooling exists in the session and show evidence (screenshots/recording paths, URLs, what was clicked).
