"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Live orchestration animation shown in the right preview panel before
 * the user has generated an app. This is intentionally NOT fake progress
 * — it never claims a build is happening. It's an idle pulse that reads
 * as "the OS is alive and ready".
 */
export function OrchestrationPreview({
  status = "idle",
  className,
}: {
  /** "idle" → ambient pulse. "thinking" → faster pulse + ring sweep. */
  status?: "idle" | "thinking";
  className?: string;
}) {
  const fast = status === "thinking";

  return (
    <div
      className={cn(
        "relative isolate flex h-full w-full items-center justify-center overflow-hidden",
        className,
      )}
    >
      {/* Ambient gradient field */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_50%,color-mix(in_oklab,var(--accent)_18%,transparent),transparent_70%)]" />

      {/* Soft grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15] [mask-image:radial-gradient(60%_60%_at_50%_50%,black,transparent)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.18) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      {/* Concentric pulse rings */}
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          aria-hidden
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{
            opacity: [0, 0.55, 0],
            scale: [0.4, 1.6, 1.85],
          }}
          transition={{
            duration: fast ? 2.4 : 4.2,
            ease: "easeOut",
            repeat: Infinity,
            delay: i * (fast ? 0.6 : 1.1),
          }}
          className="absolute size-[320px] rounded-full ring-1 ring-accent/40"
        />
      ))}

      {/* Center logo card */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center gap-4"
      >
        <motion.div
          animate={{ y: fast ? [0, -3, 0] : [0, -2, 0] }}
          transition={{
            duration: fast ? 1.6 : 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="relative flex size-24 items-center justify-center rounded-3xl"
        >
          <div className="flex size-full items-center justify-center">
            <Image
              src="/logo.png"
              alt="DreamOS86"
              width={80}
              height={80}
              className="object-contain"
              priority
            />
          </div>

          {/* Sweeping highlight */}
          <motion.span
            aria-hidden
            initial={{ x: "-100%" }}
            animate={{ x: "120%" }}
            transition={{
              duration: fast ? 2.0 : 3.4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="pointer-events-none absolute inset-y-0 w-1/3 rounded-3xl bg-gradient-to-r from-transparent via-white/25 to-transparent"
          />
        </motion.div>

        <div className="text-center">
          <p className="text-[12px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
            DreamOS86
          </p>
          <p className="mt-2 text-[14px] tracking-[-0.01em] text-muted-foreground">
            {fast
              ? "Orchestrating…"
              : "Ready to architect, build, and deploy."}
          </p>
        </div>

        {/* Tiny live indicator */}
        <div className="flex items-center gap-1.5 rounded-full bg-background/60 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-border backdrop-blur-md">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
          </span>
          {fast ? "Models active" : "Idle · waiting on prompt"}
        </div>
      </motion.div>
    </div>
  );
}
