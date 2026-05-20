"use client";

import { motion } from "framer-motion";
import { Plug } from "lucide-react";
import { IntegrationIconWell } from "@/components/brand/integration-icons";
import { variants } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface IntegrationShowcaseItem {
  name: string;
  desc: string;
  slug: string;
  iconWrap?: string;
}

export const INTEGRATION_SHOWCASE_ITEMS: IntegrationShowcaseItem[] = [
  { name: "Supabase", desc: "Database, Auth, Storage, Realtime", slug: "supabase" },
  { name: "Stripe", desc: "Payments, subscriptions, billing", slug: "stripe" },
  { name: "GitHub", desc: "Source control, CI/CD", slug: "github" },
  { name: "Vercel", desc: "Deployment and edge network", slug: "vercel" },
  { name: "Resend", desc: "Transactional email delivery", slug: "resend" },
  { name: "Slack", desc: "Notifications and webhooks", slug: "slack" },
  { name: "OpenAI", desc: "AI completions and embeddings", slug: "openai" },
  { name: "Gemini", desc: "Google multimodal models", slug: "gemini" },
];

function BrandIcon({
  name,
  slug,
  dense,
  iconWrap,
}: IntegrationShowcaseItem & { dense: boolean }) {
  return (
    <IntegrationIconWell
      provider={slug}
      size={dense ? "sm" : "md"}
      wellClassName={iconWrap}
      title={name}
    />
  );
}

export function IntegrationShowcaseGrid({
  className = "",
  dense = false,
}: {
  className?: string;
  dense?: boolean;
}) {
  return (
    <motion.div
      className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${className}`}
    >
      {INTEGRATION_SHOWCASE_ITEMS.map((intg, i) => (
        <motion.div
          key={intg.name}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03, duration: 0.2 }}
          className={
            dense
              ? "flex items-center gap-3 rounded-[var(--radius-lg)] bg-background px-3 py-2.5 ring-1 ring-border"
              : "group relative flex flex-col gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-surface to-background p-4 ring-1 ring-border transition hover:ring-accent/30 hover:shadow-lg"
          }
        >
          <motion.div className="flex items-center gap-3">
            <BrandIcon {...intg} dense={dense} />
            <motion.div className="min-w-0 flex-1">
              <p className={`font-semibold text-foreground ${dense ? "text-[12.5px]" : "text-[14px]"}`}>
                {intg.name}
              </p>
              <p
                className={`text-muted-foreground ${dense ? "truncate text-[10.5px]" : "mt-0.5 text-[12px] leading-snug line-clamp-2"}`}
              >
                {intg.desc}
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      ))}
    </motion.div>
  );
}

export function IntegrationShowcaseSection({ variant = "default" }: { variant?: "default" | "premium" }) {
  const premium = variant === "premium";
  return (
    <motion.section
      variants={variants.fadeUp}
      initial="hidden"
      animate="show"
      className="mx-auto w-full max-w-5xl"
    >
      <motion.div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <motion.div className="flex items-center gap-2">
          <motion.div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-2xl ring-1 ring-accent/25 shadow-sm",
              premium ? "bg-gradient-to-br from-accent/25 to-violet-500/15" : "bg-accent/12",
            )}
          >
            <Plug className="size-[18px] text-accent" strokeWidth={2} />
          </motion.div>
          <motion.div>
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Integrations</h2>
            <p className="text-[12px] text-muted-foreground">
              {premium
                ? "Drop-in adapters for data, payments, email, and AI — wire them up per app as you publish."
                : "Connect services inside each app after you create it — overview only here."}
            </p>
          </motion.div>
        </motion.div>
      </motion.div>
      <motion.div
        className={cn(
          "rounded-2xl p-4 backdrop-blur-sm sm:p-5",
          premium
            ? "border border-accent/15 bg-gradient-to-br from-accent/[0.06] via-surface/50 to-background shadow-[0_20px_50px_-24px_rgba(30,107,255,0.35)] ring-1 ring-border/80"
            : "bg-surface/40 ring-1 ring-border/80",
        )}
      >
        <IntegrationShowcaseGrid />
      </motion.div>
    </motion.section>
  );
}
