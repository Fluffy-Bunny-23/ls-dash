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
    } catch {
      setError("Sign-in failed. Please try again.");
    }
  };

  const doDev = async () => {
    setError(null);
    try {
      await devSignIn();
    } catch {
      setError("Sign-in failed. Please try again.");
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
