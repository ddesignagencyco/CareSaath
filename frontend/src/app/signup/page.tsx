import { SignupForm } from "./signup-form";

/**
 * Single sign-up. The role toggle routes families to the customer app and
 * caregivers into onboarding. The initial tab comes from `?role=` resolved on
 * the server (so "Join as a caregiver" → ?role=caregiver opens on the right tab
 * from the first paint, with no static-prerender/hydration guesswork); the
 * toggle switches it and keeps `?role=` in the URL in sync.
 */
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  return <SignupForm initialRole={role === "caregiver" ? "caregiver" : "customer"} />;
}
