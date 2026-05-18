"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, X, Loader2 } from "lucide-react";
import { runFullSignOut } from "@/lib/auth/sign-out-client";

interface LogoutConfirmModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Logout confirmation modal.
 *
 * Uses createPortal so it always renders at the document body level,
 * guaranteeing correct stacking regardless of parent overflow/z-index.
 */
export function LogoutConfirmModal({ open, onClose }: LogoutConfirmModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => { setMounted(true); }, []);

  async function confirmLogout() {
    setLoading(true);
    try {
      await runFullSignOut();
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !loading) onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, loading]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 99998,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            background: "rgba(15,23,60,0.45)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
          onClick={loading ? undefined : onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ width: "100%", maxWidth: "22rem", zIndex: 99999 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="overflow-hidden rounded-2xl bg-background ring-1 ring-accent/20 shadow-[0_0_0_1px_hsl(var(--accent)/0.12),0_8px_32px_-4px_hsl(var(--accent)/0.18),0_24px_64px_-8px_hsl(var(--accent)/0.10)]">
              <div className="h-1 w-full bg-gradient-to-r from-accent via-violet-500 to-accent" />

              <div className="flex items-start justify-between gap-3 px-6 pt-5">
                <div className="flex items-center gap-3.5">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20">
                    <LogOut className="size-5 text-accent" strokeWidth={1.65} />
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-foreground">Log out of DreamOS86?</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground leading-relaxed">
                      You&apos;ll be redirected to sign in.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-surface hover:text-foreground"
                >
                  <X className="size-3.5" strokeWidth={1.75} />
                </button>
              </div>

              <div className="flex items-center gap-2.5 px-6 py-5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 rounded-xl bg-surface py-2.5 text-[13px] font-medium text-foreground ring-1 ring-border transition hover:bg-surface-raised disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmLogout}
                  disabled={loading}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-violet-500 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_16px_-2px_hsl(var(--accent)/0.40)] transition hover:opacity-90 active:scale-[0.98] disabled:opacity-70 disabled:shadow-none"
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
                      Signing out…
                    </>
                  ) : (
                    <>
                      <LogOut className="size-3.5" strokeWidth={2} />
                      Log out
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
