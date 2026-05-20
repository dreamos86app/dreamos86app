"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, ExternalLink, Layers, AlertCircle, Package, Cloud, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/supabase/types";
import { useAuthStore } from "@/lib/stores/auth-store";
import { toast } from "@/lib/toast";
import { createClient } from "@/lib/supabase/client";

type ProjectRow = Pick<
  Tables<"projects">,
  "id" | "name" | "status" | "preview_url" | "custom_domain" | "framework" | "gradient" | "metadata" | "is_public"
>;

export function AppDashboardPanel({
  project,
  isBusy,
}: {
  project: ProjectRow | null;
  isBusy: boolean;
}) {
  const { profile } = useAuthStore();
  const supabase = React.useMemo(() => createClient(), []);
  const planId = profile?.plan_id ?? "free";
  const [wrapBusy, setWrapBusy] = React.useState<string | null>(null);
  const [filePaths, setFilePaths] = React.useState<string[]>([]);
  const [filesLoading, setFilesLoading] = React.useState(false);

  React.useEffect(() => {
    if (!project?.id) {
      setFilePaths([]);
      return;
    }
    let cancelled = false;
    setFilesLoading(true);
    void supabase
      .from("app_files")
      .select("path")
      .eq("project_id", project.id)
      .order("path")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) setFilePaths(data.map((r) => r.path));
        setFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.id, isBusy, supabase]);

  async function runWrapJob(kind: "web_zip" | "web_deploy" | "android_apk" | "android_aab") {
    if (!project?.id) return;
    setWrapBusy(kind);
    try {
      const r = await fetch(`/api/projects/${project.id}/wrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const j = (await r.json()) as {
        error?: string;
        locked?: boolean;
        downloadUrl?: string;
        job?: { status?: string; error_message?: string | null };
      };
      if (!r.ok) {
        toast.error(j.error ?? "Request failed");
        return;
      }
      if (kind === "web_zip" && j.downloadUrl) {
        window.open(j.downloadUrl, "_blank", "noopener,noreferrer");
        toast.success("Web export ZIP is ready.");
      } else if (j.job?.status === "requires_builder_config") {
        toast.info(j.job.error_message ?? "Recorded — remote builder not configured.");
      } else {
        toast.success("Job updated.");
      }
    } finally {
      setWrapBusy(null);
    }
  }

  const androidLocked = !["pro", "business", "enterprise"].includes(planId.toLowerCase());
  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
          <Layers className="size-6 text-accent" strokeWidth={1.5} />
        </div>
        <p className="text-[14px] font-semibold text-foreground">No saved app yet</p>
        <p className="max-w-xs text-[12.5px] leading-relaxed text-muted-foreground">
          Open this page with a <span className="font-medium text-foreground">projectId</span> in the URL, or save your
          first app to Supabase — then the dashboard shows live status, preview link, and domain.
        </p>
        <Link
          href="/projects"
          className="mt-1 text-[12px] font-semibold text-accent underline-offset-2 hover:underline"
        >
          View your apps
        </Link>
      </div>
    );
  }

  const meta = project.metadata && typeof project.metadata === "object" && !Array.isArray(project.metadata)
    ? (project.metadata as Record<string, unknown>)
    : {};
  const publish = meta.publish_ui && typeof meta.publish_ui === "object"
    ? (meta.publish_ui as Record<string, unknown>)
    : null;
  const builder =
    meta.builder && typeof meta.builder === "object" && !Array.isArray(meta.builder)
      ? (meta.builder as Record<string, unknown>)
      : null;
  const builderPages = Array.isArray(builder?.pages) ? (builder.pages as string[]) : [];
  const builderEntities = Array.isArray(builder?.entities) ? (builder.entities as string[]) : [];
  const pageFiles = filePaths.filter(
    (p) => /\/(page|pages)\//i.test(p) || /page\.(tsx|jsx|html)$/i.test(p),
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl text-[16px] font-bold text-white shadow-inner",
            project.gradient?.startsWith("from-") ? `bg-gradient-to-br ${project.gradient}` : "bg-gradient-to-br from-accent to-violet-600",
          )}
        >
          {project.name?.charAt(0)?.toUpperCase() ?? "A"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-foreground">{project.name}</p>
          <p className="text-[11px] capitalize text-muted-foreground">
            Status: <span className="font-medium text-foreground">{project.status}</span>
            {isBusy && (
              <span className="ml-2 inline-flex items-center gap-1 text-accent">
                <Loader2 className="size-3 animate-spin" strokeWidth={1.75} />
                Updating…
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-surface ring-1 ring-border">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Stack</p>
        </div>
        <div className="divide-y divide-border px-4 py-1">
          <Row label="Framework" value={project.framework || "—"} />
          <Row label="Visibility" value={project.is_public ? "Public listing" : "Private"} />
        </div>
      </div>

      <div className="rounded-xl bg-surface ring-1 ring-border">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preview & domain</p>
        </div>
        <div className="space-y-2 px-4 py-3">
          {project.preview_url ? (
            <a
              href={project.preview_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 break-all text-[12.5px] text-accent hover:underline"
            >
              {project.preview_url}
              <ExternalLink className="size-3.5 shrink-0" strokeWidth={2} />
            </a>
          ) : (
            <p className="text-[12px] text-muted-foreground">No preview URL on this project row yet.</p>
          )}
          {project.custom_domain ? (
            <p className="text-[12px] text-foreground">
              Custom domain: <span className="font-medium">{project.custom_domain}</span>
            </p>
          ) : (
            <p className="text-[12px] text-muted-foreground">No custom domain set in the database.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-surface ring-1 ring-border">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Wrap & export</p>
        </div>
        <div className="space-y-2 px-4 py-3">
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            Export the saved source from Supabase as a ZIP, queue placeholder deploy jobs, or start Android packaging (Pro+).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!!wrapBusy}
              onClick={() => void runWrapJob("web_zip")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-50"
            >
              {wrapBusy === "web_zip" ? <Loader2 className="size-3 animate-spin" /> : <Package className="size-3.5" strokeWidth={1.75} />}
              Web ZIP
            </button>
            <button
              type="button"
              disabled={!!wrapBusy}
              onClick={() => void runWrapJob("web_deploy")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-[11px] font-semibold text-foreground ring-1 ring-border transition hover:bg-surface-raised disabled:opacity-50"
            >
              {wrapBusy === "web_deploy" ? <Loader2 className="size-3 animate-spin" /> : <Cloud className="size-3.5" strokeWidth={1.75} />}
              Web deploy (honest placeholder)
            </button>
            <button
              type="button"
              disabled={!!wrapBusy || androidLocked}
              title={androidLocked ? "Pro or higher required" : undefined}
              onClick={() => void runWrapJob("android_apk")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-[11px] font-semibold text-foreground ring-1 ring-border transition hover:bg-surface-raised disabled:opacity-40"
            >
              {wrapBusy === "android_apk" ? <Loader2 className="size-3 animate-spin" /> : <Smartphone className="size-3.5" strokeWidth={1.75} />}
              Android APK {androidLocked ? "· locked" : ""}
            </button>
            <button
              type="button"
              disabled={!!wrapBusy || androidLocked}
              onClick={() => void runWrapJob("android_aab")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-[11px] font-semibold text-foreground ring-1 ring-border transition hover:bg-surface-raised disabled:opacity-40"
            >
              {wrapBusy === "android_aab" ? <Loader2 className="size-3 animate-spin" /> : <Smartphone className="size-3.5" strokeWidth={1.75} />}
              Android AAB {androidLocked ? "· locked" : ""}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-amber-500/8 ring-1 ring-amber-500/25 px-4 py-3">
        <div className="flex gap-2">
          <AlertCircle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
          <div>
            <p className="text-[12px] font-semibold text-foreground">Deploy & analytics</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              Usage charts, collaborators, secrets rotation, and server logs require additional tables and workers. Nothing
              below is placeholder data — we only render fields that exist on your Supabase project.
            </p>
          </div>
        </div>
      </div>

      {publish && Object.keys(publish).length > 0 && (
        <div className="rounded-xl bg-surface ring-1 ring-border">
          <div className="border-b border-border px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Publish draft (saved)</p>
          </div>
          <pre className="max-h-40 overflow-auto p-3 text-[10px] text-muted-foreground">
            {JSON.stringify(publish, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="truncate text-[12px] font-medium text-foreground">{value}</span>
    </div>
  );
}
