/**
 * Deployment identity. Everything identifying the school (email domain,
 * support contact) comes from the environment — the repo ships only generic
 * placeholders, so it can be public. A deployment sets the real values in
 * `.env.local` (dev) or the hosting provider's env (prod). Any consistent
 * set of values works; tests use the placeholders by default.
 */
export const PLACEHOLDER_DOMAIN = "example-school.org";
export const PLACEHOLDER_SUPPORT_EMAIL = "support@example-school.org";
export const DEMO_PROJECT_ID = "demo-school-dash";

/** School email domain for the client bundle (auth check + Google hd hint). */
export function schoolDomain(): string {
  return process.env.NEXT_PUBLIC_SCHOOL_DOMAIN ?? PLACEHOLDER_DOMAIN;
}

/** School email domain for server code (dev-token route, render-rules). */
export function serverSchoolDomain(): string {
  return (
    process.env.SCHOOL_DOMAIN ??
    process.env.NEXT_PUBLIC_SCHOOL_DOMAIN ??
    PLACEHOLDER_DOMAIN
  );
}

/** Support contact shown in the stale badge. */
export function supportEmail(): string {
  return process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? PLACEHOLDER_SUPPORT_EMAIL;
}

/** Test/dev mailbox for a local part, e.g. testEmail("tester"). */
export function testEmail(localPart: string): string {
  return `${localPart}@${serverSchoolDomain()}`;
}
