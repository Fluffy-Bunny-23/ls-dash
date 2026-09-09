"use client";

import { useState } from "react";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";

/**
 * Generic login wall. Reveals NOTHING school-specific: no school name,
 * no ABC/day/schedule/menu wording, neutral colors only (no maroon/gold).
 */
export function LoginWall() {
  const {
    signInGoogle,
    signInGoogleRedirect,
    devSignIn,
    emulatorMode,
    handlingRedirect,
    redirectError,
  } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"popup" | "redirect" | null>(null);

  const doGoogle = async () => {
    setError(null);
    setBusy("popup");
    try {
      await signInGoogle();
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      setError(`Sign-in failed: ${err?.code ?? "unknown"} ${err?.message ?? String(e)}`);
      console.error("signInGoogle failed", e);
    } finally {
      setBusy(null);
    }
  };

  const doRedirect = async () => {
    setError(null);
    setBusy("redirect");
    try {
      await signInGoogleRedirect();
      // Navigates away; if we are still here the redirect never started.
      setBusy(null);
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      setError(`Sign-in failed: ${err?.code ?? "unknown"} ${err?.message ?? String(e)}`);
      console.error("signInGoogleRedirect failed", e);
      setBusy(null);
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

  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-100 p-4">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-stone-900">Please sign in to continue</h1>
        <p className="mt-1 text-sm text-stone-500">Sign in with your account to proceed.</p>
        {handlingRedirect ? (
          <p className="mt-4 text-sm text-stone-500">Completing sign-in…</p>
        ) : (
          <>
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={doGoogle}
              disabled={busy !== null}
            >
              {busy === "popup" ? "Opening sign-in…" : "Continue with Google"}
            </Button>
            <Button
              variant="ghost"
              className="mt-2 w-full"
              onClick={doRedirect}
              disabled={busy !== null}
              title="Use this if your browser blocks popups"
            >
              {busy === "redirect" ? "Redirecting…" : "Use redirect instead"}
            </Button>
            <p className="mt-3 text-xs text-stone-500">
              Privacy-hardened browser? Allow popups for this site for the first option. Redirect
              needs third-party cookies and site data allowed for the identity provider.
            </p>
          </>
        )}
        {redirectError && <p className="mt-3 text-sm text-red-700">{redirectError}</p>}
        {emulatorMode && (
          <Button variant="outline" className="mt-2 w-full" onClick={doDev}>
            Dev sign-in
          </Button>
        )}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </div>
    </main>
  );
}
