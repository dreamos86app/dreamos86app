"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, LayoutDashboard, Palette, Database, Plug, Monitor, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { label: "Planning your app", description: "Architecture and screens", icon: LayoutDashboard },
  { label: "Creating app identity", description: "Name, theme, and icon", icon: Sparkles },
  { label: "Designing dashboard", description: "Layout and components", icon: Palette },
  { label: "Creating data model", description: "Tables and relationships", icon: Database },
  { label: "Wiring actions", description: "API and business logic", icon: Plug },
  { label: "Preparing preview", description: "Live preview surface", icon: Monitor },
] as const;

interface Props {
  isStreaming: boolean;
  className?: string;
  /** 0-based active step while streaming */
  activeStep?: number;
}

export function BuildStatusNarrator({ isStreaming, className, activeStep = 0 }: Props) {
  const [tick, setTick] = React.useState(0);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (isStreaming) {
      setVisible(true);
      const id = setInterval(() => setTick((t) => t + 1), 2800);
      return () => clearInterval(id);
    }
    const t = setTimeout(() => setVisible(false), 600);
    return () => clearTimeout(t);
  }, [isStreaming]);

  const index = isStreaming ? (activeStep >= 0 ? activeStep : tick) % STEPS.length : 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className={cn("space-y-1.5 px-2", className)}
        >
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const status = i < index ? "done" : i === index ? "active" : "pending";
            return (
              <div
                key={step.label}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 transition",
                  status === "active" &&
                    "bg-accent/[0.1] ring-accent/35 shadow-[0_0_16px_-6px_hsl(var(--accent)/0.45)]",
                  status === "done" && "bg-surface/80 ring-border/70",
                  status === "pending" && "opacity-50 ring-border/40",
                )}
              >
                {status === "done" ? (
                  <CheckCircle2 className="size-3.5 shrink-0 text-accent" strokeWidth={1.75} />
                ) : status === "active" ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" strokeWidth={2} />
                ) : (
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                )}
                <div className="min-w-0">
                  <p className="text-[11.5px] font-semibold text-foreground">{step.label}</p>
                  {status === "active" && (
                    <p className="text-[10.5px] text-muted-foreground">{step.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
