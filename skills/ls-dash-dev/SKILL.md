---
name: ls-dash-dev
description: Run, seed, and verify the LS Dash dev stack (Firebase Auth + Firestore emulators, Next.js dev server, vitest, headless-Chromium browser checks). Use whenever working on the LS Dash repo — start here before touching code.
---

# LS Dash dev environment

Repo root: the directory containing this skill (all paths below are relative to it).
Stack: Next.js App Router + Firebase client SDK, Vercel Cron writer, Tailwind.
References: `./ref/lsdash-plan.md` (spec), `./README.md` (deploy + deviations).

## 0. Ground rules (non-negotiable)

- **tmux, not background terminals.** Use socket `-S ~/tmux/sockets/agents`
  (check `ls ~/tmux/sockets/` first). Never touch the `main` socket or its
  `servers` session. Suggested session: `ls-dash` with windows `emulators`,
  `dev`, `tests`. Poll with `capture-pane -p -S -100` (scrollback included —
  bare `capture-pane -p` shows only the visible grid, often blank). Fresh
  shells init slowly here: if a capture is empty, wait 5-10s and retry;
  `pipe-pane -o 'cat > /tmp/x'` is the fallback proof of life.
- **Emulators only.** Never touch production Firebase, live DBs, or real
  sinunet channels. `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST`
  must always be set when running app code, seeds, or tests.
- **Never push.** Local commits/branches/tags are fine; `git push` (or any
  remote mutation) needs explicit confirmed consent.
- **No sudo on this host.** Java comes from an extracted `.deb` (see §1).
- **Shared host.** Ports 8080/9099/8443 and CDP 9223 belong to other people —
  use OUR ports (§2). Never kill processes you didn't start (verify with
  `ps`/`ss` first; ancient `[chrome] <defunct>` zombies are not ours).

## 1. Java (no sudo)

```sh
export JAVA_HOME=~/coding/tmp/jre/usr/lib/jvm/java-21-openjdk-arm64
export PATH="$JAVA_HOME/bin:$PATH"   # SEPARATE line! Same-line $JAVA_HOME expands empty.
java -version
```

If a fresh machine lacks `~/coding/tmp/jre`: `cd /tmp && apt-get download
openjdk-21-jre-headless && mkdir -p ~/coding/tmp/jre &&
dpkg-deb -x openjdk-21-jre-headless_*.deb ~/coding/tmp/jre`, then fix the
dangling `/etc/...` symlinks — copy the real files from
`~/coding/tmp/jre/etc/java-21-openjdk/` over the links under
`$JAVA_HOME/conf/` and `$JAVA_HOME/lib/` (symptom otherwise: `Error loading
java.security file`). `cacerts` may stay dangling (TLS-only; emulators use HTTP).

## 2. Ports (ours — do not change without reason)

| Service   | Port | Bind (see firebase.json) |
|-----------|------|--------------------------|
| Firestore emulator | 8081 | 0.0.0.0 |
| Auth emulator      | 9090 | 0.0.0.0 |
| Emulator hub / logging | 4402 / 4502 | 0.0.0.0 |
| Next.js dev | 3000 | 0.0.0.0 (`-H 0.0.0.0`) |
| CDP debugging (browser harness) | 9333 | localhost |

Emulators are on 0.0.0.0 (not localhost) because nginx forwards reach them
from off-host. Reverting to `127.0.0.1` in `firebase.json` is fine for
local-only work but breaks the public URLs (§7).

## 3. Start the stack (tmux)

```sh
tmux -S ~/tmux/sockets/agents new-session -s ls-dash -n emulators -d
tmux -S ~/tmux/sockets/agents send-keys -t ls-dash:emulators \
  'cd <repo> && export JAVA_HOME=~/coding/tmp/jre/usr/lib/jvm/java-21-openjdk-arm64 && export PATH="$JAVA_HOME/bin:$PATH" && export GCLOUD_PROJECT=demo-school-dash && firebase emulators:start --only auth,firestore --project demo-school-dash' Enter
tmux -S ~/tmux/sockets/agents new-window -t ls-dash -n dev
tmux -S ~/tmux/sockets/agents send-keys -t ls-dash:dev \
  'cd <repo> && npm install && npm run dev -- --port 3000 -H 0.0.0.0' Enter
```

Wait for ready (emulators ~60s first boot while the Firestore jar initializes):

```sh
curl -s -m 5 http://127.0.0.1:8081/            # want: Ok
curl -s -m 5 http://127.0.0.1:9090/            # want: {"authEmulator": ...
curl -s -m 10 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/
curl -s -m 10 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/_next/static/chunks/main-app.js  # want: 200
```

If the page is **blank with 200 HTML**: check the chunk URL. `404` on
`/_next/*` means the dev server's manifests are poisoned — almost always
because `next build` ran while dev was serving. Fix: stop dev, `rm -rf .next`,
start dev. **Never run `npm run build` while `next dev` serves the same dir.**

## 4. Seed (required after every emulator restart — storage is in-memory)

```sh
cd <repo> && npx tsx scripts/seed.ts
```

`seed.ts` loads `.env.local` itself. Seeds: Labor-Day no-school weekday,
A-day, special-B day, C-day (HAR entrée names), a Saturday doc (must never be
navigable), and fresh `meta/sync`.

## 5. Test

```sh
cd <repo> && npm run setup && export FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 \
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9090 FIREBASE_PROJECT_ID=demo-school-dash \
  CRON_SECRET=local-test-secret \
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9090 \
  NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8081
npx tsc --noEmit
npx vitest run          # 41 tests: ical, sage (both HARs), dates, sync/format, cron, rules
```

`npm run setup` renders `firestore.rules` from the template (placeholder
domain by default; set `SCHOOL_DOMAIN` for a real one — the rendered file is
gitignored, never commit it).

Warnings: the cron tests rewrite `days/*` via Admin SDK and clean up in
`afterAll`, but ALWAYS `npm run seed` again before browser testing.
`NEXT_PUBLIC_*` bake in at dev-server start — restart dev after any
`.env.local` change. Local-emulator `.env.local` values:

```sh
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9090
NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8081
# (no NEXT_PUBLIC_FIREBASE_EMULATOR_SSL line)
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9090
FIRESTORE_EMULATOR_HOST=127.0.0.1:8081
```

## 6. Browser checks (headless Chromium via CDP, no extra deps)

```sh
cd <repo> && node scripts/browser-check.mjs                 # vs local dev (port 3000)
LSDASH_BASE=https://<app-host> node scripts/browser-check.mjs  # vs public URL
```

21 checks: generic login wall (copy + theme scan), dev-sign-in click, Today
entrées, Month grid (22 weekday cells, zero weekend cells), cell navigation,
weekend bounce, prev/next skip, root default, empty state, fresh + stale
footers. Screenshots land in `/tmp/lsdash-evidence/`. The harness uses a fresh
Chromium profile per run, CDP port 9333, and kills its own process group —
before launching it `pkill`s stale holders of **port 9333 only** (safe: ours
by convention). If a run wedges, check for a stale chrome on 9333
(`ss -tlnp | grep 9333`) before blaming the app.

One-off helpers: `scripts/set-meta.mjs <stale|fresh>` (Admin SDK; emulator
REST enforces rules like prod, so REST can't write meta).

## 7. Public URLs (nginx, TLS) — operator wiring, not repo content

Keep the actual hostnames out of the repo (it's public). The pattern is:

- App: `https://<app-host>` → VM port 3000
- Auth emulator: `https://<auth-host>` → VM port 9090
- Firestore emulator: `https://<firestore-host>` → VM port 8081

with `NEXT_PUBLIC_FIREBASE_{AUTH,FIRESTORE}_EMULATOR_HOST` set to the two
backend hosts and `NEXT_PUBLIC_FIREBASE_EMULATOR_SSL=true`.

The app page is HTTPS, so backends must be HTTPS too (browsers block
plain-HTTP backends as mixed content). `connectFirestoreEmulator()` only does
TLS for Cloud Workstation hosts, so `src/lib/firebase-client.ts` uses
`initializeFirestore({ host, ssl: true })` when
`NEXT_PUBLIC_FIREBASE_EMULATOR_SSL=true` (Auth uses an `https://` emulator
URL, which the SDK preserves). This path was validated end-to-end via a local
self-signed TLS bridge (`scripts/tls-bridge.mjs`).

## 8. Auth emulator quirks (learned the hard way)

- Emulator-minted **custom tokens drop `email`/`email_verified` claims** —
  rules see no email. Dev sign-in therefore uses email+password users created
  via Admin SDK (`/api/dev/token` provisions `tester@<school-domain>`;
  route 404s without the emulator env).
- `accounts:update` with `emailVerified:true` is **ignored** by the emulator —
  always set the flag via Admin SDK `createUser`/`updateUser`.
- Admin SDK and REST `?key=fake` live in **different project namespaces** —
  create users the same way the client signs in (Admin SDK, project
  `demo-school-dash`).
- Rules-denial messages vary (`No matching allow statements` vs `false for
  'get' @ L..`) — match all forms in tests.
- The Firestore emulator occasionally wedges listen streams under rapid
  navigation (`Could not reach backend…10 seconds`); a page reload opens fresh
  listens and recovers. The suite's `waitForSteady` helper does this; a real
  backend won't behave this way.

## 9. Shutdown

Stop the `dev`/`emulators` windows (or `tmux kill-session -t ls-dash`),
`pkill -f "remote-debugging-port=9333"` for stray browsers, delete the public
nginx forwards + rebind emulators to `127.0.0.1` when remote testing is done.
Leave the tree clean; commit locally with an `Implemented With:` trailer per
`~/.pi/agent/AGENTS.md`-style repo rules if present — and never push.
