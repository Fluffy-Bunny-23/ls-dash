"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, usingEmulators } from "@/lib/firebase-client";
import { schoolDomain, testEmail } from "@/lib/config";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** True while the post-redirect result is being resolved after a redirect return. */
  handlingRedirect: boolean;
  /** Surfaced (not swallowed) getRedirectResult failure, if any. */
  redirectError: string | null;
  schoolUser: boolean;
  /** Popup flow — primary path, works in partitioned-storage browsers. */
  signInGoogle: () => Promise<void>;
  /** Explicit redirect flow — for browsers that block popups (never auto-fallback). */
  signInGoogleRedirect: () => Promise<void>;
  devSignIn: () => Promise<void>;
  signOutAll: () => Promise<void>;
  emulatorMode: boolean;
}

const AuthCtx = createContext<AuthState | null>(null);

/** sessionStorage marker so a storage-partitioned redirect return (null, no error) is loud, not a loop. */
const REDIRECT_PENDING_KEY = "lsdash-redirect-pending-since";

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [handlingRedirect, setHandlingRedirect] = useState(true);
  const [redirectError, setRedirectError] = useState<string | null>(null);
  const emulatorMode = usingEmulators();

  useEffect(() => {
    // Resolve the redirect flow exactly once. Errors used to be swallowed
    // here (`.catch(() => {})`), which turned every redirect failure in
    // partitioned-storage browsers (Helium, etc.) into a silent login loop.
    // Note getRedirectResult() can also resolve with null WITHOUT an error
    // when the browser partitions third-party storage: the helper can't read
    // its state after the round-trip. Detect that via a sessionStorage marker
    // set before signInWithRedirect() so it shows as an error, not a loop.
    getRedirectResult(getFirebaseAuth())
      .then((result) => {
        if (result) {
          sessionStorage.removeItem(REDIRECT_PENDING_KEY);
          return;
        }
        let pendingSince: string | null = null;
        try {
          pendingSince = sessionStorage.getItem(REDIRECT_PENDING_KEY);
        } catch {
          pendingSince = null;
        }
        if (pendingSince) {
          sessionStorage.removeItem(REDIRECT_PENDING_KEY);
          // Stale markers (older than 15 min, e.g. abandoned attempt in the
          // same tab session) are ignored to avoid a bogus error on next visit.
          if (Date.now() - Number(pendingSince) < 15 * 60 * 1000) {
            setRedirectError(
              "Redirect sign-in returned without a session (no error reported). " +
                "The browser blocked the sign-in helper's third-party storage. " +
                "Use the popup flow with popups allowed, or allow third-party " +
                "cookies and site data for the identity provider and retry.",
            );
          }
        }
      })
      .catch((e: unknown) => {
        const err = e as { code?: string; message?: string };
        try {
          sessionStorage.removeItem(REDIRECT_PENDING_KEY);
        } catch {
          /* storage unavailable — nothing to clear */
        }
        setRedirectError(
          `Redirect sign-in failed: ${err?.code ?? "unknown"} ${err?.message ?? String(e)}`,
        );
        console.error("getRedirectResult failed", e);
      })
      .finally(() => setHandlingRedirect(false));
    const unsub = onAuthStateChanged(getFirebaseAuth(), (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const buildProvider = () => {
    const provider = new GoogleAuthProvider();
    // Hint the hosted domain; rules enforce it regardless.
    provider.setCustomParameters({ hd: schoolDomain() });
    return provider;
  };

  const signInGoogle = async () => {
    // Popup is the primary path: unlike redirect it keeps working when the
    // browser partitions third-party storage (Chrome 115+, Safari, Firefox,
    // Helium). Never silently fall back to redirect — a blocked popup
    // followed by a broken redirect was the silent-loop bug.
    try {
      await signInWithPopup(getFirebaseAuth(), buildProvider());
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      const code = err?.code ?? "";
      if (
        code === "auth/popup-blocked" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/popup-window-blocked"
      ) {
        throw new Error(
          `${code}: the sign-in popup was blocked or closed. Allow popups for this site and retry, or use "Use redirect instead".`,
        );
      }
      throw e;
    }
  };

  const signInGoogleRedirect = async () => {
    // Explicit redirect path (LibreWolf, or Helium with third-party
    // cookies/site data allowed for the identity provider). Navigates away;
    // the getRedirectResult() call above completes it on return.
    try {
      sessionStorage.setItem(REDIRECT_PENDING_KEY, String(Date.now()));
    } catch {
      /* storage unavailable — return trip just won't be diagnosed */
    }
    await signInWithRedirect(getFirebaseAuth(), buildProvider());
  };

  const devSignIn = async () => {
    // Emulator-only shortcut: server provisions a verified test user.
    const res = await fetch("/api/dev/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail("tester") }),
    });
    if (!res.ok) throw new Error("dev sign-in unavailable");
    const { email, password } = (await res.json()) as { email: string; password: string };
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  };

  const signOutAll = async () => {
    await signOut(getFirebaseAuth());
  };

  const schoolUser = !!user?.email?.endsWith(`@${schoolDomain()}`);

  return (
    <AuthCtx.Provider
      value={{
        user,
        loading,
        handlingRedirect,
        redirectError,
        schoolUser,
        signInGoogle,
        signInGoogleRedirect,
        devSignIn,
        signOutAll,
        emulatorMode,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}
