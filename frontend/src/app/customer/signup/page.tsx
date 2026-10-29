import { redirect } from "next/navigation";

/** Consolidated: the single sign-up lives at /signup. */
export default function CustomerSignupRedirect() {
  redirect("/signup");
}
