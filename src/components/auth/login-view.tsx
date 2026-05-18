"use client";

import * as React from "react";
import Link from "next/link";
import { LogoIcon } from "@/components/ui/logo-icon";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Eye, EyeOff, AlertCircle, Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { variants } from "@/lib/motion";
import {
  authSignIn,
  authSignInWithOAuth,
  humanizeAuthError,
  CALLBACK_ERROR_MESSAGES,
} from "@/lib/auth";
import { persistReferralCodeForBrowser } from "@/lib/auth/ref-cookie";

export function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showPassword, setShowPassword] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [oauthLoading, setOauthLoading] = React.useState<"google" | "github" | null>(null);
  const [isOnline, setIsOnline] = React.useState(true);
  const [lastAction, setLastAction] = React.useState<(() => void) | null>(null);

  React.useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const ref = p.get("ref");
      if (ref?.trim()) persistReferralCodeForBrowser(ref);
    } catch {
      /* ignore */
    }
  }, []);

  // Network status detection
  React.useEffect(() => {
    setIsOnline(navigator.onLine);
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Read ?error= forwarded by the callback route after OAuth / link failures
  const urlError = searchParams.get("error");
  const urlErrorDesc = searchParams.get("error_description");
  const [error, setError] = React.useState<string | null>(
    urlError
      ? (CALLBACK_ERROR_MESSAGES[urlError] ?? urlErrorDesc ?? "Authentication error. Please try again.")
      : null,
  );
  const isNetworkError = error?.toLowerCase().includes("network") || error?.toLowerCase().includes("connection");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);

    const action = async () => {
      const { error: authError } = await authSignIn(email, password);
      if (authError) {
        setError(humanizeAuthError(authError.message));
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    };

    setLastAction(() => action);
    await action();
  }

  async function handleOAuth(provider: "google" | "github") {
    setOauthLoading(provider);
    setError(null);

    const next = searchParams.get("next") ?? undefined;
    const { error: oauthError } = await authSignInWithOAuth(provider, next);

    if (oauthError) {
      setError(humanizeAuthError(oauthError.message, provider));
      setOauthLoading(null);
    }
    // On success Supabase redirects — no further client action needed
  }

  const anyLoading = loading || oauthLoading !== null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <motion.div
        variants={variants.fadeUp}
        initial="hidden"
        animate="show"
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <Link href="/" className="flex items-center gap-3" tabIndex={-1}>
            <LogoIcon size={44} />
            <span className="text-[18px] font-semibold tracking-[-0.04em] text-foreground">
              DreamOS86
            </span>
          </Link>
        </div>

        <div className="overflow-hidden rounded-[var(--radius-xl)] bg-glass backdrop-blur-xl shadow-[var(--shadow-glass)] ring-1 ring-white/60 dark:ring-white/[0.08] p-8">
          <h1 className="text-[20px] font-semibold tracking-[-0.04em] text-foreground">
            Welcome back
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Sign in to your workspace
          </p>

          {/* Offline banner */}
          {!isOnline && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400"
              role="status"
            >
              <WifiOff className="size-3.5 shrink-0" strokeWidth={2} />
              You&apos;re offline. Check your connection.
            </motion.div>
          )}

          {error && (
            <motion.div
              key={error}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive ring-1 ring-destructive/20"
              role="alert"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} />
              <span className="flex-1">{error}</span>
              {isNetworkError && lastAction && (
                <button
                  className="ml-2 shrink-0 text-[11px] font-medium text-accent hover:underline"
                  onClick={() => { setError(null); void lastAction(); }}
                >
                  Retry
                </button>
              )}
            </motion.div>
          )}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[12px] font-medium text-foreground">
                Email
              </label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={anyLoading}
                required
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-[12px] font-medium text-foreground">
                  Password
                </label>
                <Link
                  href="/auth/forgot"
                  className="text-[12px] text-accent hover:underline underline-offset-4"
                  tabIndex={-1}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="pr-10"
                  disabled={anyLoading}
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" strokeWidth={1.55} />
                  ) : (
                    <Eye className="size-4" strokeWidth={1.55} />
                  )}
                </button>
              </div>
            </div>

            <Button
              variant="accent"
              size="lg"
              className="w-full"
              type="submit"
              disabled={anyLoading || !email || !password}
            >
              {loading ? <Loader2 className="size-4 animate-spin" aria-label="Signing in…" /> : "Sign in"}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] text-muted-foreground">or continue with</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-2.5">
            <Button
              variant="secondary"
              size="lg"
              className="w-full gap-3"
              onClick={() => handleOAuth("github")}
              disabled={anyLoading}
              type="button"
              aria-label="Continue with GitHub"
            >
              {oauthLoading === "github" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              )}
              Continue with GitHub
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="w-full gap-3"
              onClick={() => handleOAuth("google")}
              disabled={anyLoading}
              type="button"
              aria-label="Continue with Google"
            >
              {oauthLoading === "google" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              Continue with Google
            </Button>
          </div>
        </div>

        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          New to DreamOS86?{" "}
          <Link
            href="/auth/signup"
            className="font-medium text-accent hover:underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          By signing in, you agree to our{" "}
          <Link href="/terms" className="hover:underline underline-offset-4">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="hover:underline underline-offset-4">
            Privacy Policy
          </Link>
          .
        </p>
      </motion.div>
    </div>
  );
}
