"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  CheckCheck,
  Zap,
  AlertCircle,
  CheckCircle2,
  Rocket,
  Globe,
  Users,
  X,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationsStore } from "@/lib/stores/notifications-store";
import Link from "next/link";

// ─── Notification type icons ───────────────────────────────────────────────────

const NOTIF_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  deploy:  { icon: Rocket,       color: "text-emerald-600",   bg: "bg-emerald-500/10" },
  build:   { icon: AlertCircle,  color: "text-amber-600",     bg: "bg-amber-500/10" },
  invite:  { icon: Users,        color: "text-violet-600",    bg: "bg-violet-500/10" },
  credit:  { icon: Zap,          color: "text-amber-600",     bg: "bg-amber-500/10" },
  ai:      { icon: CheckCircle2, color: "text-accent",        bg: "bg-accent/10" },
  system:  { icon: Bell,         color: "text-muted-foreground", bg: "bg-surface" },
};

function getMeta(type: string) {
  return NOTIF_META[type] ?? NOTIF_META.system;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Notification panel ───────────────────────────────────────────────────────

interface NotificationPanelProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
}

export function NotificationPanel({ anchorRef, open, onClose }: NotificationPanelProps) {
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationsStore();
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { setMounted(true); }, []);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose, anchorRef]);

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Compute panel position from anchor
  const [pos, setPos] = React.useState({ top: 0, right: 0 });
  React.useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  }, [open, anchorRef]);

  const panel = mounted ? createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 9999, width: 340 }}
          className="overflow-hidden rounded-2xl bg-background shadow-[0_20px_60px_-12px_rgba(0,0,0,0.35)] ring-1 ring-border"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="size-3.5 text-muted-foreground/70" strokeWidth={1.75} />
              <span className="text-[13px] font-semibold text-foreground">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-[11.5px] text-muted-foreground transition hover:text-foreground"
                >
                  <CheckCheck className="size-3.5" strokeWidth={1.75} />
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 transition hover:bg-surface hover:text-foreground"
              >
                <X className="size-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[420px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-surface ring-1 ring-border">
                  <Bell className="size-6 text-muted-foreground/40" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-[13.5px] font-medium text-foreground">All clear</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Notifications for deployments, builds, credits, and collaborators appear here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {notifications.slice(0, 20).map((n) => {
                  const meta = getMeta(n.type ?? "system");
                  const Icon = meta.icon;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => markRead(n.id)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface/60",
                        !n.read && "bg-accent/3",
                      )}
                    >
                      <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl", meta.bg)}>
                        <Icon className={cn("size-4", meta.color)} strokeWidth={1.65} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-[12.5px] leading-snug", !n.read ? "font-semibold text-foreground" : "text-foreground/80")}>
                          {n.title ?? n.type}
                        </p>
                        {n.body && (
                          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground line-clamp-2">{n.body}</p>
                        )}
                        <p className="mt-1 text-[10.5px] text-muted-foreground/60">
                          {relativeTime(n.created_at)}
                        </p>
                      </div>
                      {!n.read && (
                        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2.5">
            <Link
              href="/settings/notifications"
              onClick={onClose}
              className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground transition hover:text-foreground"
            >
              <Settings className="size-3.5" strokeWidth={1.65} />
              Notification settings
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  ) : null;

  return panel;
}

// ─── Notification bell button (for TopBar) ────────────────────────────────────

export function NotificationBell() {
  const { unreadCount } = useNotificationsStore();
  const [open, setOpen] = React.useState(false);
  const bellRef = React.useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={bellRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative inline-flex size-8 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground transition hover:bg-surface hover:text-foreground",
          open && "bg-surface text-foreground",
        )}
        aria-label="Notifications"
      >
        <Bell className="size-[17px]" strokeWidth={1.55} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-accent ring-2 ring-background"
            />
          )}
        </AnimatePresence>
      </button>

      <NotificationPanel
        anchorRef={bellRef as React.RefObject<HTMLElement>}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
