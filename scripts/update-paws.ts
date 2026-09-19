/**
 * Push a hand-transcribed PAWS week to Firestore.
 *
 * The agent transcribes the user's screenshot into a JSON file (see AGENTS.md
 * "PAWS schedule update" + `src/lib/paws-input.ts` for the accepted shapes),
 * then this script writes it to BOTH places the app needs:
 *
 *   1. `overrides/paws` (merge) — source of truth the Vercel cron bakes into
 *      future syncs, so the week survives the next sync.
 *   2. `days/<YYYY-MM-DD>` (per-date `paws` merge) — what the Today + Month
 *      views already subscribe to via onSnapshot, so signed-in clients pick
 *      the change up immediately with no redeploy.
 *
 * Emulator (safe default): set FIRESTORE_EMULATOR_HOST (+ optionally
 * FIREBASE_AUTH_EMULATOR_HOST). No credentials needed.
 *
 * Prod: unset the emulator vars and provide FIREBASE_PROJECT_ID plus the
 * service account via FIREBASE_SERVICE_ACCOUNT (inline JSON) or
 * FIREBASE_SERVICE_ACCOUNT_PATH (path to the JSON file — preferred in shells
 * so the secret never appears in history). `.env.local` is loaded like
 * `scripts/seed.ts` does, so local runs can keep these out of the shell.
 *
 * Usage:
 *   ./scripts/update-paws.sh paws.json [--week "PAWS 9/28-10/2"] [--dry-run] [--replace]
 *   npx tsx scripts/update-paws.ts --file paws.json [--week ...] [--dry-run] [--replace]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import admin from "firebase-admin";
import { normalizePawsFileInput } from "../src/lib/paws-input";
import { DEMO_PROJECT_ID } from "../src/lib/config";

function loadEnv(path: string): void {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch {
    /* no .env.local — rely on the environment */
  }
}

function usage(): string {
  return [
    "Usage: update-paws --file <paws.json> [--week \"PAWS 9/28-10/2\"] [--dry-run] [--replace]",
    "",
    "  <paws.json>  flat { \"YYYY-MM-DD\": { title, details?, week? } } or",
    "              { \"week\": \"...\", \"days\": { ... } } (see AGENTS.md).",
    "  --week      default week banner for entries that omit it.",
    "  --dry-run   validate + show what would be written, write nothing.",
    "  --replace   replace the whole overrides/paws doc (default: merge).",
    "  --project   override the Firestore project id.",
  ].join("\n");
}

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function serviceAccountJson(): string | undefined {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) return process.env.FIREBASE_SERVICE_ACCOUNT;
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (p && existsSync(p)) return readFileSync(p, "utf8");
  if (p) throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH points nowhere: ${p}`);
  return undefined;
}

async function main(): Promise<void> {
  loadEnv(join(process.cwd(), ".env.local"));
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }
  const file = argValue(args, "--file") ?? args.find((a) => !a.startsWith("--"));
  const defaultWeek = argValue(args, "--week");
  const dryRun = args.includes("--dry-run");
  const replace = args.includes("--replace");
  const projectFlag = argValue(args, "--project");

  if (!file) {
    console.error(usage());
    process.exit(2);
  }
  if (!existsSync(file)) {
    console.error(`PAWS file not found: ${file}`);
    process.exit(2);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`PAWS file is not valid JSON: ${(e as Error)?.message ?? e}`);
    process.exit(2);
  }

  let entries;
  try {
    entries = normalizePawsFileInput(parsed, defaultWeek);
  } catch (e) {
    console.error((e as Error)?.message ?? e);
    process.exit(2);
  }

  console.log(`PAWS entries to write (${entries.size}):`);
  for (const [id, paws] of entries) {
    console.log(`- ${id}: ${paws.title} [${paws.details.join(" | ") || "no details"}] (${paws.week ?? "no week"})`);
  }

  if (dryRun) {
    console.log("\n--dry-run: validated OK, wrote nothing.");
    process.exit(0);
  }

  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  const projectId =
    projectFlag ??
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GCLOUD_PROJECT ??
    (emulator ? DEMO_PROJECT_ID : undefined);
  if (!projectId) {
    console.error("Missing project: set FIREBASE_PROJECT_ID (or --project).");
    process.exit(2);
  }

  if (!emulator) {
    const svc = serviceAccountJson();
    if (!svc) {
      console.error(
        "Prod write needs a service account: set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH.",
      );
      process.exit(2);
    }
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(svc) as admin.ServiceAccount),
      projectId,
    });
  } else {
    admin.initializeApp({ projectId });
  }
  const db = admin.firestore();

  // 1. overrides/paws — merge by default so older weeks survive; --replace
  //    swaps the whole doc when the hand-supplied table was rebuilt.
  const payload: Record<string, unknown> = {};
  for (const [id, paws] of entries) payload[id] = { ...paws };
  if (replace) {
    await db.collection("overrides").doc("paws").set(payload);
    console.log("overrides/paws replaced.");
  } else {
    // set() with merge on a missing doc creates it; on an existing doc it
    // merges fields per date.
    await db.collection("overrides").doc("paws").set(payload, { merge: true });
    console.log("overrides/paws merged.");
  }

  // 2. days/<date> — immediate client visibility (Today + Month subscribe via
  //    onSnapshot; no redeploy needed). Merge so lunch/breakfast/ABC survive.
  const stamp = admin.firestore.FieldValue.serverTimestamp();
  let patched = 0;
  const missing: string[] = [];
  for (const [id, paws] of entries) {
    const ref = db.collection("days").doc(id);
    const snap = await ref.get();
    if (!snap.exists) missing.push(id);
    await ref.set({ paws: { ...paws }, updatedAt: stamp }, { merge: true });
    patched++;
  }
  console.log(`days/* patched: ${patched}.`);
  if (missing.length > 0) {
    console.log(
      `Note: ${missing.join(", ")} had no days/* doc yet (created with paws only; ` +
        "the next cron sync fills in ABC/menus). overrides/paws still carries them.",
    );
  }
  console.log(
    `Done (${emulator ? "emulator" : "prod"} ${projectId}). ` +
      "Signed-in clients pull the new PAWS from days/* automatically.",
  );
}

main().then(() => process.exit(0), (e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
