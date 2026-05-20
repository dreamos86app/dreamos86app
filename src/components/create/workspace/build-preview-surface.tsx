"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogoIcon } from "@/components/ui/logo-icon";
import { cn } from "@/lib/utils";
import { parseBuildPlanCard, taskProgressIndex } from "@/lib/creation/parse-build-plan";

export function BuildPreviewSurface({
  thinking,
  assistantText,
  tokensEstimate,
  appName,
  className,
}: {
  thinking: boolean;
  assistantText: string;
  tokensEstimate: number | null;
  appName?: string | null;
  className?: string;
}) {
  const plan = React.useMemo(
    () => parseBuildPlanCard(assistantText || ""),
    [assistantText],
  );
  const showCard = thinking && assistantText.trim().length > 40;
  const idx = taskProgressIndex(assistantText.length, plan.taskLabels.length);

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

      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[42%] size-[min(90vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-accent/25"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{
            opacity: thinking ? [0, 0.4, 0] : [0, 0.22, 0],
            scale: thinking ? [0.5, 1.25, 1.55] : [0.5, 1.15, 1.45],
          }}
          transition={{
            duration: thinking ? 2.2 : 3.8,
            repeat: Infinity,
            ease: "easeOut",
            delay: i * (thinking ? 0.55 : 0.95),
          }}
        />
      ))}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
        {!showCard && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 text-center"
          >
            <div className="relative flex size-[88px] items-center justify-center rounded-[1.35rem] shadow-[0_20px_50px_-20px_rgba(30,107,255,0.55)] ring-2 ring-white/80">
              <LogoIcon size={72} className="drop-shadow-md" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent/90">
                DreamOS86
              </p>
              <p className="mt-2 max-w-sm text-[15px] font-medium tracking-tight text-foreground">
                {thinking
                  ? appName
                    ? `Building ${appName}…`
                    : "Building your app…"
                  : "Ready to architect, build, and deploy."}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-accent/15 bg-white/70 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-md dark:bg-surface/80">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/50" />
                <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
              </span>
              {thinking ? "Receiving build plan…" : "Waiting for your prompt"}
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {showCard && (
            <motion.div
              key="card"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-md rounded-2xl border border-border/70 bg-white/90 p-5 shadow-[0_24px_64px_-28px_rgba(30,107,255,0.35)] ring-1 ring-accent/10 backdrop-blur-md dark:bg-surface/95"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                Build plan
              </p>
              <h3 className="mt-1.5 text-[16px] font-semibold tracking-tight text-foreground">
                {plan.summary ?? "Shaping your application"}
              </h3>
              {plan.iconConcept && (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  <span className="font-medium text-foreground">Icon direction:</span>{" "}
                  {plan.iconConcept}
                </p>
              )}
              {plan.architecture && (
                <p className="mt-2 line-clamp-4 text-[12px] leading-relaxed text-muted-foreground">
                  {plan.architecture}
                </p>
              )}
              {tokensEstimate != null && (
                <p className="mt-3 text-[11px] tabular-nums text-muted-foreground">
                  Estimated credits for this model/mode:{" "}
                  <span className="font-semibold text-foreground">{tokensEstimate}</span>
                </p>
              )}
              <ul className="mt-4 space-y-2 border-t border-border/60 pt-4">
                {plan.taskLabels.map((label, i) => (
                  <li
                    key={`${label}-${i}`}
                    className={cn(
                      "flex items-center gap-2 text-[12px] transition",
                      i === idx ? "font-semibold text-accent" : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]",
                        i <= idx ? "bg-accent/15 text-accent" : "bg-muted/50",
                      )}
                    >
                      {i + 1}
                    </span>
                    {label}
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
