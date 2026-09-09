"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from "firebase/firestore";
import { DEMO_PROJECT_ID } from "./config";

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
  const envAuthDomain =
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${DEMO_PROJECT_ID}.firebaseapp.com`;
  app =
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "dummy-key-for-emulator",
      // Firebase redirect best-practices (Option 3): when
      // NEXT_PUBLIC_FIREBASE_SELF_HOST_AUTH_HELPER=true, the /__/auth/*
      // helper is served same-origin through the Next rewrite in
      // next.config.ts, so partitioned third-party storage no longer breaks
      // signInWithRedirect in browsers like Helium. Requires the matching
      // Firebase console + OAuth client entries (see README).
      authDomain: selfHostedAuthDomain(envAuthDomain),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? DEMO_PROJECT_ID,
    });
  return app;
}

/**
 * Opt-in same-origin auth helper domain. Off by default (popup flow needs no
 * console changes). When enabled on a real https host, returns the app's own
 * host so the Firebase helper runs first-party via the /__/auth/* rewrite.
 */
function selfHostedAuthDomain(envAuthDomain: string): string {
  if (process.env.NEXT_PUBLIC_FIREBASE_SELF_HOST_AUTH_HELPER !== "true") return envAuthDomain;
  if (usingEmulators()) return envAuthDomain;
  if (typeof window === "undefined") return envAuthDomain;
  const host = window.location.host;
  if (!host || host.startsWith("localhost") || host.startsWith("127.")) return envAuthDomain;
  if (window.location.protocol !== "https:") return envAuthDomain;
  return host;
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
