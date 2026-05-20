"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authSignInWithOAuth, humanizeAuthError } from "@/lib/auth";
import { cn } from "@/lib/utils";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        className="text-[#24292f] dark:text-white"
        d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.08.81 2.19 0 1.585-.015 2.85-.015 3.225 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
      />
    </svg>
  );
}

const oauthBtnClass =
  "flex min-h-[54px] w-full items-center justify-center gap-3 rounded-xl border-2 border-border bg-background px-5 py-3.5 text-[15px] font-semibold text-foreground shadow-md transition hover:border-accent/40 hover:bg-surface active:scale-[0.99] disabled:opacity-60 sm:min-h-[52px] sm:max-w-[280px]";

export function PublicSignupSection() {
  const [oauthLoading, setOauthLoading] = React.useState<"google" | "github" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleOAuth(provider: "google" | "github") {
    setOauthLoading(provider);
    setError(null);
    const { error: oauthError } = await authSignInWithOAuth(provider);
    if (oauthError) {
      setError(humanizeAuthError(oauthError.message, provider));
      setOauthLoading(null);
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto mt-14 max-w-3xl"
    >
      <motion.div className="relative overflow-hidden rounded-[1.75rem] border border-accent/20 bg-gradient-to-br from-accent/[0.08] via-background to-sky-500/[0.06] p-5 text-center shadow-[0_24px_64px_-28px_rgba(30,107,255,0.3)] ring-1 ring-border/80 sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,hsl(var(--accent)/0.15),transparent_65%)]"
        />
        <motion.div className="relative">
          <h2 className="text-balance text-[22px] font-semibold tracking-tight text-foreground sm:text-[26px]">
            Start building with DreamOS86
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
            Create apps with AI, chat across models, and publish hosted previews — all in one workspace.
          </p>

          <motion.div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center sm:justify-center">
            <Button asChild size="lg" className="h-12 min-h-[48px] rounded-full px-8 text-[14px] sm:flex-1 sm:max-w-[220px]">
              <Link href="/auth/signup">Create your account</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 min-h-[48px] rounded-full px-8 text-[14px] sm:flex-1 sm:max-w-[220px]"
            >
              <Link href="/auth/login">Log in</Link>
            </Button>
          </motion.div>

          <p className="mt-6 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            or continue with
          </p>

          <motion.div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              className={cn(oauthBtnClass, oauthLoading === "google" && "opacity-70")}
              disabled={oauthLoading !== null}
              onClick={() => void handleOAuth("google")}
            >
              {oauthLoading === "google" ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : (
                <GoogleIcon className="size-5 shrink-0" />
              )}
              Continue with Google
            </button>
            <button
              type="button"
              className={cn(oauthBtnClass, oauthLoading === "github" && "opacity-70")}
              disabled={oauthLoading !== null}
              onClick={() => void handleOAuth("github")}
            >
              {oauthLoading === "github" ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : (
                <GitHubIcon className="size-5 shrink-0" />
              )}
              Continue with GitHub
            </button>
          </motion.div>

          {error ? <p className="mt-4 text-[12px] text-destructive">{error}</p> : null}
        </motion.div>
      </motion.div>
    </motion.section>
  );
}
