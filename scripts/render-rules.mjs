/**
 * Generates `firestore.rules` from `firestore.rules.template`.
 *
 * The school email domain cannot live in the tracked template (public repo),
 * so the template carries a `__SCHOOL_DOMAIN__` token. This script fills it
 * from `SCHOOL_DOMAIN` (or `NEXT_PUBLIC_SCHOOL_DOMAIN`, or `.env.local`),
 * defaulting to the `example-school.org` placeholder. The generated file is
 * gitignored — never commit a rendered file containing a real domain.
 *
 * Usage: `node scripts/render-rules.mjs` (also `npm run setup`).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const fileEnv = {};
const envFile = join(root, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && fileEnv[m[1]] === undefined) fileEnv[m[1]] = m[2];
  }
}
const get = (k) => process.env[k] ?? fileEnv[k];
const domain =
  get("SCHOOL_DOMAIN") ??
  get("NEXT_PUBLIC_SCHOOL_DOMAIN") ??
  "example-school.org";

// Rules-string escaping: a literal dot is `\\.` in the .rules source.
const escaped = domain.split(".").join("\\\\.");
const out = readFileSync(join(root, "firestore.rules.template"), "utf8")
  .split("__SCHOOL_DOMAIN__")
  .join(escaped);
writeFileSync(join(root, "firestore.rules"), out);
console.log(`rendered firestore.rules for domain ${domain}`);
