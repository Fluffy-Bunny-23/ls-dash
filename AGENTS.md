# AGENTS.md — LS Dash

Start here before touching code: `skills/ls-dash-dev/SKILL.md` (emulators, ports,
seed, browser checks) + `README.md` (deploy, PAWS, deviations).

## Ground rules

- Emulators only for dev/test. Never touch prod Firebase unless the user
  explicitly asked for a prod write in this turn.
- Never commit secrets (`.env.local`, service-account JSON, rendered
  `firestore.rules`). Never push without explicit confirmed consent.
- Nothing school-specific in the repo or client bundle (domain, emails,
  calendar URL, PAWS text). It lives in env / Firestore, never in code.
- Clients read `days/*` + `meta/sync` only; only the cron (Admin SDK) and the
  PAWS script below write. `overrides/*` is never client-readable (see
  `firestore.rules.template` + `src/lib/firestore-rules.test.ts`).

## PAWS schedule update (screenshot -> Firebase -> client)

The user says "update the PAWS schedule" and attaches a screenshot of the
school's PAWS table. The client (Today + Month) subscribes to `days/*` via
`onSnapshot` (`src/lib/use-days.ts`), so once Firestore holds the new `paws`
fields the app updates with no redeploy. Do all of this locally; the script
does both writes the app needs.

1. Read the screenshot the user gave you (image path in the request). Never
   guess dates: transcribe exactly what the table shows. Dates are Mon–Fri
   `YYYY-MM-DD`; confirm the year from context (school tables often omit it).
2. Write the transcription to `/tmp/paws-YYYY-MM-DD.json` (NOT in the repo).
   Either shape is fine — flat is simplest:
   ```json
   {
     "2026-09-28": { "title": "Assembly", "details": ["Theater"], "week": "PAWS 9/28-10/2" },
     "2026-09-29": { "title": "Advisory / GSL Prep", "details": ["5th: Advisory", "8th: GSL Prep"] }
   }
   ```
   Wrapped with a shared banner also works:
   ```json
   { "week": "PAWS 9/28-10/2", "days": { "2026-09-28": { "title": "Assembly", "details": ["Theater"] } } }
   ```
   Rules: `title` non-blank (max 120 chars), `details` 0–12 non-blank strings,
   `week` banner e.g. `PAWS 9/28-10/2` (max 60). Trim whitespace; keep the
   school's wording verbatim. Max 10 dates (one week).
3. Validate without writing:
   ```sh
   ./scripts/update-paws.sh /tmp/paws-YYYY-MM-DD.json --dry-run
   # or with a shared banner: --week "PAWS 9/28-10/2"
   ```
   Fix every error the validator reports and re-run. Never hand-edit Firestore
   to bypass it — the validator enforces the same shape the cron bakes
   (`src/lib/sync.ts` `parseOverridePaws`; strict wrapper in
   `src/lib/paws-input.ts`).
4. Write it. Emulator (safe, for preview): export
   `FIRESTORE_EMULATOR_HOST=127.0.0.1:8081` (+ `FIREBASE_PROJECT_ID` if not the
   demo project), reseed first if needed (`npx tsx scripts/seed.ts`), then run
   the script without `--dry-run`. Prod (only on explicit request): unset the
   emulator var and provide `FIREBASE_PROJECT_ID` plus
   `FIREBASE_SERVICE_ACCOUNT_PATH` (preferred) or `FIREBASE_SERVICE_ACCOUNT`.
   ```sh
   ./scripts/update-paws.sh /tmp/paws-YYYY-MM-DD.json
   ```
   The script merges into `overrides/paws` (survives the next cron) AND patches
   `days/<date>` `paws` (immediate client visibility). Missing `days/*` docs
   are created paws-only and noted — the next cron fills in ABC/menus.
5. Verify: the script prints every date written — read it back and compare
   against the screenshot (titles, details, week). Report any `days/*` doc
   that was missing. Run `npm test` if you touched validation/sync code.
6. Tell the user: signed-in Today + Month views pick it up automatically
   (live `onSnapshot` on `days/*`); logged-out users see nothing (PAWS never
   ships in the client bundle). No redeploy needed. Delete nothing; default is
   merge (`--replace` only when the table was rebuilt from scratch).

Manual fallback (no script): Firebase console -> Firestore -> collection
`overrides`, doc `paws`, one field per date with the same shape; the next cron
sync bakes it into the day docs (see `README.md` "PAWS week").
