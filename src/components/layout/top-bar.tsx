"use client";

import { Menu, Search } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { IconButton } from "@/components/ui/icon-button";
import { UserMenu } from "@/components/layout/user-menu";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCommandCenter } from "@/components/command/command-center";
import { NotificationBell } from "@/components/notifications/notification-panel";

type TopBarProps = {
  mode: "create" | "standard";
  title: string;
  subtitle?: string;
  onMenuClick: () => void;
};

export function TopBar({ mode, title, subtitle, onMenuClick }: TopBarProps) {
  const isCreate = mode === "create";
  useAuthStore(); // profile available via UserMenu
  const { openCommandCenter } = useCommandCenter();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 px-4 backdrop-blur-xl sm:px-5",
        isCreate
          ? "border-b border-transparent bg-background/40"
          : "border-b border-border bg-background/70",
      )}
    >
      <IconButton
        label="Open navigation"
        className="lg:hidden"
        onClick={onMenuClick}
      >
        <Menu className="size-[18px]" strokeWidth={1.65} />
      </IconButton>

      {!isCreate ? (
        <div className="min-w-0 flex-1 lg:flex-none">
          <h1 className="truncate text-[15px] font-semibold tracking-[-0.03em] text-foreground sm:text-[16px]">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-[12px] text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      ) : (
        <div className="hidden flex-1 lg:block" />
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {/* Cmd+K command center trigger */}
        <button
          type="button"
          onClick={openCommandCenter}
          className="hidden items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-[12px] text-muted-foreground ring-1 ring-border transition hover:bg-surface-raised hover:text-foreground md:flex"
          aria-label="Open command center"
        >
          <Search className="size-3.5" strokeWidth={1.75} />
          <span>Search…</span>
          <kbd className="rounded bg-background/60 px-1 py-0.5 text-[10px] font-mono ring-1 ring-border/60">⌘K</kbd>
        </button>

        <ThemeToggle />

        {/* Notifications bell — opens in-app panel */}
        <NotificationBell />

        <div className="hidden h-7 w-px bg-border sm:block" />

        {/* User account dropdown */}
        <UserMenu />
      </div>
    </header>
  );
}
