"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { LogoIcon } from "@/components/ui/logo-icon";
import { PublicThemeToggle } from "@/components/marketing/public-theme-toggle";
import { cn } from "@/lib/utils";

export function PublicMarketingHeader({ className }: { className?: string }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const secondaryLinks = [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    { href: "/auth/login", label: "Log in" },
  ] as const;

  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur-xl",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-3 py-2.5 sm:px-6 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/"
            className="flex min-w-0 shrink items-center gap-2"
            aria-label="DreamOS86 home"
          >
            <LogoIcon size={32} className="sm:hidden" />
            <LogoIcon size={36} className="hidden sm:block" />
            <span className="truncate text-[13px] font-semibold tracking-tight text-foreground sm:text-[14px]">
              DreamOS86
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <PublicThemeToggle className="size-8 sm:size-9" />

            <nav className="hidden items-center gap-0.5 md:flex" aria-label="Public">
              {secondaryLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground"
                >
                  {label}
                </Link>
              ))}
              <Link
                href="/auth/signup"
                className="ml-1 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-accent/90"
              >
                Get Started
              </Link>
            </nav>

            <Link
              href="/auth/signup"
              className="rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-accent/90 md:hidden"
            >
              Start
            </Link>

            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition hover:bg-surface hover:text-foreground md:hidden"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <nav
            className="mt-2 flex flex-col gap-0.5 border-t border-border/60 pt-2 pb-1 md:hidden"
            aria-label="Public mobile"
          >
            {secondaryLinks.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg px-2 py-2.5 text-[13px] font-medium text-muted-foreground transition hover:bg-surface hover:text-foreground"
              >
                {label}
              </Link>
            ))}
            <Link
              href="/auth/signup"
              className="mt-1 rounded-lg bg-accent px-3 py-2.5 text-center text-[13px] font-semibold text-white"
            >
              Get Started
            </Link>
          </nav>
        ) : null}
      </div>
    </header>
  );
}

export function PublicMarketingFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t border-border/60 bg-background/90", className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <Link href="/" className="flex items-center gap-2">
            <LogoIcon size={28} />
            <span className="text-[13px] font-semibold text-foreground">DreamOS86</span>
          </Link>
          <p className="text-center text-[11px] text-muted-foreground sm:text-left">
            © {new Date().getFullYear()} DreamOS86. All rights reserved.
          </p>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px]" aria-label="Legal">
          <Link
            href="/privacy"
            className="text-muted-foreground transition hover:text-foreground hover:underline underline-offset-4"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="text-muted-foreground transition hover:text-foreground hover:underline underline-offset-4"
          >
            Terms
          </Link>
          <Link
            href="/contact"
            className="text-muted-foreground transition hover:text-foreground hover:underline underline-offset-4"
          >
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}

export function PublicMarketingShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative flex min-h-screen flex-col bg-atmosphere", className)}>
      <PublicMarketingHeader />
      <main className="relative z-10 flex-1">{children}</main>
      <PublicMarketingFooter />
    </div>
  );
}
