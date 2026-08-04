// app/(auth)/login/page.tsx
//
// A server wrapper around the sign-in form, for one reason: a freshly installed
// POS has no accounts, and showing a sign-in box to someone who cannot possibly
// have credentials is a dead end. This sends them to /setup instead.
//
// The check is cheap. hasAnyAdmin() caches the answer in memory once an account
// exists, so after the first run this costs one boolean comparison per render.

import { redirect } from "next/navigation";
import { hasAnyAdmin } from "@/lib/firstRun";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  // redirect() works by THROWING a NEXT_REDIRECT error, so it must be called
  // outside the try - a catch around it would swallow the redirect and render
  // the sign-in form instead, silently undoing this whole page.
  let configured: boolean;
  try {
    configured = await hasAnyAdmin();
  } catch {
    // Database unreachable, so whether accounts exist is unknown. Show the
    // sign-in form: it fails with a message the operator can act on, which
    // beats sending them to a setup page that cannot work either.
    configured = true;
  }

  if (!configured) redirect("/setup");

  const { created } = await searchParams;

  return <LoginForm justCreated={created === "1"} />;
}
