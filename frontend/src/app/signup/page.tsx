import { SignupForm } from "./signup-form";

/**
 * Single sign-up. The role toggle routes families to the customer app and
 * caregivers into onboarding. The initial tab comes from `?role=` resolved on
 * the server (so "Join as a caregiver" → ?role=caregiver opens on the right tab
 * from the first paint, with no static-prerender/hydration guesswork); the
 * toggle switches it and keeps `?role=` in the URL in sync.
 *
 * Reading `searchParams` opts the route out of the instant prerendered shell;
 * render it as a blocking route so the correct tab is server-rendered from the
 * first paint (no `<Suspense>` fallback flash), instead of warning about URL
 * data accessed outside `<Suspense>`.
 */
export const instant = false;

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  return <SignupForm initialRole={role === "caregiver" ? "caregiver" : "customer"} />;
}
