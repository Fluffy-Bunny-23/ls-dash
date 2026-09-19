#!/bin/sh
# Push a transcribed PAWS week to Firestore (overrides/paws + days/*).
# The heavy lifting lives in scripts/update-paws.ts (Admin SDK, shares
# validation with the cron via src/lib/paws-input.ts); this wrapper keeps the
# local entry point a plain `sh` invocation for operators and agents.
#
# Usage:
#   ./scripts/update-paws.sh paws.json [--week "PAWS 9/28-10/2"] [--dry-run] [--replace]
#
# Emulator (safe default): export FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 first.
# Prod: unset the emulator var; provide FIREBASE_PROJECT_ID plus
#   FIREBASE_SERVICE_ACCOUNT_PATH (preferred) or FIREBASE_SERVICE_ACCOUNT.
# .env.local is honored (see scripts/update-paws.ts). Secrets are never echoed.
set -eu

ROOT="$(dirname "$0")/.."
cd "$ROOT"

if [ "${1:-}" = "" ] || [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  echo 'Usage: ./scripts/update-paws.sh paws.json [--week "PAWS 9/28-10/2"] [--dry-run] [--replace]' >&2
  echo '' >&2
  echo '  Transcribe the screenshot to JSON first (see AGENTS.md "PAWS schedule update").' >&2
  echo '  Validate without writing: add --dry-run.' >&2
  exit 2
fi

if [ ! -d node_modules ]; then
  echo "node_modules missing — run 'npm install' first." >&2
  exit 2
fi

exec npx tsx scripts/update-paws.ts "$@"
