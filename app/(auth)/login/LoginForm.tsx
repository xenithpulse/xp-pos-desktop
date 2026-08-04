// app/(auth)/login/LoginForm.tsx
//
// The sign-in form. Split out of page.tsx so that page.tsx can be a server
// component and send a never-configured installation to /setup instead.
'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Loader2,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowBigUp,
  CheckCircle2,
  KeyRound,
} from "lucide-react";

const ERROR_MESSAGES: Record<string, string> = {
  MISSING_CREDENTIALS: "Please enter your username and password.",
  USERNAME_REQUIRED: "Username is required.",
  PASSWORD_REQUIRED: "Password is required.",
  USER_NOT_FOUND: "No account found with this username.",
  ACCOUNT_DISABLED: "Your account has been deactivated by an administrator. Please contact support.",
  INVALID_PASSWORD: "Incorrect password. Please try again.",
  CredentialsSignin: "Invalid credentials. Please try again.",
  Default: "An unexpected error occurred. Please try again.",
};

const getErrorMessage = (error: string): string =>
  ERROR_MESSAGES[error] || ERROR_MESSAGES.Default;

// Attributes applied to both fields to suppress browser suggestions,
// autofill and saved-password injection.
const NO_AUTOFILL = {
  autoCorrect: "off",
  autoCapitalize: "none",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-form-type": "other",
} as const;

export default function LoginForm({
  justCreated = false,
  defaultCredentials = null,
  sampleDataLoading = false,
}: {
  justCreated?: boolean;
  /** Non-null while the admin account is still on the password it was created with. */
  defaultCredentials?: { username: string; password: string } | null;
  sampleDataLoading?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  // bumped on every failed attempt so the error re-mounts and the shake replays
  const [errorKey, setErrorKey] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);

  const year = new Date().getFullYear();

  // Reflect the Caps Lock state from any key event on the password field.
  const syncCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);
  };

  const doSignIn = async (username: string, password: string) => {
    setLoading(true);
    setErrorMessage("");

    const result = await signIn("credentials", { username, password, redirect: false });

    if (result?.error) {
      setLoading(false);
      setErrorMessage(getErrorMessage(result.error));
      setErrorKey((k) => k + 1);
    } else {
      router.push("/");
    }
  };

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    await doSignIn(form.username.value, form.password.value);
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-black px-4 font-sans text-white antialiased">
      {/* ───────── Foreground: dim wordmark stacked above the input fields ───────── */}
      <div className="relative z-10 flex w-full flex-col items-center gap-9 sm:gap-10">
        {/* hero wordmark + subtitle */}
        <div className="flex w-full flex-col items-center gap-3">
          {/* hero wordmark — dim outline with an emerald line travelling along its borders */}
          <div aria-hidden className="xp-wm w-[min(90vw,760px)] select-none">
            <svg viewBox="0 0 1000 240" className="h-auto w-full overflow-visible">
              {/* dim static outline — the always-visible "text borders" */}
              <text x="500" y="120" textAnchor="middle" dominantBaseline="central" fontSize="150" className="heading-luna xp-wm-base">
                XenithPulse
              </text>
              {/* fainter line tracing the opposite way */}
              <text x="500" y="120" textAnchor="middle" dominantBaseline="central" fontSize="150" className="heading-luna xp-trace xp-trace--echo">
                XenithPulse
              </text>
              {/* the emerald line travelling over the outline */}
              <text x="500" y="120" textAnchor="middle" dominantBaseline="central" fontSize="150" className="heading-luna xp-trace">
                XenithPulse
              </text>
            </svg>
          </div>
        </div>

        {/* First run. Nobody has been given credentials, so the POS hands them
            over rather than leaving someone stuck at a login box on a machine
            they just plugged in. The card disappears for good the moment the
            password is changed - which the POS requires before the sample data
            can be removed. */}
        {defaultCredentials && (
          <div className="xp-rise w-full max-w-xs rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-4">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-300/90">
              <KeyRound size={13} className="shrink-0" />
              First time here
            </p>
            <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
              <span className="text-white/40">Username</span>
              <span className="font-mono text-white">{defaultCredentials.username}</span>
              <span className="text-white/40">Password</span>
              <span className="font-mono text-white">{defaultCredentials.password}</span>
            </div>
            <button
              type="button"
              onClick={() => void doSignIn(defaultCredentials.username, defaultCredentials.password)}
              disabled={loading}
              className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/90 px-3 py-2 text-xs font-semibold text-black
                         outline-none transition duration-200 ease-out
                         hover:bg-emerald-400 active:scale-[0.99]
                         focus-visible:ring-2 focus-visible:ring-emerald-400/60
                         disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
              Sign in as {defaultCredentials.username}
            </button>
            <p className="mt-2.5 text-[10px] leading-relaxed text-white/35">
              {sampleDataLoading
                ? "Sample menu and tables are still loading - give it a moment."
                : "Loaded with a sample menu and floor plan so you can try everything. You will be asked to set a real password before going live."}
            </p>
          </div>
        )}

        {/* Kept for the password-change flow, which returns here. */}
        {justCreated && (
          <p
            role="status"
            className="xp-rise flex max-w-xs items-start gap-2 text-xs text-emerald-300/85"
          >
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <span>Your owner account is ready. Sign in with it to continue.</span>
          </p>
        )}

        <form
          onSubmit={handleSignIn}
          autoComplete="off"
          noValidate
          style={{ animationDelay: "0.08s" }}
          className="xp-rise relative z-10 flex w-full max-w-xs flex-col gap-3.5"
        >
        {/* anti-autofill decoys: browsers fill these hidden fields instead */}
        <input type="text" name="_fake_user" autoComplete="username" tabIndex={-1} aria-hidden className="hidden" />
        <input type="password" name="_fake_pass" autoComplete="current-password" tabIndex={-1} aria-hidden className="hidden" />

        <input
          id="username"
          name="username"
          type="text"
          placeholder="Username"
          autoComplete="off"
          required
          disabled={loading}
          {...NO_AUTOFILL}
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none
                     transition duration-300 ease-out
                     placeholder:text-white/30
                     hover:border-white/20
                     focus:border-emerald-400/70 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.18)]
                     disabled:cursor-not-allowed disabled:opacity-60"
        />

        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            autoComplete="new-password"
            required
            disabled={loading}
            onKeyUp={syncCapsLock}
            onKeyDown={syncCapsLock}
            onBlur={() => setCapsOn(false)}
            {...NO_AUTOFILL}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 pr-[5.25rem] text-sm text-white outline-none
                       transition duration-300 ease-out
                       placeholder:text-white/30
                       hover:border-white/20
                       focus:border-emerald-400/70 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.18)]
                       disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            disabled={loading}
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-11 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md
                       text-white/35 outline-none
                       transition duration-200 ease-out
                       hover:text-white/70
                       focus-visible:ring-2 focus-visible:ring-emerald-400/40
                       disabled:cursor-not-allowed disabled:opacity-50"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            type="submit"
            disabled={loading}
            aria-label="Sign in"
            className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md
                       bg-emerald-500/90 text-black outline-none
                       transition duration-200 ease-out
                       hover:bg-emerald-400 hover:shadow-[0_0_18px_-4px_rgba(16,185,129,0.8)]
                       active:scale-95
                       focus-visible:ring-2 focus-visible:ring-emerald-400/60
                       disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ArrowRight size={16} />
            )}
          </button>
        </div>

        {capsOn && (
          <p className="xp-hint flex items-center gap-1.5 text-[11px] text-amber-300/80">
            <ArrowBigUp size={13} className="shrink-0" />
            <span>Caps Lock is on</span>
          </p>
        )}

        {errorMessage && (
          <p
            key={errorKey}
            role="alert"
            aria-live="assertive"
            className="xp-shake flex items-start gap-2 text-xs text-rose-300/90"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </p>
        )}
        </form>

        <p
          style={{ animationDelay: "0.16s" }}
          className="xp-rise text-[11px] tracking-wide text-white/25"
        >
          © {year} XenithPulse · Secure access
        </p>
      </div>
    </div>
  );
}
