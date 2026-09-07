"use client";

import { useState } from "react";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";

/**
 * Generic login wall. Reveals NOTHING school-specific: no school name,
 * no ABC/day/schedule/menu wording, neutral colors only (no maroon/gold).
 */
export function LoginWall() {
  const { signInGoogle, devSignIn, emulatorMode } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const doGoogle = async () => {
    setError(null);
    try {
      await signInGoogle();
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      setError(`Sign-in failed: ${err?.code ?? "unknown"} ${err?.message ?? String(e)}`);
      console.error("signInGoogle failed", e);
    }
  };

  const doDev = async () => {
    setError(null);
    try {
      await devSignIn();
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      setError(`Sign-in failed: ${err?.code ?? "unknown"} ${err?.message ?? String(e)}`);
      console.error("devSignIn failed", e);
    }
  };

  const doGoogleRedirect = async () => {
    setError(null);
    try {
      const { GoogleAuthProvider, signInWithRedirect } = await import("firebase/auth");
      const { getFirebaseAuth } = await import("@/lib/firebase-client");
      const { schoolDomain } = await import("@/lib/config");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ hd: schoolDomain() });
      await signInWithRedirect(getFirebaseAuth(), provider);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      setError(`Redirect failed: ${err?.code ?? "unknown"} ${err?.message ?? String(e)}`);
    }
  };

  const doDebugEmail = async () => {
    setError(null);
    try {
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      const { getFirebaseAuth } = await import("@/lib/firebase-client");
      await signInWithEmailAndPassword(getFirebaseAuth(), "debug-test@lakesideschool.org", "TempPass123!");
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      setError(`Email login failed: ${err?.code ?? "unknown"} ${err?.message ?? String(e)}`);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-100 p-4">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-stone-900">Please sign in to continue</h1>
        <p className="mt-1 text-sm text-stone-500">Sign in with your account to proceed.</p>
        <Button variant="outline" className="mt-4 w-full" onClick={doGoogle}>
          Continue with Google
        </Button>
        <Button variant="ghost" className="mt-2 w-full text-xs" onClick={doGoogleRedirect}>
          Try Google (redirect)
        </Button>
        <Button variant="ghost" className="mt-1 w-full text-xs text-stone-500" onClick={doDebugEmail}>
          Debug email login (test)
        </Button>
        {emulatorMode && (
          <Button variant="outline" className="mt-2 w-full" onClick={doDev}>
            Dev sign-in
          </Button>
        )}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <p className="mt-3 text-xs text-stone-400">If sign-in loops back here, check popup blocker or try Incognito. After Google redirect, URL should contain firebase auth code - if you see &quot;No access&quot; next, note the email shown there.</p>
      </div>
    </main>
  );
}
