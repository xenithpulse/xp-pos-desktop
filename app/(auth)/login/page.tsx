// app/(auth)/login/page.tsx
//
// A server wrapper around the sign-in form, for two reasons:
//
//  1. A freshly installed POS has an empty database. This is where bootstrap is
//     triggered, so the first person to open the address gets a working account
//     rather than a login box they cannot possibly get past. See lib/firstRun.ts.
//  2. While that account is still on its default password, the credentials are
//     shown on the screen. Hiding them would just mean a phone call.
//
// The check is cheap after the first run: hasAnyAdmin() caches the positive
// answer in memory.

import { ensureBootstrapped, getFirstRunStatus } from "@/lib/firstRun";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  let hint: { username: string; password: string } | null = null;
  let seeding = false;

  try {
    await ensureBootstrapped();
    const status = await getFirstRunStatus();
    if (status.usingDefaultCredentials) {
      hint = { username: status.defaultUsername, password: status.defaultPassword };
    }
    seeding = status.demoDataSeeding;
  } catch (err) {
    // Mongo is unreachable. Render the form anyway: a sign-in attempt fails
    // with a message the operator can act on, which is more useful than an
    // error page that says nothing about what to check.
    console.error("[login] first-run check failed:", err);
  }

  const { created } = await searchParams;

  return <LoginForm justCreated={created === "1"} defaultCredentials={hint} sampleDataLoading={seeding} />;
}
