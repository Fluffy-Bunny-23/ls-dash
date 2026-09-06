import { describe, expect, it } from "vitest";
import { initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc } from "firebase/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/admin";

const EMU = !!process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_EMU = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9090";
const FS_EMU = process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8081";

function clientApp(name: string): FirebaseApp {
  return initializeApp(
    {
      apiKey: "dummy-key-for-emulator",
      authDomain: "demo-ls-dash.firebaseapp.com",
      projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-ls-dash",
    },
    name,
  );
}

const PASSWORD = "emulator-test-password";

/** Create (or refresh) an emulator user in the SAME project namespace as the
 *  client SDK, so email/email_verified claims flow into security rules. */
async function ensureUser(email: string, verified: boolean): Promise<void> {
  const auth = getAdminAuth();
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { emailVerified: verified, password: PASSWORD });
  } catch {
    await auth.createUser({ email, password: PASSWORD, emailVerified: verified });
  }
}

async function signedInApp(name: string, email: string, verified: boolean) {
  await ensureUser(email, verified);
  const app = clientApp(name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_EMU}`, { disableWarnings: true });
  const [h, p] = FS_EMU.split(":");
  const db = getFirestore(app);
  connectFirestoreEmulator(db, h, Number(p));
  await signInWithEmailAndPassword(auth, email, PASSWORD);
  return db;
}

describe.skipIf(!EMU)("firestore rules", () => {
  it("school-verified reads allowed; everything else denied; no client writes", async () => {
    const adminDb = getAdminDb();
    await adminDb.collection("days").doc("2026-09-08").set({
      date: "2026-09-08",
      dow: "Mon",
      abc: "A",
      isSpecial: false,
      specialLabel: null,
      isNoSchool: false,
      noSchoolLabel: null,
      lunch: { entree: "X", special: null, feature: null, soups: [], sides: [], all: ["X"] },
      breakfast: { entree: null, all: [] },
      sources: { icalUid: "u", sageWeek: null },
    });

    // 1. Unauthenticated read denied.
    {
      const app = clientApp("anon");
      const [h, p] = FS_EMU.split(":");
      const db = getFirestore(app);
      connectFirestoreEmulator(db, h, Number(p));
      await expect(getDoc(doc(db, "days", "2026-09-08"))).rejects.toThrow(/permission|no matching allow|false for .get.|permission_denied/i);
    }

    // 2. Verified school email reads allowed.
    const schoolDb = await signedInApp("school", "tester@lakesideschool.org", true);
    const snap = await getDoc(doc(schoolDb, "days", "2026-09-08"));
    expect(snap.exists()).toBe(true);

    // 3. Non-school email denied.
    const otherDb = await signedInApp("other", "someone@gmail.com", true);
    await expect(getDoc(doc(otherDb, "days", "2026-09-08"))).rejects.toThrow(/permission|no matching allow|false for .get.|permission_denied/i);

    // 4. Unverified school email denied.
    const unverifiedDb = await signedInApp("unverified", "tester@lakesideschool.org", false);
    await expect(getDoc(doc(unverifiedDb, "days", "2026-09-08"))).rejects.toThrow(/permission|no matching allow|false for .get.|permission_denied/i);

    // 5. Client writes denied even for verified school users.
    await expect(
      setDoc(doc(schoolDb, "days", "2026-09-08"), { hacked: true }, { merge: true }),
    ).rejects.toThrow(/permission|no matching allow|false for .get.|permission_denied/i);
    await expect(
      setDoc(doc(schoolDb, "days", "2099-01-01"), { hacked: true }),
    ).rejects.toThrow(/permission|no matching allow|false for .get.|permission_denied/i);
  });
});
