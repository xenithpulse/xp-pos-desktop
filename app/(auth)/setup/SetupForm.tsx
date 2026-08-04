'use client';

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowBigUp,
  Check,
  ShieldCheck,
} from "lucide-react";

const MIN_PASSWORD = 8;

// Same attributes the login form uses to keep password managers from filling
// (and then saving) the wrong thing on a shared back-office machine.
const NO_AUTOFILL = {
  autoCorrect: "off",
  autoCapitalize: "none",
  spellCheck: false,
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-form-type": "other",
} as const;

const FIELD =
  `w-full rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none
   transition duration-300 ease-out
   placeholder:text-white/30
   hover:border-white/20
   focus:border-emerald-400/70 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.18)]
   disabled:cursor-not-allowed disabled:opacity-60`;

export default function SetupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorKey, setErrorKey] = useState(0);

  const syncCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);
  };

  // Live requirements, shown as a checklist rather than as an error after the
  // fact. Someone inventing a password on a tablet should be able to see what
  // is still missing while they type it.
  const checks = useMemo(
    () => [
      { label: `At least ${MIN_PASSWORD} characters`, ok: password.length >= MIN_PASSWORD },
      { label: "Not the same as the username", ok: password.length > 0 && password.toLowerCase() !== username.trim().toLowerCase() },
      { label: "Both passwords match", ok: password.length > 0 && password === confirm },
    ],
    [password, confirm, username],
  );

  const ready = username.trim().length >= 3 && checks.every((c) => c.ok);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ready || loading) return;

    setLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/setup/owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setLoading(false);
        setErrorMessage(data.error || "Could not create the account. Please try again.");
        setErrorKey((k) => k + 1);
        return;
      }

      // Straight to the login page to use what they just chose. Signing them in
      // automatically would hide a typo until the next morning's shift.
      router.push("/login?created=1");
    } catch {
      setLoading(false);
      setErrorMessage("Could not reach the POS. Check that it is still running.");
      setErrorKey((k) => k + 1);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      autoComplete="off"
      noValidate
      style={{ animationDelay: "0.08s" }}
      className="xp-rise relative z-10 flex w-full max-w-sm flex-col gap-3.5"
    >
      <input type="text" name="_fake_user" autoComplete="username" tabIndex={-1} aria-hidden className="hidden" />
      <input type="password" name="_fake_pass" autoComplete="current-password" tabIndex={-1} aria-hidden className="hidden" />

      <input
        id="username"
        name="username"
        type="text"
        placeholder="Choose a username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="off"
        autoFocus
        required
        disabled={loading}
        {...NO_AUTOFILL}
        className={FIELD}
      />

      <div className="relative">
        <input
          id="password"
          name="password"
          type={showPassword ? "text" : "password"}
          placeholder="Choose a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          disabled={loading}
          onKeyUp={syncCapsLock}
          onKeyDown={syncCapsLock}
          onBlur={() => setCapsOn(false)}
          {...NO_AUTOFILL}
          className={`${FIELD} pr-12`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((s) => !s)}
          disabled={loading}
          tabIndex={-1}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md
                     text-white/35 outline-none transition duration-200 ease-out
                     hover:text-white/70 focus-visible:ring-2 focus-visible:ring-emerald-400/40
                     disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      <input
        id="confirm"
        name="confirm"
        type={showPassword ? "text" : "password"}
        placeholder="Type the password again"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        required
        disabled={loading}
        onKeyUp={syncCapsLock}
        onKeyDown={syncCapsLock}
        onBlur={() => setCapsOn(false)}
        {...NO_AUTOFILL}
        className={FIELD}
      />

      <ul className="flex flex-col gap-1.5 pt-0.5">
        {checks.map((c) => (
          <li
            key={c.label}
            className={`flex items-center gap-2 text-[11px] transition-colors duration-200 ${
              c.ok ? "text-emerald-300/85" : "text-white/30"
            }`}
          >
            <span
              className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border transition-colors duration-200 ${
                c.ok ? "border-emerald-400/60 bg-emerald-400/15" : "border-white/15"
              }`}
            >
              {c.ok && <Check size={9} strokeWidth={3.5} />}
            </span>
            {c.label}
          </li>
        ))}
      </ul>

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

      <button
        type="submit"
        disabled={!ready || loading}
        className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-500/90 px-4 py-3 text-sm font-semibold text-black
                   outline-none transition duration-200 ease-out
                   hover:bg-emerald-400 hover:shadow-[0_0_22px_-6px_rgba(16,185,129,0.9)]
                   active:scale-[0.99]
                   focus-visible:ring-2 focus-visible:ring-emerald-400/60
                   disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 disabled:shadow-none"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Creating your account
          </>
        ) : (
          <>
            Create owner account
            <ArrowRight size={16} />
          </>
        )}
      </button>

      <p className="flex items-start gap-2 pt-1 text-[11px] leading-relaxed text-white/30">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" />
        <span>
          This account can do everything, including creating accounts for your staff.
          It is stored on this computer only. Nobody at XenithPulse can see or reset it,
          so keep the password somewhere safe.
        </span>
      </p>
    </form>
  );
}
