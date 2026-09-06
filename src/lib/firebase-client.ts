"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  getFirestore,
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
  if (host) connectAuthEmulator(auth, `http://${host}`, { disableWarnings: true });
  return auth;
}

export function getDb(): Firestore {
  if (db) return db;
  db = getFirestore(getApp());
  const host = process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_HOST;
  if (host) {
    const [hostname, port] = host.split(":");
    connectFirestoreEmulator(db, hostname, Number(port));
  }
  return db;
}
