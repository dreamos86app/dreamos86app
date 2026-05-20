"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Loader2,
  ExternalLink,
  Layers,
  LayoutGrid,
  Database,
  Zap,
  Plug,
  Globe,
  Shield,
  ScrollText,
  Settings,
  KeyRound,
  Rocket,
  Monitor,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileCode2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/client";
import { ProjectIntegrationsPanel } from "@/components/integrations/project-integrations-panel";

type ProjectRow = Pick<
  Tables<"projects">,
  | "id"
  | "name"
  | "status"
  | "preview_url"
  | "custom_domain"
  | "framework"
  | "gradient"
  | "metadata"
  | "is_public"
> & {
  icon_url?: string | null;
  app_name?: string | null;
  short_description?: string | null;
  category?: string | null;
  icon_svg?: string | null;
  build_status?: string | null;
  published_subdomain?: string | null;
};

type DashSection =
  | "overview"
  | "screens"
  | "data"
  | "actions"
  | "integrations"
  | "domains"
  | "security"
  | "logs"
  | "settings"
  | "secrets";

const SECTIONS: Array<{ id: DashSection; label: string; icon: React.ElementType }> = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "screens", label: "Screens", icon: Monitor },
  { id: "data", label: "Data", icon: Database },
  { id: "actions", label: "Actions", icon: Zap },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "domains", label: "Domains", icon: Globe },
  { id: "security", label: "Security", icon: Shield },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "secrets", label: "Secrets", icon: KeyRound },
];

export function AppDashboardPanel({
  project,
  isBusy,
  refreshKey = 0,
  activeSection,
  onSectionChange,
}: {
  project: ProjectRow | null;
  isBusy: boolean;
  refreshKey?: number;
  activeSection?: DashSection;
  onSectionChange?: (section: DashSection) => void;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [internalSection, setInternalSection] = React.useState<DashSection>("overview");
  const section = activeSection ?? internalSection;
  const setSection = (s: DashSection) => {
    if (onSectionChange) onSectionChange(s);
    else setInternalSection(s);
  };

  React.useEffect(() => {
    if (activeSection) setInternalSection(activeSection);
  }, [activeSection]);
  const [filePaths, setFilePaths] = React.useState<string[]>([]);
  const [filesLoading, setFilesLoading] = React.useState(false);
  const [buildStatus, setBuildStatus] = React.useState<string | null>(null);
  const [buildAt, setBuildAt] = React.useState<string | null>(null);
  const [creditsCharged, setCreditsCharged] = React.useState<number | null>(null);
  const [fileCount, setFileCount] = React.useState(0);
  const [publishReady, setPublishReady] = React.useState(false);
  const [publishBlockers, setPublishBlockers] = React.useState<string[]>([]);
  const [previewErrors, setPreviewErrors] = React.useState<
    Array<{ message: string; file?: string; line?: number }>
  >([]);
  const [secretKeys, setSecretKeys] = React.useState<Array<{ name: string; updated_at: string }>>(
    [],
  );
  const [secretsLoading, setSecretsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!project?.id) {
      setFilePaths([]);
      setBuildStatus(null);
      setPublishReady(false);
      return;
    }
    let cancelled = false;
    setFilesLoading(true);

    void Promise.all([
      supabase.from("app_files").select("path").eq("project_id", project.id).order("path"),
      supabase
        .from("build_jobs")
        .select("status, created_at, error_message, credits_charged, completed_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("app_files")
        .select("id", { count: "exact", head: true })
        .eq("project_id", project.id),
      fetch(`/api/projects/${project.id}/publish/readiness`, { credentials: "include" }).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`/api/projects/${project.id}/preview-errors`, { credentials: "include" }).then((r) =>
        r.ok ? r.json() : null,
      ),
    ]).then(([filesRes, buildRes, fileCountRes, readyJson, errJson]) => {
      if (cancelled) return;
      if (!filesRes.error && filesRes.data) {
        setFilePaths(filesRes.data.map((r) => r.path));
      }
      setFileCount(fileCountRes.count ?? filesRes.data?.length ?? 0);
      if (!buildRes.error && buildRes.data) {
        setBuildStatus(buildRes.data.status);
        setBuildAt(
          (buildRes.data as { completed_at?: string }).completed_at ?? buildRes.data.created_at,
        );
        setCreditsCharged(
          typeof (buildRes.data as { credits_charged?: number }).credits_charged === "number"
            ? (buildRes.data as { credits_charged: number }).credits_charged
            : null,
        );
      }
      const ready = readyJson as {
        canPublishWeb?: boolean;
        blockers?: string[];
      } | null;
      setPublishReady(Boolean(ready?.canPublishWeb));
      setPublishBlockers(ready?.blockers ?? []);
      const errs = errJson as { errors?: Array<{ message: string; file?: string; line?: number }> };
      setPreviewErrors(errs?.errors ?? []);
      setFilesLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [project?.id, supabase, refreshKey]);

  React.useEffect(() => {
    if (!project?.id || section !== "secrets") return;
    let cancelled = false;
    setSecretsLoading(true);
    void fetch(`/api/projects/${project.id}/secrets`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { keys?: Array<{ name: string; updated_at: string }> } | null) => {
        if (!cancelled) setSecretKeys(json?.keys ?? []);
      })
      .finally(() => {
        if (!cancelled) setSecretsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.id, section, refreshKey]);

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
          <Layers className="size-6 text-accent" strokeWidth={1.5} />
        </div>
        <p className="text-[14px] font-semibold text-foreground">No saved app yet</p>
        <p className="max-w-xs text-[12.5px] leading-relaxed text-muted-foreground">
          Run a build to generate your app — the dashboard will show live status, screens, data model, and publish readiness.
        </p>
        <Link href="/projects" className="text-[12px] font-semibold text-accent hover:underline">
          View your apps
        </Link>
      </div>
    );
  }

  const meta =
    project.metadata && typeof project.metadata === "object" && !Array.isArray(project.metadata)
      ? (project.metadata as Record<string, unknown>)
      : {};
  const builder =
    meta.builder && typeof meta.builder === "object" && !Array.isArray(meta.builder)
      ? (meta.builder as Record<string, unknown>)
      : null;
  const pages = Array.isArray(builder?.pages)
    ? (builder.pages as Array<string | { name?: string; route?: string }>)
    : [];
  const entities = Array.isArray(builder?.entities)
    ? (builder.entities as Array<string | { name?: string }>)
    : [];
  const actions = Array.isArray(builder?.actions)
    ? (builder.actions as Array<string | { name?: string }>)
    : [];

  const pageRoutes = filePaths.filter(
    (p) => /\/(page|pages)\//i.test(p) || /page\.(tsx|jsx|html)$/i.test(p),
  );
  const buildOk =
    buildStatus === "completed" || buildStatus === "succeeded" || project.status === "live";
  const displayName =
    (project as ProjectRow).app_name?.trim() || project.name || "App";
  const displayDesc =
    (project as ProjectRow).short_description?.trim() ||
    (typeof meta.short_description === "string" ? meta.short_description : null);
  const iconSrc =
    (project as ProjectRow).icon_svg?.startsWith("data:")
      ? (project as ProjectRow).icon_svg!
      : project.icon_url ?? `/api/projects/${project.id}/icon`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-gradient-to-b from-[#f6f9ff] to-background">
      <div className="shrink-0 border-b border-border/60 bg-background/80 px-3 py-2 backdrop-blur-sm">
        <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition",
                section === s.id
                  ? "bg-accent text-white shadow-sm"
                  : "text-muted-foreground hover:bg-surface hover:text-foreground",
              )}
            >
              <s.icon className="size-3" strokeWidth={1.75} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {section === "overview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-white/90 px-4 py-3 shadow-sm ring-1 ring-accent/15">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-border">
                <Image src={iconSrc} alt="" width={48} height={48} className="size-full object-cover" unoptimized />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-foreground">{displayName}</p>
                {displayDesc && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{displayDesc}</p>
                )}
                <p className="text-[11px] text-muted-foreground capitalize">
                  {(project as ProjectRow).category || project.framework || "app"} ·{" "}
                  {(project as ProjectRow).build_status || project.status}
                  {isBusy && (
                    <span className="ml-2 inline-flex items-center gap-1 text-accent">
                      <Loader2 className="size-3 animate-spin" />
                      Building…
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="Build"
                value={buildStatus ?? "—"}
                ok={buildOk}
                icon={buildOk ? CheckCircle2 : Clock}
              />
              <StatCard
                label="Files"
                value={filesLoading ? "…" : String(fileCount || filePaths.length)}
                icon={FileCode2}
              />
              <StatCard
                label="Credits used"
                value={creditsCharged != null && creditsCharged > 0 ? String(creditsCharged) : "—"}
                icon={Zap}
              />
              <StatCard
                label="Publish"
                value={publishReady ? "Ready" : "Blocked"}
                ok={publishReady}
                icon={publishReady ? Rocket : AlertCircle}
              />
              <StatCard
                label="Preview"
                value={previewErrors.length ? `${previewErrors.length} errors` : project.preview_url ? "Live" : "Pending"}
                ok={previewErrors.length === 0 && Boolean(project.preview_url)}
                icon={Monitor}
              />
            </div>

            {publishBlockers.length > 0 && !publishReady && (
              <div className="rounded-xl bg-amber-500/8 px-3 py-2.5 ring-1 ring-amber-500/20">
                <p className="text-[11px] font-semibold text-foreground">Publish blockers</p>
                <ul className="mt-1 list-inside list-disc text-[11px] text-muted-foreground">
                  {publishBlockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            {buildAt && (
              <p className="text-[10.5px] text-muted-foreground">
                Last build: {new Date(buildAt).toLocaleString()}
              </p>
            )}

            {project.preview_url && (
              <a
                href={project.preview_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl bg-accent/10 px-3 py-2 text-[12px] font-medium text-accent ring-1 ring-accent/20 hover:bg-accent/15"
              >
                Open preview
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        )}

        {section === "screens" && (
          <SectionCard title="Screens & routes">
            {pages.length > 0 ? (
              <ul className="space-y-1.5">
                {pages.map((p, i) => (
                  <li key={i} className="rounded-lg bg-background/80 px-2.5 py-1.5 text-[12px] ring-1 ring-border/60">
                    {typeof p === "string" ? p : `${p.name ?? "Screen"}${p.route ? ` · ${p.route}` : ""}`}
                  </li>
                ))}
              </ul>
            ) : pageRoutes.length > 0 ? (
              <ul className="space-y-1 font-mono text-[11px] text-foreground">
                {pageRoutes.slice(0, 24).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <EmptyHint text="No screens detected yet. Run a build to generate pages." />
            )}
          </SectionCard>
        )}

        {section === "data" && (
          <SectionCard title="Data model">
            {entities.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {entities.map((e, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent ring-1 ring-accent/20"
                  >
                    {typeof e === "string" ? e : (e.name ?? "Entity")}
                  </span>
                ))}
              </div>
            ) : (
              <EmptyHint text="Data model will appear after a successful build." />
            )}
          </SectionCard>
        )}

        {section === "actions" && (
          <SectionCard title="Actions & API">
            {actions.length > 0 ? (
              <ul className="space-y-1 text-[12px] text-foreground">
                {actions.map((a, i) => (
                  <li key={i}>{typeof a === "string" ? a : (a.name ?? "Action")}</li>
                ))}
              </ul>
            ) : (
              <EmptyHint text="Server actions and API routes are listed here after generation." />
            )}
          </SectionCard>
        )}

        {section === "integrations" && project.id && (
          <ProjectIntegrationsPanel projectId={project.id} />
        )}

        {section === "domains" && (
          <SectionCard title="Domains">
            {project.published_subdomain ? (
              <p className="text-[12px] text-foreground">
                Subdomain: <span className="font-medium">{project.published_subdomain}</span>
              </p>
            ) : (
              <EmptyHint text="Publish to web to allocate a live subdomain." />
            )}
            {project.custom_domain ? (
              <p className="mt-2 text-[12px]">
                Custom: <span className="font-medium">{project.custom_domain}</span>
              </p>
            ) : null}
          </SectionCard>
        )}

        {section === "security" && (
          <SectionCard title="Security">
            <EmptyHint text="RLS policies and auth checks are generated in your app source — review in the Code tab." />
          </SectionCard>
        )}

        {section === "logs" && (
          <SectionCard title="Preview errors & build log">
            {previewErrors.length > 0 ? (
              <ul className="space-y-2">
                {previewErrors.map((e, i) => (
                  <li key={i} className="rounded-lg bg-destructive/5 px-2.5 py-2 text-[11px] ring-1 ring-destructive/20">
                    <p className="font-medium text-destructive">{e.message}</p>
                    {e.file && (
                      <p className="mt-0.5 font-mono text-muted-foreground">
                        {e.file}
                        {e.line != null ? `:${e.line}` : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : buildStatus === "failed" ? (
              <EmptyHint text="Latest build failed — check the create stream for details." />
            ) : (
              <EmptyHint text="No preview errors recorded." />
            )}
          </SectionCard>
        )}

        {section === "settings" && (
          <SectionCard title="App settings">
            <dl className="space-y-2 text-[12px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Visibility</dt>
                <dd className="font-medium">{project.is_public ? "Public" : "Private"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Framework</dt>
                <dd className="font-medium">{project.framework || "—"}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Rename, slug, and icon regeneration are available from Create → Settings after your next build.
            </p>
          </SectionCard>
        )}

        {section === "secrets" && project.id && (
          <SectionCard title="Project secrets">
            {secretsLoading ? (
              <p className="text-[12px] text-muted-foreground">Loading…</p>
            ) : secretKeys.length > 0 ? (
              <ul className="space-y-2">
                {secretKeys.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-center justify-between gap-2 rounded-lg bg-background/80 px-2.5 py-2 ring-1 ring-border/60"
                  >
                    <span className="font-mono text-[11px] font-medium text-foreground">{s.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      ••••••••
                      {s.updated_at ? ` · ${new Date(s.updated_at).toLocaleDateString()}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyHint text="No secrets saved yet. Connect Supabase or GitHub from Integrations — keys are stored encrypted server-side." />
            )}
            <p className="mt-3 text-[10.5px] text-muted-foreground">
              Values are never shown after save. Add or rotate secrets from Integrations → Advanced.
            </p>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/90 ring-1 ring-border/80 shadow-sm">
      <div className="border-b border-border/60 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  ok,
  icon: Icon,
}: {
  label: string;
  value: string;
  ok?: boolean;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-xl bg-white/90 px-3 py-2.5 ring-1 ring-border/70">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className={cn("size-3.5", ok === true && "text-emerald-600", ok === false && "text-amber-600")} />
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 truncate text-[13px] font-semibold capitalize text-foreground">{value}</p>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-[12px] leading-relaxed text-muted-foreground">{text}</p>;
}
