"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { LogoIcon } from "@/components/ui/logo-icon";
import { cn } from "@/lib/utils";

export type PreviewShellState = "idle" | "building" | "compiling";

const BUILD_STEPS = [
  "Planning",
  "App identity",
  "Data model",
  "Screens",
  "Actions",
  "Preview polish",
];

export function BuildPreviewSurface({
  state,
  appName,
  currentStep,
  stepIndex = 0,
  className,
}: {
  state: PreviewShellState;
  appName?: string | null;
  currentStep?: string | null;
  stepIndex?: number;
  className?: string;
}) {
  const step =
    currentStep ??
    (state === "building" ? BUILD_STEPS[Math.min(stepIndex, BUILD_STEPS.length - 1)] : null);

  return (
    <div
      className={cn(
        "relative isolate flex h-full w-full flex-col overflow-hidden bg-[#f6f9ff]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(75%_50%_at_50%_18%,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_72%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-[radial-gradient(90%_80%_at_50%_100%,color-mix(in_oklab,var(--accent)_10%,transparent),transparent_70%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.11] [mask-image:radial-gradient(65%_55%_at_50%_35%,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(30,107,255,.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(30,107,255,.2) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />

      {state !== "idle" &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[42%] size-[min(90vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-accent/25"
            animate={{ opacity: [0, 0.4, 0], scale: [0.5, 1.25, 1.55] }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
              ease: "easeOut",
              delay: i * 0.55,
            }}
          />
        ))}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 py-10 text-center">
        <div className="relative flex size-[88px] items-center justify-center rounded-[1.35rem] shadow-[0_20px_50px_-20px_rgba(30,107,255,0.55)] ring-2 ring-white/80">
          <LogoIcon size={72} className="drop-shadow-md" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent/90">
            DreamOS86
          </p>
          <p className="mt-2 max-w-sm text-[15px] font-medium tracking-tight text-foreground">
            {state === "idle"
              ? "Ready to architect, build, and deploy."
              : appName
                ? `Building ${appName.replace(/\*\*/g, "").trim()}…`
                : "Building your app…"}
          </p>
          {state !== "idle" && step && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              Current step: <span className="font-semibold text-accent">{step}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-accent/15 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-md dark:bg-surface/80">
          <span className="relative flex size-1.5">
            {state !== "idle" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/50" />
            )}
            <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
          </span>
          {state === "idle"
            ? "Waiting for your prompt"
            : state === "compiling"
              ? "Compiling preview…"
              : "Generating your app"}
        </div>
      </div>
    </div>
  );
}
