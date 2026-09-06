/** Usage: node scripts/set-meta.mjs <stale|fresh> — Admin SDK vs the emulator. */
import admin from "firebase-admin";

admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-ls-dash" });
const db = admin.firestore();
const mode = process.argv[2] ?? "fresh";
if (mode === "stale") {
  await db
    .collection("meta")
    .doc("sync")
    .set(
      {
        lastSuccess: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
        lastAttempt: new Date().toISOString(),
        datesWritten: 5,
        errors: ["sage 500 (simulated)"],
      },
      { merge: true },
    );
  console.log("meta/sync set STALE");
} else {
  await db
    .collection("meta")
    .doc("sync")
    .set(
      {
        lastSuccess: new Date().toISOString(),
        lastAttempt: new Date().toISOString(),
        datesWritten: 5,
        errors: [],
      },
      { merge: true },
    );
  console.log("meta/sync set FRESH");
}
process.exit(0);
