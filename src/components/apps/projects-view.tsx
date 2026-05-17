"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Plus, Search, Star, LayoutGrid, List,
  Sparkles, Loader2, ArrowUpRight, Upload, AppWindow,
} from "lucide-react";
import { Button } from "@/components/ui/button";  
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { variants } from "@/lib/motion";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useTimedLoading } from "@/lib/hooks/use-timed-loading";
import type { Project } from "@/lib/supabase/types";
import { ZipImportWizard } from "@/components/apps/zip-import-wizard";

const STATUS_CONFIG: Record<Project["status"], { label: string; dot: string; text: string }> = {
  live: { label: "Live", dot: "bg-positive animate-pulse", text: "text-positive" },
  staging: { label: "Staging", dot: "bg-amber-400", text: "text-amber-400" },
  draft: { label: "Draft", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
  building: { label: "Building", dot: "bg-accent animate-pulse", text: "text-accent" },
  error: { label: "Error", dot: "bg-destructive", text: "text-destructive" },
};

function ProjectCard({ project }: { project: Project }) {
  const cfg = STATUS_CONFIG[project.status];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative flex flex-col overflow-hidden rounded-[var(--radius-xl)] bg-surface ring-1 ring-border transition hover:ring-accent/30 hover:shadow-lg"
    >
      <Link
        href={`/projects/${project.id}`}
        aria-label={`Open ${project.name}`}
        className="absolute inset-0 z-0"
      />
      {/* Gradient header */}
      <div className={cn("pointer-events-none relative h-24 w-full bg-gradient-to-br", project.gradient, "opacity-80")} />

      <div className="pointer-events-none relative z-[1] flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold tracking-tight text-foreground">
              {project.name}
            </p>
            {project.description && (
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{project.description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-background px-2 py-0.5">
            <span className={cn("size-1.5 rounded-full", cfg.dot)} />
            <span className={cn("text-[10px] font-medium", cfg.text)}>{cfg.label}</span>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>{project.framework}</span>
            <span>{new Date(project.updated_at).toLocaleDateString()}</span>
          </div>
          <div className="pointer-events-auto flex gap-1 opacity-0 transition group-hover:opacity-100">
            {project.preview_url && (
              <a
                href={project.preview_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background hover:text-foreground"
              >
                <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
              </a>
            )}
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition hover:bg-background hover:text-amber-400"
            >
              <Star className={cn("size-3.5", project.is_favorite && "fill-amber-400 text-amber-400")} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function ProjectsView() {
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useAuthStore();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading, setLoading] = React.useState(true);
  const isLoading = useTimedLoading(loading, 1000);
  const [search, setSearch] = React.useState("");
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const [showImport, setShowImport] = React.useState(false);

  React.useEffect(() => {
    if (!profile?.id) {
      // Don't spin forever — if profile hasn't loaded after mount, clear loading
      const t = setTimeout(() => setLoading(false), 2000);
      return () => clearTimeout(t);
    }
    setLoading(true);
    supabase
      .from("projects")
      .select("*")
      .eq("owner_id", profile.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        setProjects((data as Project[]) ?? []);
        setLoading(false);
      });
  }, [profile?.id]);

  const filtered = projects.filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <motion.div
      variants={variants.staggerContainer}
      initial="hidden"
      animate="show"
      className="space-y-5 pb-10"
    >
      {/* Header */}
      <motion.div variants={variants.fadeUp} className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="h-9 w-full rounded-[var(--radius-lg)] bg-surface pl-9 pr-3 text-[13px] text-foreground ring-1 ring-border outline-none focus:ring-accent/40"
          />
        </div>

        <div className="flex rounded-lg ring-1 ring-border">
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "flex items-center justify-center p-2 transition first:rounded-l-lg last:rounded-r-lg",
                view === v ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "grid" ? <LayoutGrid className="size-4" strokeWidth={1.75} /> : <List className="size-4" strokeWidth={1.75} />}
            </button>
          ))}
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() => setShowImport(true)}
        >
          <Upload className="size-3.5" strokeWidth={1.75} />
          Import ZIP
        </Button>
        <Button variant="accent" size="sm" className="gap-1.5" onClick={() => router.push("/")}>
          <Plus className="size-3.5" strokeWidth={2} />
          New project
        </Button>
      </motion.div>

      {/* ZIP import wizard */}
      {showImport && (
        <ZipImportWizard
          onClose={() => setShowImport(false)}
          onComplete={(name) => {
            setShowImport(false);
            // In production: navigate to the newly created project workspace
            console.info("ZIP import complete:", name);
          }}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <div className="relative flex size-12 items-center justify-center">
              <div className="absolute size-12 animate-ping rounded-full bg-accent/20" />
              <div className="relative size-6 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            </div>
            <p className="text-[12.5px] text-muted-foreground">Loading your apps…</p>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        !search ? (
          <motion.div
            variants={variants.fadeUp}
            className="flex flex-col items-center gap-8 py-16 text-center"
          >
            <div className="relative">
              <div className="absolute -inset-8 animate-pulse rounded-full bg-accent/5 blur-2xl" />
              <div className="relative flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-violet-500/20 ring-1 ring-accent/20">
                <AppWindow className="size-9 text-accent" strokeWidth={1.25} />
              </div>
            </div>
            <div className="max-w-md space-y-2">
              <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-foreground">
                Build your first app
              </h2>
              <p className="text-[14px] leading-relaxed text-muted-foreground">
                Describe what you want in plain English. DreamOS86 generates routes, UI, database schema, auth, and APIs.
              </p>
            </div>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/"
                className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-accent/90"
              >
                Start building
              </Link>
              <Link
                href="/templates"
                className="flex items-center gap-2 rounded-xl bg-surface px-5 py-2.5 text-[13.5px] font-semibold text-foreground ring-1 ring-border transition hover:ring-accent/30"
              >
                Browse templates
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "SaaS dashboard", prompt: "Build a SaaS dashboard with analytics, team management, billing, and role-based access control.", desc: "Auth, billing, analytics" },
                { label: "Mobile app", prompt: "Build a mobile app with React Native, authentication, push notifications, and a REST API backend.", desc: "React Native + API" },
                { label: "AI tool", prompt: "Build an AI-powered tool with LLM integration, streaming responses, prompt management, and user history.", desc: "LLM-powered workflow" },
              ].map((idea) => (
                <button
                  key={idea.label}
                  type="button"
                  onClick={() => router.push(`/create?prompt=${encodeURIComponent(idea.prompt)}&mode=build`)}
                  className="rounded-xl bg-surface p-4 text-left ring-1 ring-border transition hover:ring-accent/30 hover:bg-surface/80"
                >
                  <p className="text-[13px] font-semibold text-foreground">{idea.label}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">{idea.desc}</p>
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <EmptyState
            icon={<Search className="size-8 text-muted-foreground/30" strokeWidth={1.25} />}
            title="No matching projects"
            description="Try a different search term or clear the filter."
          />
        )
      ) : (
        <div className={cn(
          view === "grid"
            ? "grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : "space-y-2",
        )}>
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
