"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Compass, MessageSquare, Users, LayoutGrid } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { cn } from "@/lib/utils";

const pageMeta: Record<string, { title: string; subtitle?: string }> = {
  "/projects": {
    title: "Your Apps",
    subtitle: "Everything you've brought to life — open, remix, or ship.",
  },
  "/templates": {
    title: "Templates",
    subtitle: "Start from a beautiful foundation.",
  },
  "/explore": {
    title: "Explore",
    subtitle: "Discover apps and ideas built by the community.",
  },
  "/chat": {
    title: "AI Chat",
    subtitle: "Talk to the world's best models in one place.",
  },
  "/deploy": {
    title: "Deployment Center",
    subtitle: "Manage environments, domains, and release pipelines.",
  },
  "/marketplace": {
    title: "Marketplace",
    subtitle: "Extensions, plugins, and community components.",
  },
  "/analytics": {
    title: "Analytics",
    subtitle: "Usage, credits, and generation insights.",
  },
  "/media": {
    title: "Media & Assets",
    subtitle: "Generated images, uploads, and asset organization.",
  },
  "/community": {
    title: "Community",
    subtitle: "Forums, showcases, and shared knowledge.",
  },
  "/dashboard": {
    title: "Dashboard",
    subtitle: "Jump to apps, create, tokens, and settings.",
  },
  "/settings": {
    title: "Settings",
    subtitle: "Account workspace, keys, and preferences.",
  },
  "/settings/account": {
    title: "Account",
    subtitle: "Profile, security, and personal preferences.",
  },
  "/settings/billing": {
    title: "Billing",
    subtitle: "Subscription, invoices, and payment methods.",
  },
  "/settings/team": {
    title: "Team",
    subtitle: "Members, roles, and collaboration settings.",
  },
  "/settings/models": {
    title: "AI Models",
    subtitle: "Model preferences, routing, and credit usage.",
  },
  "/settings/api-keys": {
    title: "API Keys",
    subtitle: "Manage keys for programmatic access.",
  },
  "/settings/integrations": {
    title: "Integrations",
    subtitle: "Connect GitHub, Vercel, Stripe, and more.",
  },
  "/settings/notifications": {
    title: "Notifications",
    subtitle: "Choose what you hear about and when.",
  },
  "/pricing": {
    title: "Pricing",
    subtitle: "Choose the plan that fits your ambitions.",
  },
  "/credits": {
    title: "Credit usage",
    subtitle: "Real-time tracking of your AI credit spend.",
  },
  "/help": {
    title: "Help Center",
    subtitle: "Guides, docs, and support resources.",
  },
  "/changelog": {
    title: "Changelog",
    subtitle: "What's new in DreamOS86.",
  },
  "/admin": {
    title: "Admin Panel",
    subtitle: "Platform management — restricted access.",
  },
  "/onboarding": {
    title: "Welcome to DreamOS86",
    subtitle: "Let's get you set up.",
  },
};

// ─── Mobile bottom navigation bar ────────────────────────────────────────────

const MOBILE_NAV = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/projects", icon: LayoutGrid, label: "Apps" },
  { href: "/explore", icon: Compass, label: "Explore" },
  { href: "/chat", icon: MessageSquare, label: "Chat" },
  { href: "/community", icon: Users, label: "Community" },
];

function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center border-t border-border lg:hidden bg-background/90 backdrop-blur-xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {MOBILE_NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
              active ? "text-accent" : "text-muted-foreground",
            )}
          >
            {active && (
              <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-accent" />
            )}
            <Icon
              className={cn("size-5 transition-transform", active && "scale-110")}
              strokeWidth={active ? 2 : 1.5}
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// Ambient background orbs — ultra subtle, alive but not distracting
function AmbientOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {/* Primary violet orb — top right */}
      <motion.div
        className="absolute -right-64 -top-64 size-[700px] rounded-full bg-violet-600/[0.04] blur-[120px]"
        animate={{
          x: [0, 40, -20, 0],
          y: [0, -30, 20, 0],
          scale: [1, 1.08, 0.97, 1],
        }}
        transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Blue orb — bottom left */}
      <motion.div
        className="absolute -bottom-48 -left-48 size-[600px] rounded-full bg-blue-500/[0.04] blur-[100px]"
        animate={{
          x: [0, -25, 35, 0],
          y: [0, 20, -15, 0],
          scale: [1, 0.95, 1.05, 1],
        }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 4 }}
      />
      {/* Accent orb — center */}
      <motion.div
        className="absolute left-1/2 top-1/3 size-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.025] blur-[90px]"
        animate={{
          scale: [1, 1.12, 0.94, 1],
          opacity: [0.6, 1, 0.5, 0.6],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 8 }}
      />
    </div>
  );
}

export function PlatformShell({
  children,
  homeSessionFromServer = false,
}: {
  children: React.ReactNode;
  /** From server `getUser()` for `/` chrome — avoids client auth hydration flash. */
  homeSessionFromServer?: boolean;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const isOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const isCreateHome = pathname === "/" && homeSessionFromServer;
  const isFullBleed =
    isOnboarding || (pathname === "/" && homeSessionFromServer) || pathname === "/chat";
  /** Home scrolls on `main` so the scrollbar sits at the right edge of the content column. */
  const isHomeShellScroll = pathname === "/" && homeSessionFromServer;
  const meta = pageMeta[pathname] ?? { title: "DreamOS86" };

  /** Marketing landing: no app sidebar (session absent on server for this navigation). */
  const minimalHomeChrome = pathname === "/" && !homeSessionFromServer;

  // Close mobile menu on route change
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (isOnboarding) {
    return (
      <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-background">
        <AmbientOrbs />
        <main className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    );
  }

  if (minimalHomeChrome) {
    return (
      <div className="relative flex h-[100dvh] overflow-hidden bg-background">
        <AmbientOrbs />
        <main className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="flex w-full min-w-0 flex-1 flex-col"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    );
  }

  return (
    // h-screen + overflow-hidden ensures only the content area scrolls,
    // not the entire page — sidebar and topbar remain perfectly fixed.
    <div className="relative flex h-[100dvh] overflow-hidden bg-background">
      <AmbientOrbs />
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Right column: topbar + scrollable content */}
      <div className="relative z-[1] flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          mode={isCreateHome ? "create" : "standard"}
          title={meta.title}
          subtitle={meta.subtitle}
          onMenuClick={() => setMobileOpen(true)}
        />

        {/* Only this scrolls — sidebar/topbar stay fixed */}
        <main
          className={
            isHomeShellScroll
              ? "relative flex min-h-0 flex-1 min-w-0 flex-col overflow-y-auto overflow-x-hidden"
              : isFullBleed
                ? "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
                : "relative flex-1 overflow-y-auto overflow-x-hidden bg-atmosphere px-[var(--page-padding-x)] py-[var(--page-padding-y)] pb-[calc(var(--page-padding-y)_+_4rem)] lg:pb-[var(--page-padding-y)]"
          }
          style={
            isHomeShellScroll || !isFullBleed ? { scrollBehavior: "smooth" } : undefined
          }
        >
          {/*
            IMPORTANT: do NOT add `mode="wait"` here, and do NOT add a
            second AnimatePresence inside template.tsx. Two presences keyed
            by pathname produce intermittent white-screens in production
            (React 19 scheduler races the framer-motion exit commit).
            `popLayout` lets the next page mount immediately on top while
            the previous page fades out — never a blank frame.
          */}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: isFullBleed ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className={
                isHomeShellScroll
                  ? "flex w-full min-w-0 flex-col"
                  : isFullBleed
                    ? "flex h-full min-h-0 min-w-0 flex-col"
                    : "min-h-full"
              }
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile bottom navigation — only on small screens */}
      <MobileBottomNav />
    </div>
  );
}
