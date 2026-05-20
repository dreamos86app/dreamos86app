"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { IntegrationIconWell } from "@/components/brand/integration-icons";
import {
  ArrowRight,
  Clock,
  Layers,
  MessageCircle,
  Pencil,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

function WorkspaceModesVisual() {
  const modes = [
    { label: "Discuss", icon: MessageCircle, active: false },
    { label: "Edit", icon: Pencil, active: false },
    { label: "Build", icon: Zap, active: true },
  ];

  return (
    <motion.div
      className="flex h-full min-h-[148px] items-end justify-center gap-3 p-5"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true }}
      variants={{ show: { transition: { staggerChildren: 0.1 } } }}
    >
      {modes.map((m) => {
        const Icon = m.icon;
        return (
          <motion.div
            key={m.label}
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            className="flex flex-col items-center gap-2"
          >
            <motion.div
              className={cn(
                "flex size-[4.5rem] items-center justify-center rounded-2xl ring-1 transition",
                m.active
                  ? "bg-accent text-white shadow-[0_12px_32px_-12px_rgba(37,99,235,0.55)] ring-accent/40"
                  : "bg-background/90 text-muted-foreground ring-border/70",
              )}
              whileHover={{ y: -2 }}
            >
              <Icon className="size-6" strokeWidth={m.active ? 2 : 1.65} />
            </motion.div>
            <span
              className={cn(
                "text-[11px] font-semibold",
                m.active ? "text-accent" : "text-muted-foreground",
              )}
            >
              {m.label}
            </span>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function IntegrationsVisual() {
  const items = [
    { label: "Data", slug: "supabase", wrap: "bg-[#3ECF8E]/15" },
    { label: "Payments", slug: "stripe", wrap: "bg-[#635BFF]/12" },
    { label: "Publish", slug: null as string | null, wrap: "bg-accent/10" },
  ];

  return (
    <motion.div
      className="grid h-full min-h-[148px] grid-cols-3 items-center gap-3 p-5"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true }}
      variants={{ show: { transition: { staggerChildren: 0.08 } } }}
    >
      {items.map((item) => (
        <motion.div
          key={item.label}
          variants={{ hidden: { opacity: 0, scale: 0.92 }, show: { opacity: 1, scale: 1 } }}
          className="flex flex-col items-center gap-2 rounded-xl bg-background/80 py-4 ring-1 ring-border/60"
        >
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-xl ring-1 ring-border/50",
              item.wrap,
            )}
          >
            {item.slug ? (
              <IntegrationIconWell provider={item.slug} size="sm" title={item.label} />
            ) : (
              <Image
                src="/dreamos86-platform-logo.png"
                alt=""
                width={28}
                height={28}
                className="size-7 object-contain"
              />
            )}
          </div>
          <span className="text-[10.5px] font-semibold text-muted-foreground">{item.label}</span>
        </motion.div>
      ))}
    </motion.div>
  );
}

const FEATURES = [
  {
    title: "Build apps in minutes",
    body: "Describe what you want once. DreamOS86 architects routes, UI, data, and deploy surfaces — not a static mockup.",
    icon: Clock,
    visual: (
      <motion.div
        className="relative min-h-[148px] overflow-hidden rounded-xl bg-gradient-to-br from-accent/15 via-sky-400/8 to-transparent p-4"
        initial={{ opacity: 0.6 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
        <motion.div
          className="absolute bottom-0 left-1/2 h-20 w-[110%] -translate-x-1/2 rounded-[100%] bg-accent/20 blur-2xl"
          animate={{ opacity: [0.35, 0.55, 0.35] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="relative space-y-2"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={{ show: { transition: { staggerChildren: 0.08 } } }}
        >
          {["Auth + profiles", "Live preview", "Publish URL"].map((line) => (
            <motion.div
              key={line}
              variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
              className="rounded-lg bg-background/85 px-3 py-2 text-[11px] font-medium text-foreground shadow-sm ring-1 ring-border/60"
            >
              {line}
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    ),
    tint: "from-accent/10 to-sky-500/8",
  },
  {
    title: "One workspace, three modes",
    body: "Discuss to plan, Edit for surgical changes, Build for full generation — same thread, same project memory.",
    icon: Layers,
    visual: <WorkspaceModesVisual />,
    tint: "from-violet-500/10 to-indigo-500/8",
  },
  {
    title: "Production-ready by default",
    body: "Supabase, Stripe, and DreamOS86 publish — wire secrets per app, not per prompt.",
    icon: Shield,
    visual: <IntegrationsVisual />,
    tint: "from-emerald-500/8 to-cyan-500/8",
  },
];

export function WhyDreamOsHeadline() {
  return (
    <section className="w-full text-center">
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent/80"
      >
        Why DreamOS86
      </motion.p>
      <motion.h2
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.05 }}
        className="mt-2 text-balance text-[22px] font-semibold tracking-[-0.03em] text-foreground sm:text-[26px]"
      >
        Now you can ship software within minutes — not months
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.1 }}
        className="mx-auto mt-2 max-w-xl text-pretty text-[14px] leading-relaxed text-muted-foreground"
      >
        DreamOS86 is an AI-native OS for builders: one prompt, real code, hosted previews, and honest billing per token.
      </motion.p>
    </section>
  );
}

export function WhyDreamOsFeatures() {
  return (
    <section className="w-full">
      <motion.div
        className="grid gap-4 lg:grid-cols-3"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-40px" }}
        variants={{ show: { transition: { staggerChildren: 0.1 } } }}
      >
        {FEATURES.map((f) => (
          <motion.article
            key={f.title}
            variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
            whileHover={{ y: -4 }}
            className={cn(
              "overflow-hidden rounded-[1.35rem] border border-border/70 bg-gradient-to-br shadow-sm ring-1 ring-border/40",
              f.tint,
            )}
          >
            <motion.div className="border-b border-border/50 bg-background/40">{f.visual}</motion.div>
            <motion.div
              className="p-5"
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <f.icon className="size-5 text-accent" strokeWidth={1.65} />
              <h3 className="mt-2 text-[15px] font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{f.body}</p>
            </motion.div>
          </motion.article>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="mt-8 flex flex-wrap items-center justify-center gap-3"
      >
        <Link
          href="/create"
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_28px_-10px_rgba(37,99,235,0.55)] transition hover:bg-accent/90"
        >
          <Sparkles className="size-4" strokeWidth={1.75} />
          Start building
        </Link>
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 rounded-xl bg-surface px-5 py-2.5 text-[13px] font-semibold text-foreground ring-1 ring-border transition hover:ring-accent/30"
        >
          Try AI Chat
          <ArrowRight className="size-3.5" strokeWidth={2} />
        </Link>
      </motion.div>
    </section>
  );
}

export function WhyDreamOsSection() {
  return (
    <>
      <WhyDreamOsHeadline />
      <div className="mt-8">
        <WhyDreamOsFeatures />
      </div>
    </>
  );
}
