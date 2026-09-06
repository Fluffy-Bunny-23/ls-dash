# LS Dash

Personal dashboard: **Today (default) + Month toggle** showing the ABC day,
special schedules / days off, and Sage lunch + breakfast entrées. Built per
`ref/lsdash-plan.md`.

- Stack: Next.js App Router + TypeScript + Tailwind + shadcn UI, Vercel.
  Brand theme: shadcn `--primary` = Lakeside maroon `#820024`, `--secondary` =
  gold `#ECAA1F` (see `:root` in `src/app/globals.css`). Components are stock
  `shadcn add` output (Base UI primitives); `cn` comes from `@/lib/utils`.
- Food completeness: lunch captures all 8 API categories; breakfast captures
  the same categories (meal-filtered) PLUS per-date `Daily` offerings (daily
  platter, beverages, accompaniments) via one extra single-day `getMenuItems`
  call per weekday — weekly payloads don't carry per-day Daily items
  (verified against the live site + API). Stored as `breakfast.daily`, shown
  in the Today view; Month cells stay entrée-first per the plan.
- Auth: Google + Firebase, `lakesideschool.org` only. Logged-out users see a
  generic wall that reveals nothing school-specific.
- Reads: client → Firestore directly (no `/api/*` read routes).
- Writes: Vercel Cron → `GET /api/cron/sync` (Admin SDK) only. Clients never write.
- Timezone `America/Los_Angeles`; cron `0 12 * * *` (12:00 UTC ≈ 5am PT).

## Dev (emulators only — never touch prod)

Prereqs: Node 24, and Java for the Firestore emulator. This repo has no sudo,
so Java comes from the Ubuntu package extracted to `~/coding/tmp/jre`:

```sh
export JAVA_HOME=~/coding/tmp/jre/usr/lib/jvm/java-21-openjdk-arm64
export PATH="$JAVA_HOME/bin:$PATH"   # separate export! (same-line $JAVA_HOME is empty)
```

Terminal 1 — emulators (own ports; 8080/9099 belong to someone else):

```sh
firebase emulators:start --only auth,firestore --project demo-ls-dash
```

Terminal 2 — seed + dev server:

```sh
npm install
npx tsx scripts/seed.ts   # A-day + special day + no-school + weekend docs (HAR entrée names)
npm run dev -- --port 3100
```

`.env.local` is pre-wired for the emulators. Open http://127.0.0.1:3100 and use
**Dev sign-in** (emulator-only; Google popup can't run against the emulator).

## Tests

```sh
npm test                                   # vitest: ical, sage (both HARs), dates,
                                           # sync/format, cron 401+write+prune, rules matrix
npm run seed                               # emulator tests rewrite days/* via Admin SDK —
                                           # ALWAYS reseed before the browser run
node scripts/browser-check.mjs             # 21 CDP checks vs the dev or prod server
                                           # (LSDASH_BASE=http://127.0.0.1:3101 for prod),
                                           # screenshots in /tmp/lsdash-evidence/
```

The cron route test stubs `fetch` (ICS sample + synthesized Sage weeks) so it
never hits the network; the seed uses entrée names from `ref/Sage*.har`.

## Deploy (Vercel + Firebase)

1. Firebase console: create project, enable Google auth, create Firestore.
   Deploy rules: `firebase deploy --only firestore:rules`.
2. Vercel env — server-only (never `NEXT_PUBLIC_`):
   `FIREBASE_SERVICE_ACCOUNT` (Admin JSON), `CRON_SECRET` (random 16+ chars).
   Client: `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`.
   Optional overrides: `ICAL_URL`, `SAGE_LUNCH_MENU_ID=139455`,
   `SAGE_BREAKFAST_MENU_ID=138778`. Do **not** set the `*_EMULATOR_HOST` vars.
3. `vercel.json` already schedules `GET /api/cron/sync` at `0 12 * * *`.
   Vercel sends `Authorization: Bearer <CRON_SECRET>`; anything else gets 401.
4. Without emulator env vars, `/api/dev/token` returns 404 and the Dev
   sign-in button is hidden — Google (`hd=lakesideschool.org`) is the only path.

## Notes / deviations from `ref/lsdash-plan.md`

- **Breakfast extractor filters on `item.meal`.** The breakfast weekly payload
  mixes `Morning Snack`/`Afternoon Snack` items into the same category arrays
  (verified in `ref/Sage-breakfast.har`); the plan's "same extractor works"
  claim only holds with this filter.
- **ABC regex widened** to `/\bMS\s+(?:special\s+)?([ABC])\s+day\b/i` — the
  plan's proposed regex does not match `MS special B day schedule`.
- **Sage window = 10 anchors / 20 calls** for ±30d (plan says "~9 / ~18";
  exact count depends on week alignment).
- **Ports**: emulators run on 8081/9090 (8080/9099 already taken on this host).
- **Background terminals used instead of tmux** per the operator's instruction
  (§9 asks for tmux; the request overrode it).
- **`meta/sync` is subscribed once per session** (`SyncMetaProvider` in the
  root layout) instead of per page — fewer reads/streams, same badge.
- **Cron writer lives in `src/lib/cron-sync.ts`** (`runSync`), called by the
  thin `GET /api/cron/sync` route — Next.js route modules reject non-route
  exports at build time.
- The live `calendar_436.ics` snapshot is vendored at
  `src/lib/__fixtures__/calendar_436.sample.ics` for the parser tests.
