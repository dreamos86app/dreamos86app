"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Layers, ArrowRight, Globe, Database, Zap, CreditCard, BookOpen, Bell } from "lucide-react";

const APP_INTEGRATIONS = [
  { icon: "⚡", name: "Supabase", desc: "Database, Auth, Storage, Realtime" },
  { icon: "💳", name: "Stripe", desc: "Payments, subscriptions, billing" },
  { icon: "🐱", name: "GitHub", desc: "Source control, CI/CD" },
  { icon: "📧", name: "Resend", desc: "Transactional email delivery" },
  { icon: "💬", name: "Slack", desc: "Notifications and webhooks" },
  { icon: "🤖", name: "OpenAI", desc: "Embed AI completions" },
];

export default function IntegrationsSettingsPage() {
  return (
    <div className="space-y-6">
      {/* Architecture notice */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-accent/5 p-5 ring-1 ring-accent/20"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10">
            <Layers className="size-5 text-accent" strokeWidth={1.65} />
          </div>
          <div>
            <p className="text-[13.5px] font-semibold text-foreground">
              Integrations are app-scoped
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground leading-relaxed">
              DreamOS86 is a multi-app platform. Each app has its own integrations, keeping
              your services separate and your projects independent.
              Connect integrations from within each app&apos;s dashboard.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Available integrations preview */}
      <div>
        <p className="mb-3 text-[12.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Available integrations per app
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {APP_INTEGRATIONS.map(({ icon, name, desc }) => (
            <div key={name} className="flex items-center gap-3 rounded-xl bg-surface p-3 ring-1 ring-border">
              <span className="text-xl">{icon}</span>
              <div>
                <p className="text-[13px] font-semibold text-foreground">{name}</p>
                <p className="text-[11.5px] text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-2xl border border-dashed border-border p-6 text-center">
        <p className="text-[14px] font-semibold text-foreground">
          Open an app to configure its integrations
        </p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Go to your app dashboard → Integrations tab to connect services.
        </p>
        <Link
          href="/projects"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[12.5px] font-semibold text-white transition hover:bg-accent/90"
        >
          View my apps
          <ArrowRight className="size-3.5" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}
