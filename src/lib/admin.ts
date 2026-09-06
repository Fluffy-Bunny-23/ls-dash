/** Server-only Firebase Admin helper for the cron writer. */
import admin from "firebase-admin";

let inited = false;

export function getAdminDb(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-school-dash";
    const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (svc) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(svc) as admin.ServiceAccount),
        projectId,
      });
    } else {
      // Emulator (FIRESTORE_EMULATOR_HOST) or ADC. No credential needed
      // against the emulator.
      admin.initializeApp({ projectId });
    }
    inited = true;
  }
  void inited;
  return admin.firestore();
}

export function getAdminAuth(): admin.auth.Auth {
  if (!admin.apps.length) getAdminDb();
  return admin.auth();
}
