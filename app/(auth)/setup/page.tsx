// app/(auth)/setup/page.tsx
//
// The first screen on a brand-new installation.
//
// This page is the whole reason a stranger can install XP POS and end up with a
// working POS: before it existed, a fresh box had an empty database, no account
// to sign in with, and no way to make one short of enabling a setup endpoint in
// a .env file and calling it by hand.
//
// It closes itself. Once an owner account exists the route redirects to the
// login page, so it cannot be used to add a second privileged account later.

import { redirect } from "next/navigation";
import { hasAnyAdmin } from "@/lib/firstRun";
import { BRAND } from "@/config/brand";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  let setUpAlready: boolean;
  try {
    setUpAlready = await hasAnyAdmin();
  } catch {
    // The database is unreachable, so whether an owner exists is unknown.
    // Send them to the login page: it fails with a message they can act on,
    // whereas offering account creation here could hand a second owner account
    // to whoever loads the page during a Mongo hiccup.
    redirect("/login");
  }

  if (setUpAlready) redirect("/login");

  const year = new Date().getFullYear();

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black px-4 py-10 font-sans text-white antialiased">
      <div className="relative z-10 flex w-full flex-col items-center gap-8">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-300/70">
            {BRAND.companyName}
          </p>
          <h1 className="heading-luna text-3xl tracking-wide text-white sm:text-4xl">
            Welcome to {BRAND.productName}
          </h1>
          <p className="text-sm leading-relaxed text-white/45">
            Nobody has set this up yet. Create the owner account and you are in
            &mdash; there is nothing else to configure.
          </p>
        </div>

        <SetupForm />

        <p className="text-[11px] tracking-wide text-white/20">
          &copy; {year} {BRAND.companyName}
        </p>
      </div>
    </div>
  );
}
