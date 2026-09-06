"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

/** Emulator hosts are dev-only env; empty in production. */
export function usingEmulators(): boolean {
  return (
    (process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "") !== "" ||
    (process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST ?? "") !== ""
  );
}

/**
 * Set NEXT_PUBLIC_FIREBASE_EMULATOR_SSL=true when the emulator backends are
 * reached through TLS-terminating proxies (required when the app itself is
 * served over HTTPS — browsers block plain-HTTP backends as mixed content).
 *
 * Note: connectFirestoreEmulator() only negotiates TLS for Cloud Workstation
 * hosts, so the SSL case uses initializeFirestore({ host, ssl: true }) — the
 * SDK's supported custom-TLS-backend path — which the emulator serves fine.
 */
function emulatorSsl(): boolean {
  return process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_SSL === "true";
}

function getApp(): FirebaseApp {
  if (app) return app;
  app =
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "dummy-key-for-emulator",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "demo-school-dash.firebaseapp.com",
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-school-dash",
    });
  return app;
}

export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(getApp());
  const host = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
  if (host) {
    const url = emulatorSsl() ? `https://${host}` : `http://${host}`;
    connectAuthEmulator(auth, url, { disableWarnings: true });
  }
  return auth;
}

export function getDb(): Firestore {
  if (db) return db;
  const host = process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST;
  if (host && emulatorSsl()) {
    db = initializeFirestore(getApp(), { host, ssl: true });
    return db;
  }
  db = getFirestore(getApp());
  if (host) {
    const [hostname, port] = host.split(":");
    connectFirestoreEmulator(db, hostname, Number(port));
  }
  return db;
}
