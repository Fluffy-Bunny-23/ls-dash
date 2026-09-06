"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, usingEmulators } from "@/lib/firebase-client";

interface AuthState {
  user: User | null;
  loading: boolean;
  schoolUser: boolean;
  signInGoogle: () => Promise<void>;
  devSignIn: () => Promise<void>;
  signOutAll: () => Promise<void>;
  emulatorMode: boolean;
}

const AuthCtx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const emulatorMode = usingEmulators();

  useEffect(() => {
    const unsub = onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signInGoogle = async () => {
    const provider = new GoogleAuthProvider();
    // Hint the hosted domain; rules enforce example-school.org regardless.
    provider.setCustomParameters({ hd: "example-school.org" });
    await signInWithPopup(getFirebaseAuth(), provider);
  };

  const devSignIn = async () => {
    // Emulator-only shortcut: server provisions a verified test user.
    const res = await fetch("/api/dev/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "tester@example-school.org" }),
    });
    if (!res.ok) throw new Error("dev sign-in unavailable");
    const { email, password } = (await res.json()) as { email: string; password: string };
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  };

  const signOutAll = async () => {
    await signOut(getFirebaseAuth());
  };

  const schoolUser = !!user?.email?.endsWith("@example-school.org");

  return (
    <AuthCtx.Provider
      value={{ user, loading, schoolUser, signInGoogle, devSignIn, signOutAll, emulatorMode }}
    >
      {children}
    </AuthCtx.Provider>
  );
}
