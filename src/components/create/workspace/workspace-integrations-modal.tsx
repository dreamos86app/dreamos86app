"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { IntegrationSecretsPanel } from "@/components/create/workspace/integration-secrets-panel";
import { cn } from "@/lib/utils";

const PRESETS = {
  supabase: ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
  github: ["GITHUB_TOKEN"],
} as const;

export type IntegrationPreset = keyof typeof PRESETS;

/** Lightweight modal — no integrations panel import (avoids breaking Create client bundle). */
export function WorkspaceIntegrationsModal({
  open,
  onClose,
  preset,
  projectId,
}: {
  open: boolean;
  onClose: () => void;
  preset: IntegrationPreset;
  projectId: string | null;
}) {
  const title = preset === "supabase" ? "Connect Supabase to this app" : "Connect GitHub to this app";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10001] bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            className={cn(
              "fixed left-1/2 top-[12vh] z-[10002] w-[min(440px,calc(100vw-2rem))] -translate-x-1/2",
              "overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-border",
            )}
          >
            <div className="flex items-start justify-between border-b border-border px-4 py-3.5">
              <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface">
                <X className="size-4" />
              </button>
            </div>
            <div className="max-h-[min(60vh,480px)] overflow-y-auto p-4">
              {projectId ? (
                <IntegrationSecretsPanel projectId={projectId} requiredKeys={[...PRESETS[preset]]} />
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  Create or open an app first to connect {preset === "supabase" ? "Supabase" : "GitHub"}.
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
