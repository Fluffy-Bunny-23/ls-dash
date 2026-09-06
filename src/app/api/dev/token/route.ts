import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * DEV ONLY: provisions the emulator test user and returns its credentials.
 * Returns 404 unless the Auth emulator is wired up. Never present in prod.
 * (Custom tokens minted by the emulator drop email claims, so the dev flow
 * uses email+password, which carries email/email_verified into rules.)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = body.email ?? "tester@example-school.org";
  if (!email.endsWith("@example-school.org")) {
    return NextResponse.json({ error: "school email only" }, { status: 400 });
  }
  const password = `dev-${process.env.CRON_SECRET ?? "local"}-pw`;
  const auth = getAdminAuth();
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, { emailVerified: true, password });
  } catch {
    await auth.createUser({ email, password, emailVerified: true });
  }
  return NextResponse.json({ email, password });
}
