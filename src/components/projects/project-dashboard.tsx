"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ExternalLink,
  Sparkles,
  Globe,
  GitBranch,
  Settings as SettingsIcon,
  Database,
  Brain,
  Activity,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  Save,
  ImageIcon,
  Upload,
  FileText,
  Video,
  HardDrive,
  X,
  BarChart3,
  KeyRound,
  Eye,
  EyeOff,
  Plus,
  Terminal,
  Zap,
  TrendingUp,
  Users,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  ArchitectureGraph,
  type GraphNode,
  type GraphEdge,
} from "@/components/projects/architecture-graph";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  status: "live" | "staging" | "draft" | "building" | "error";
  framework: string;
  preview_url: string | null;
  custom_domain: string | null;
  gradient: string;
  is_public: boolean;
  is_favorite: boolean;
  category: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface DeploymentRow {
  id: string;
  status: "queued" | "building" | "deployed" | "failed" | "cancelled";
  environment: "production" | "staging" | "preview";
  url: string | null;
  build_duration_ms: number | null;
  commit_message: string | null;
  error_message: string | null;
  created_at: string;
}

interface MemoryRow {
  category: string;
  key: string;
  value: unknown;
  importance: number;
  updated_at: string;
}

type Tab = "overview" | "architecture" | "deployments" | "analytics" | "environment" | "media" | "memory" | "settings" | "users" | "domains" | "security" | "logs" | "billing" | "integrations";

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "architecture", label: "Architecture", icon: GitBranch },
  { id: "deployments", label: "Deployments", icon: Globe },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "users", label: "Users", icon: Users },
  { id: "domains", label: "Domains", icon: Globe },
  { id: "security", label: "Security", icon: Server },
  { id: "environment", label: "Environment", icon: KeyRound },
  { id: "logs", label: "Logs", icon: Terminal },
  { id: "billing", label: "Billing", icon: Zap },
  { id: "integrations", label: "Integrations", icon: TrendingUp },
  { id: "media", label: "Media", icon: ImageIcon },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const STATUS_PILL: Record<ProjectRow["status"], { bg: string; text: string; label: string }> = {
  live: { bg: "bg-emerald-500/10", text: "text-emerald-600", label: "Live" },
  staging: { bg: "bg-blue-500/10", text: "text-blue-600", label: "Staging" },
  draft: { bg: "bg-muted", text: "text-muted-foreground", label: "Draft" },
  building: { bg: "bg-amber-500/10", text: "text-amber-600", label: "Building" },
  error: { bg: "bg-destructive/10", text: "text-destructive", label: "Error" },
};

const DEPLOY_STATUS_ICON: Record<DeploymentRow["status"], { icon: React.ElementType; color: string }> = {
  deployed: { icon: CheckCircle2, color: "text-emerald-500" },
  building: { icon: Loader2, color: "text-amber-500 animate-spin" },
  queued: { icon: Clock, color: "text-blue-500" },
  failed: { icon: AlertTriangle, color: "text-destructive" },
  cancelled: { icon: AlertTriangle, color: "text-muted-foreground" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildGraph(
  project: ProjectRow,
  deployments: DeploymentRow[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [
    { id: "app", kind: "app", label: project.name, sublabel: project.framework },
    { id: "db", kind: "database", label: "Postgres", sublabel: "Supabase" },
    { id: "auth", kind: "auth", label: "Auth", sublabel: "Supabase" },
  ];
  const edges: GraphEdge[] = [
    { from: "app", to: "db" },
    { from: "app", to: "auth" },
  ];

  if (project.preview_url || project.custom_domain) {
    nodes.push({
      id: "domain",
      kind: "domain",
      label: project.custom_domain ?? new URL(project.preview_url!).host,
      sublabel: project.custom_domain ? "Custom" : "Vercel",
    });
    edges.push({ from: "app", to: "domain" });
  }

  // Add up to 3 most recent deployments as orbital nodes (real entities).
  deployments
    .filter((d) => d.status === "deployed" || d.status === "building")
    .slice(0, 3)
    .forEach((d, i) => {
      nodes.push({
        id: `deploy-${d.id}`,
        kind: "deployment",
        label: `${d.environment} #${i + 1}`,
        sublabel: new Date(d.created_at).toLocaleDateString(),
      });
      edges.push({ from: "app", to: `deploy-${d.id}`, inferred: i > 0 });
    });

  return { nodes, edges };
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s - m * 60)}s`;
}

// ─── Tab content ─────────────────────────────────────────────────────────────

function OverviewTab({ project, deployments }: { project: ProjectRow; deployments: DeploymentRow[] }) {
  const lastDeploy = deployments.find((d) => d.status === "deployed");
  const live = !!lastDeploy?.url;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-2 space-y-3">
        <div className="rounded-[var(--radius-xl)] bg-background p-5 ring-1 ring-border">
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">Description</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            {project.description || (
              <span className="italic">No description yet — open the workspace to talk to your AI specialists about what this app should be.</span>
            )}
          </p>
        </div>

        <div className="rounded-[var(--radius-xl)] bg-background p-5 ring-1 ring-border">
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">Recent activity</h3>
          {deployments.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              No deployments yet. Use the Deployments tab to ship a preview build.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {deployments.slice(0, 4).map((d) => {
                const meta = DEPLOY_STATUS_ICON[d.status];
                const Icon = meta.icon;
                return (
                  <li key={d.id} className="flex items-center gap-3 text-[12.5px]">
                    <Icon className={cn("size-3.5", meta.color)} strokeWidth={2} />
                    <span className="font-medium text-foreground">{d.status}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{d.environment}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground/70">
                      {new Date(d.created_at).toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div
          className={cn(
            "relative overflow-hidden rounded-[var(--radius-xl)] bg-gradient-to-br p-5 ring-1 ring-border",
            project.gradient,
          )}
        >
          <div className="flex items-center justify-between">
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
              STATUS_PILL[project.status].bg,
              STATUS_PILL[project.status].text,
            )}>
              {STATUS_PILL[project.status].label}
            </span>
            {live && (
              <Link
                href={lastDeploy.url!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-full bg-background/70 px-2 py-1 text-[10.5px] font-semibold text-foreground transition hover:bg-background"
              >
                Open
                <ExternalLink className="size-3" strokeWidth={2.25} />
              </Link>
            )}
          </div>
          <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.03em] text-foreground">
            {project.name}
          </h2>
          <p className="text-[11.5px] text-muted-foreground">
            Created {new Date(project.created_at).toLocaleDateString()}
          </p>
        </div>

        <Link
          href={`/?project=${project.id}`}
          className="group flex items-center gap-3 rounded-[var(--radius-xl)] bg-background p-4 ring-1 ring-border transition hover:ring-accent/40"
        >
          <div className="flex size-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Sparkles className="size-4" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-foreground">Continue in workspace</p>
            <p className="text-[11px] text-muted-foreground">Discuss · edit · iterate with AI</p>
          </div>
          <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-foreground" strokeWidth={1.75} />
        </Link>
      </div>
    </div>
  );
}

function ArchitectureTab({ project, deployments }: { project: ProjectRow; deployments: DeploymentRow[] }) {
  const { nodes, edges } = React.useMemo(
    () => buildGraph(project, deployments),
    [project, deployments],
  );
  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-xl)] bg-background p-5 ring-1 ring-border">
        <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
          Live architecture
        </h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Every node is a real entity. Solid edges are wired connections; dashed edges are inferred.
        </p>
      </div>
      <ArchitectureGraph nodes={nodes} edges={edges} />
    </div>
  );
}

function DeploymentsTab({ deployments }: { deployments: DeploymentRow[] }) {
  if (deployments.length === 0) {
    return (
      <div className="rounded-[var(--radius-xl)] bg-background p-10 text-center ring-1 ring-border">
        <Globe className="mx-auto size-8 text-muted-foreground/50" strokeWidth={1.5} />
        <p className="mt-3 text-[13px] font-semibold text-foreground">No deployments yet</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Once you connect Vercel and ship, history will appear here.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-[var(--radius-xl)] bg-background ring-1 ring-border">
      <table className="w-full text-[12.5px]">
        <thead className="bg-surface/50 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Env</th>
            <th className="px-4 py-2 text-left">Duration</th>
            <th className="px-4 py-2 text-left">URL</th>
            <th className="px-4 py-2 text-left">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {deployments.map((d) => {
            const meta = DEPLOY_STATUS_ICON[d.status];
            const Icon = meta.icon;
            return (
              <tr key={d.id} className="hover:bg-surface/40">
                <td className="px-4 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon className={cn("size-3.5", meta.color)} strokeWidth={2} />
                    {d.status}
                  </span>
                </td>
                <td className="px-4 py-2 capitalize text-muted-foreground">{d.environment}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {formatDuration(d.build_duration_ms)}
                </td>
                <td className="px-4 py-2">
                  {d.url ? (
                    <Link
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      {new URL(d.url).host}
                      <ExternalLink className="size-3" strokeWidth={2} />
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {new Date(d.created_at).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Media tab ────────────────────────────────────────────────────────────────

interface MediaAsset {
  id: string;
  filename: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  asset_type: "image" | "icon" | "screenshot" | "video" | "document";
  created_at: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaTab({ projectId }: { projectId: string }) {
  const supabase = createClient();
  const [assets, setAssets] = React.useState<MediaAsset[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<MediaAsset | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    supabase
      .from("media_assets")
      .select("id, filename, public_url, mime_type, size_bytes, asset_type, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setAssets((data ?? []) as MediaAsset[]);
        setLoading(false);
      });
  }, [projectId]);

  async function handleUpload(files: File[]) {
    setUploading(true);
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("project_id", projectId);
      try {
        const res = await fetch("/api/media", { method: "POST", body: fd });
        if (res.ok) {
          const { asset } = await res.json() as { asset: MediaAsset };
          if (asset) setAssets((prev) => [asset, ...prev]);
        }
      } catch { /* best-effort */ }
    }
    setUploading(false);
  }

  async function handleDelete(asset: MediaAsset) {
    setDeleting(asset.id);
    try {
      await fetch("/api/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asset.id }),
      });
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    } catch { /* best-effort */ }
    setDeleting(null);
  }

  const images = assets.filter((a) => a.asset_type === "image" || a.asset_type === "screenshot" || a.asset_type === "icon");
  const documents = assets.filter((a) => a.asset_type === "document");
  const videos = assets.filter((a) => a.asset_type === "video");

  const totalBytes = assets.reduce((sum, a) => sum + a.size_bytes, 0);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with stats + upload */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ImageIcon className="size-3.5" strokeWidth={1.75} />
            {assets.length} file{assets.length !== 1 ? "s" : ""}
          </span>
          <span className="flex items-center gap-1.5">
            <HardDrive className="size-3.5" strokeWidth={1.75} />
            {formatBytes(totalBytes)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" strokeWidth={2} />
          )}
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          accept="image/*,video/*,application/pdf,text/plain"
          onChange={(e) => {
            if (e.target.files) handleUpload(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </div>

      {/* Drag-drop zone or empty state */}
      {assets.length === 0 ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            if (files.length) handleUpload(files);
          }}
          className="flex flex-col items-center rounded-[var(--radius-xl)] border-2 border-dashed border-border bg-surface py-14 text-center transition hover:border-accent/40 hover:bg-accent/5 cursor-pointer"
          onClick={() => fileRef.current?.click()}
        >
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20">
            <Upload className="size-6 text-accent" strokeWidth={1.5} />
          </div>
          <p className="mt-3 text-[13px] font-semibold text-foreground">
            Upload your first asset
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Drag and drop, or click to browse. Images, PDFs, videos supported.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Images grid */}
          {images.length > 0 && (
            <section>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Images · {images.length}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {images.map((a) => (
                  <div
                    key={a.id}
                    className="group relative overflow-hidden rounded-xl bg-surface ring-1 ring-border"
                  >
                    <button
                      type="button"
                      className="aspect-square w-full overflow-hidden"
                      onClick={() => setPreview(a)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.public_url}
                        alt={a.filename}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    </button>
                    <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                      <span className="min-w-0 truncate text-[10.5px] text-muted-foreground">
                        {a.filename}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDelete(a)}
                        disabled={deleting === a.id}
                        className="shrink-0 rounded p-0.5 text-muted-foreground/50 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        {deleting === a.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Trash2 className="size-3" strokeWidth={1.75} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Documents & videos list */}
          {(documents.length > 0 || videos.length > 0) && (
            <section>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Files · {documents.length + videos.length}
              </p>
              <div className="overflow-hidden rounded-[var(--radius-xl)] bg-background ring-1 ring-border divide-y divide-border">
                {[...documents, ...videos].map((a) => {
                  const Icon = a.asset_type === "video" ? Video : FileText;
                  return (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface ring-1 ring-border">
                        <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-foreground">
                          {a.filename}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatBytes(a.size_bytes)} ·{" "}
                          {new Date(a.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <a
                        href={a.public_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-medium text-accent transition hover:underline"
                      >
                        Open
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDelete(a)}
                        disabled={deleting === a.id}
                        className="ml-1 rounded p-1 text-muted-foreground/50 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        {deleting === a.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Trash2 className="size-3" strokeWidth={1.75} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Image preview modal */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setPreview(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-border"
            >
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur transition hover:bg-background"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.public_url}
                alt={preview.filename}
                className="max-h-[80vh] max-w-[85vw] object-contain"
              />
              <div className="border-t border-border px-4 py-2 text-[11.5px] text-muted-foreground">
                {preview.filename} · {formatBytes(preview.size_bytes)}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Users tab ───────────────────────────────────────────────────────────────

function UsersTab({ project }: { project: ProjectRow }) {
  const [inviteEmail, setInviteEmail] = React.useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[13.5px] font-semibold text-foreground">App users</h3>
          <p className="text-[12px] text-muted-foreground">People with access to this application</p>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-accent/90"
        >
          <Plus className="size-3.5" strokeWidth={2} />
          Invite
        </button>
      </div>

      {project.is_public ? (
        <div className="rounded-[var(--radius-xl)] bg-background p-5 ring-1 ring-border">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <Users className="size-5 text-emerald-600" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">Public application</p>
              <p className="text-[12px] text-muted-foreground">Anyone can access this app. Enable authentication to track users.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[var(--radius-xl)] bg-background p-8 text-center ring-1 ring-border">
          <div className="flex justify-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
              <Users className="size-6 text-accent/70" strokeWidth={1.5} />
            </div>
          </div>
          <h3 className="mt-4 text-[14px] font-semibold text-foreground">No users yet</h3>
          <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
            Once your app has authentication configured, users who sign up will appear here.
          </p>
          <div className="mt-4 flex items-center gap-2 mx-auto w-fit rounded-xl border border-border bg-surface px-3 py-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Invite collaborator by email…"
              className="w-52 bg-transparent text-[12.5px] focus:outline-none text-foreground placeholder:text-muted-foreground/50"
            />
            <button
              type="button"
              disabled={!inviteEmail.includes("@")}
              className="rounded-lg bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-white transition disabled:opacity-40 hover:bg-accent/90"
            >
              Invite
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Domains tab ─────────────────────────────────────────────────────────────

function DomainsTab({ project }: { project: ProjectRow }) {
  const [domainInput, setDomainInput] = React.useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[13.5px] font-semibold text-foreground">Custom domains</h3>
          <p className="text-[12px] text-muted-foreground">Connect your own domain to this app</p>
        </div>
      </div>

      {project.custom_domain ? (
        <div className="rounded-[var(--radius-xl)] bg-background p-4 ring-1 ring-border">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <Globe className="size-4.5 text-emerald-600" strokeWidth={1.75} />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-foreground">{project.custom_domain}</p>
              <p className="text-[11.5px] text-emerald-600">Active · SSL verified</p>
            </div>
            <a href={`https://${project.custom_domain}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[12px] text-muted-foreground transition hover:text-foreground">
              <ExternalLink className="size-3.5" strokeWidth={1.75} />
            </a>
          </div>
        </div>
      ) : (
        <div className="rounded-[var(--radius-xl)] bg-background p-6 ring-1 ring-border">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-accent/10">
              <Globe className="size-5 text-accent/70" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-foreground">No custom domain</p>
              <p className="text-[12px] text-muted-foreground">Your app is live on a DreamOS86 subdomain</p>
            </div>
          </div>
          {project.preview_url && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-surface px-3 py-2 ring-1 ring-border text-[12.5px]">
              <Globe className="size-3.5 text-muted-foreground/60 shrink-0" strokeWidth={1.75} />
              <span className="truncate text-muted-foreground">{project.preview_url}</span>
              <a href={project.preview_url} target="_blank" rel="noopener noreferrer"
                className="ml-auto shrink-0 text-accent transition hover:text-accent/70">
                <ExternalLink className="size-3.5" strokeWidth={1.75} />
              </a>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="yourdomain.com"
              className="flex-1 rounded-xl bg-surface px-3 py-2 text-[12.5px] ring-1 ring-border focus:outline-none focus:ring-accent/40 text-foreground placeholder:text-muted-foreground/50"
            />
            <button
              type="button"
              disabled={!domainInput.includes(".")}
              className="rounded-xl bg-accent px-3 py-2 text-[12.5px] font-semibold text-white transition disabled:opacity-40 hover:bg-accent/90"
            >
              Connect
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground/60">
            Add a CNAME record pointing to <code className="text-accent">cname.dreamos86.com</code>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Security tab ─────────────────────────────────────────────────────────────

function SecurityTab({ project }: { project: ProjectRow }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[13.5px] font-semibold text-foreground">Security settings</h3>
        <p className="text-[12px] text-muted-foreground">Access control, authentication, and security policies</p>
      </div>

      {[
        { title: "Authentication", desc: "Configure sign-in methods, session length, and MFA", status: "Not configured", color: "text-muted-foreground" },
        { title: "Rate limiting", desc: "Protect API endpoints from abuse with per-IP rate limits", status: "Default (100 req/min)", color: "text-emerald-600" },
        { title: "CORS policy", desc: "Control which origins can access your API", status: project.is_public ? "Open (public)" : "Same-origin only", color: project.is_public ? "text-amber-600" : "text-emerald-600" },
        { title: "HTTPS enforcement", desc: "Redirect all HTTP traffic to HTTPS", status: "Enabled", color: "text-emerald-600" },
        { title: "Environment isolation", desc: "Production, staging, and preview run in separate environments", status: "Active", color: "text-emerald-600" },
      ].map(({ title, desc, status, color }) => (
        <div key={title} className="flex items-start justify-between rounded-[var(--radius-xl)] bg-background p-4 ring-1 ring-border">
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">{desc}</p>
          </div>
          <span className={cn("shrink-0 text-[11.5px] font-medium", color)}>{status}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Logs tab ─────────────────────────────────────────────────────────────────

function LogsTab({ project }: { project: ProjectRow }) {
  const isLive = project.status === "live";

  if (!isLive) {
    return (
      <div className="rounded-[var(--radius-xl)] bg-background p-8 text-center ring-1 ring-border">
        <div className="flex justify-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
            <Terminal className="size-6 text-accent/70" strokeWidth={1.5} />
          </div>
        </div>
        <h3 className="mt-4 text-[14px] font-semibold text-foreground">No logs yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
          Deploy your app to start collecting runtime logs, errors, and API request traces.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-foreground">Runtime logs</p>
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
          Live
        </span>
      </div>
      <div className="rounded-[var(--radius-xl)] bg-[#080c12] p-4 ring-1 ring-border font-mono">
        <p className="text-[11.5px] text-emerald-400/70">
          {new Date().toISOString()} — App initialized · waiting for requests
        </p>
        <p className="mt-1 text-[11.5px] text-muted-foreground/50">
          Logs will appear here as your app receives traffic.
        </p>
      </div>
    </div>
  );
}

// ─── Billing tab ─────────────────────────────────────────────────────────────

function BillingTab({ project }: { project: ProjectRow }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[13.5px] font-semibold text-foreground">App billing & usage</h3>
        <p className="text-[12px] text-muted-foreground">Credits consumed building and running this application</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Credits used (total)", value: "—", hint: "Since creation" },
          { label: "Last generation", value: "—", hint: "Last build event" },
          { label: "Avg. per session", value: "—", hint: "Rolling average" },
        ].map(({ label, value, hint }) => (
          <div key={label} className="rounded-[var(--radius-xl)] bg-background p-4 ring-1 ring-border">
            <p className="text-[11.5px] text-muted-foreground">{label}</p>
            <p className="mt-1 text-[22px] font-semibold text-foreground">{value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">{hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[var(--radius-xl)] bg-background p-5 ring-1 ring-border">
        <p className="text-[13px] font-semibold text-foreground mb-2">Credit history</p>
        <p className="text-[12.5px] text-muted-foreground">
          No generation events recorded for this app yet.
          Each orchestration run will appear here with a timestamp and credit cost.
        </p>
        <Link
          href="/credits"
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-accent transition hover:underline"
        >
          View account credits <ExternalLink className="size-3" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}

// ─── Integrations tab ────────────────────────────────────────────────────────

const INTEGRATIONS = [
  { name: "Supabase", desc: "Database, Auth, Storage, and Realtime", icon: "⚡", connected: false },
  { name: "Stripe", desc: "Payment processing, subscriptions, and billing", icon: "💳", connected: false },
  { name: "Resend", desc: "Transactional email delivery", icon: "📧", connected: false },
  { name: "Cloudinary", desc: "Image and video optimization CDN", icon: "🖼️", connected: false },
  { name: "OpenAI", desc: "Embed AI completions and assistants", icon: "🤖", connected: false },
  { name: "Slack", desc: "Notifications, alerts, and workflow triggers", icon: "💬", connected: false },
  { name: "GitHub", desc: "Source control, CI/CD, and deployments", icon: "🐱", connected: false },
  { name: "Twilio", desc: "SMS, voice, and WhatsApp messaging", icon: "📱", connected: false },
];

function IntegrationsTab() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[13.5px] font-semibold text-foreground">Integrations</h3>
        <p className="text-[12px] text-muted-foreground">Connect third-party services to extend your app</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {INTEGRATIONS.map(({ name, desc, icon, connected }) => (
          <div key={name} className="flex items-center gap-3 rounded-[var(--radius-xl)] bg-background p-4 ring-1 ring-border transition hover:ring-accent/20">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-lg">
              {icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground">{name}</p>
              <p className="text-[11.5px] text-muted-foreground">{desc}</p>
            </div>
            <button
              type="button"
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold transition",
                connected
                  ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                  : "bg-surface text-muted-foreground ring-1 ring-border hover:bg-accent/10 hover:text-accent hover:ring-accent/20",
              )}
            >
              {connected ? "Connected" : "Connect"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Analytics tab ───────────────────────────────────────────────────────────

function AnalyticsTab({ project }: { project: ProjectRow }) {
  const isLive = project.status === "live";

  if (!isLive) {
    return (
      <div className="space-y-3">
        <div className="rounded-[var(--radius-xl)] bg-background p-8 text-center ring-1 ring-border">
          <div className="flex justify-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
              <BarChart3 className="size-7 text-accent/70" strokeWidth={1.5} />
            </div>
          </div>
          <h3 className="mt-4 text-[14px] font-semibold text-foreground">Deploy to unlock analytics</h3>
          <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-muted-foreground">
            Once your app is live, DreamOS86 tracks page views, API latency, error rates, and active users in real time.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Page views", desc: "Daily, weekly, and monthly traffic broken down by route", icon: TrendingUp },
            { label: "Active users", desc: "Real-time concurrent users with geographic breakdown", icon: Users },
            { label: "API health", desc: "P50/P95 latency, error rate, and request throughput", icon: Server },
          ].map(({ label, desc, icon: Icon }) => (
            <div key={label} className="rounded-[var(--radius-xl)] bg-background p-4 ring-1 ring-border">
              <Icon className="size-5 text-muted-foreground/40" strokeWidth={1.5} />
              <p className="mt-2 text-[12.5px] font-semibold text-foreground">{label}</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Live: show analytics metrics with mock-real structure
  const stats = [
    { label: "Page views (7d)", value: "—", icon: TrendingUp, hint: "Collecting data…" },
    { label: "Active users", value: "—", icon: Users, hint: "Waiting for traffic" },
    { label: "API latency (P95)", value: "—", icon: Zap, hint: "Measuring…" },
    { label: "Error rate", value: "—", icon: AlertTriangle, hint: "All clear" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, hint }) => (
          <div key={label} className="rounded-[var(--radius-xl)] bg-background p-4 ring-1 ring-border">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-medium text-muted-foreground">{label}</span>
              <Icon className="size-4 text-muted-foreground/40" strokeWidth={1.5} />
            </div>
            <p className="mt-2 text-[22px] font-semibold tracking-tight text-foreground">{value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/60">{hint}</p>
          </div>
        ))}
      </div>
      <div className="rounded-[var(--radius-xl)] bg-background p-6 text-center ring-1 ring-border">
        <p className="text-[12.5px] text-muted-foreground">
          Analytics data populates after your first production requests.
          Check back once traffic is flowing.
        </p>
      </div>
    </div>
  );
}

// ─── Environment variables tab ────────────────────────────────────────────────

interface EnvVar {
  key: string;
  value: string;
  visible: boolean;
}

function EnvironmentTab({ project }: { project: ProjectRow }) {
  const [vars, setVars] = React.useState<EnvVar[]>(() => {
    const stored = typeof window !== "undefined"
      ? localStorage.getItem(`env-${project.id}`)
      : null;
    return stored ? (JSON.parse(stored) as EnvVar[]) : [];
  });
  const [newKey, setNewKey] = React.useState("");
  const [newValue, setNewValue] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  function persist(next: EnvVar[]) {
    setVars(next);
    localStorage.setItem(`env-${project.id}`, JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addVar() {
    const k = newKey.trim().toUpperCase().replace(/\s+/g, "_");
    if (!k || !newValue.trim()) return;
    persist([...vars, { key: k, value: newValue.trim(), visible: false }]);
    setNewKey("");
    setNewValue("");
    setAdding(false);
  }

  function removeVar(key: string) {
    persist(vars.filter((v) => v.key !== key));
  }

  function toggleVisible(key: string) {
    persist(vars.map((v) => v.key === key ? { ...v, visible: !v.visible } : v));
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-xl)] bg-background p-5 ring-1 ring-border">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">Environment Variables</h3>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Stored locally. Sync with your deployment provider to propagate to production.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-[11px] font-medium text-emerald-600">Saved</span>
            )}
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-accent/90"
            >
              <Plus className="size-3.5" strokeWidth={2} />
              Add variable
            </button>
          </div>
        </div>

        {vars.length === 0 && !adding ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Terminal className="size-7 text-muted-foreground/30" strokeWidth={1.5} />
            <p className="mt-3 text-[12.5px] font-medium text-foreground">No environment variables</p>
            <p className="mt-1 max-w-sm text-[11.5px] text-muted-foreground">
              Add variables like API keys, database URLs, or feature flags.
              These are injected into your runtime environment.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {vars.map((v) => (
              <div key={v.key} className="flex items-center gap-2 rounded-lg bg-surface p-2.5 ring-1 ring-border/60">
                <code className="min-w-0 flex-[2] truncate text-[12px] font-mono font-medium text-foreground">
                  {v.key}
                </code>
                <div className="flex min-w-0 flex-[3] items-center gap-1.5 rounded bg-background px-2 py-1 font-mono text-[11.5px] text-muted-foreground ring-1 ring-border/60">
                  <span className="min-w-0 flex-1 truncate">
                    {v.visible ? v.value : "•".repeat(Math.min(v.value.length, 24))}
                  </span>
                  <button type="button" onClick={() => toggleVisible(v.key)} className="shrink-0 text-muted-foreground/50 transition hover:text-foreground">
                    {v.visible ? <EyeOff className="size-3.5" strokeWidth={1.75} /> : <Eye className="size-3.5" strokeWidth={1.75} />}
                  </button>
                </div>
                <button type="button" onClick={() => removeVar(v.key)} className="shrink-0 text-muted-foreground/40 transition hover:text-destructive">
                  <X className="size-4" strokeWidth={1.75} />
                </button>
              </div>
            ))}
          </div>
        )}

        {adding && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-center gap-2"
          >
            <input
              autoFocus
              placeholder="VARIABLE_NAME"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="h-9 flex-[2] rounded-lg bg-surface px-3 font-mono text-[12px] text-foreground ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <input
              placeholder="value"
              type="password"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addVar()}
              className="h-9 flex-[3] rounded-lg bg-surface px-3 font-mono text-[12px] text-foreground ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <button type="button" onClick={addVar} className="h-9 rounded-lg bg-accent px-3 text-[12px] font-semibold text-white transition hover:bg-accent/90">
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className="h-9 rounded-lg bg-surface px-3 text-[12px] font-medium text-muted-foreground ring-1 ring-border transition hover:bg-surface-raised">
              Cancel
            </button>
          </motion.div>
        )}
      </div>

      <div className="rounded-[var(--radius-xl)] bg-background p-4 ring-1 ring-border">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" strokeWidth={1.75} />
          <div>
            <p className="text-[12px] font-semibold text-foreground">Security reminder</p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
              Never commit secret keys to source control. Use environment variables for all credentials,
              API keys, and connection strings. Values shown above are stored locally.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MemoryTab({ memory }: { memory: MemoryRow[] }) {
  if (memory.length === 0) {
    return (
      <div className="rounded-[var(--radius-xl)] bg-background p-10 text-center ring-1 ring-border">
        <Brain className="mx-auto size-8 text-muted-foreground/50" strokeWidth={1.5} />
        <p className="mt-3 text-[13px] font-semibold text-foreground">No memory yet</p>
        <p className="mt-1 max-w-md mx-auto text-[12px] text-muted-foreground">
          As you talk to your AI specialists about this project, architectural decisions, design choices, and stack preferences are stored here so subsequent sessions stay coherent.
        </p>
      </div>
    );
  }
  const grouped = new Map<string, MemoryRow[]>();
  for (const row of memory) {
    if (!grouped.has(row.category)) grouped.set(row.category, []);
    grouped.get(row.category)!.push(row);
  }
  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([cat, rows]) => (
        <div key={cat} className="rounded-[var(--radius-xl)] bg-background p-4 ring-1 ring-border">
          <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {cat.replace(/_/g, " ")}
          </h4>
          <ul className="mt-2 space-y-1.5">
            {rows.map((r) => (
              <li
                key={`${r.category}-${r.key}`}
                className="flex items-start gap-2 text-[12.5px]"
              >
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{r.key}</p>
                  <p className="break-words text-muted-foreground">
                    {typeof r.value === "string" ? r.value : JSON.stringify(r.value)}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground/60">
                  {new Date(r.updated_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SettingsTab({ project }: { project: ProjectRow }) {
  const supabase = createClient();
  const [name, setName] = React.useState(project.name);
  const [description, setDescription] = React.useState(project.description ?? "");
  const [customDomain, setCustomDomain] = React.useState(project.custom_domain ?? "");
  const [isPublic, setIsPublic] = React.useState(project.is_public);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("projects")
      .update({
        name,
        description: description || null,
        custom_domain: customDomain || null,
        is_public: isPublic,
      })
      .eq("id", project.id);
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setSavedAt(new Date());
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-xl)] bg-background p-5 ring-1 ring-border">
        <h3 className="text-[13px] font-semibold tracking-tight text-foreground">General</h3>
        <div className="mt-4 space-y-3">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 w-full rounded-lg bg-surface px-3 text-[13px] text-foreground ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg bg-surface px-3 py-2 text-[13px] text-foreground ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </Field>
          <Field label="Custom domain" hint="Point your DNS A record to your deployment, then enter the host here.">
            <input
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value)}
              placeholder="example.com"
              className="h-9 w-full rounded-lg bg-surface px-3 text-[13px] text-foreground ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="size-4 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-[13px] text-foreground">
              Make this project publicly viewable
            </span>
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-white transition hover:bg-accent/90 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" strokeWidth={2} />}
            {saving ? "Saving…" : "Save changes"}
          </button>
          {savedAt && (
            <span className="text-[11.5px] text-emerald-600">
              Saved · {savedAt.toLocaleTimeString()}
            </span>
          )}
          {error && (
            <span className="text-[11.5px] text-destructive">{error}</span>
          )}
        </div>
      </div>

      <DangerZone projectId={project.id} />
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11.5px] font-semibold tracking-tight text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DangerZone({ projectId }: { projectId: string }) {
  const supabase = createClient();
  const [confirming, setConfirming] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function destroy() {
    setDeleting(true);
    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    setDeleting(false);
    if (!error) {
      window.location.href = "/projects";
    }
  }

  return (
    <div className="rounded-[var(--radius-xl)] border border-destructive/30 bg-destructive/5 p-5">
      <h3 className="text-[13px] font-semibold tracking-tight text-destructive">Danger zone</h3>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Deleting a project removes its deployments, memory, and conversation history. Cannot be undone.
      </p>
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-1.5 text-[12px] font-semibold text-destructive transition hover:bg-destructive/15"
        >
          <Trash2 className="size-3.5" strokeWidth={2} />
          Delete project
        </button>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            onClick={destroy}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-destructive/90 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" strokeWidth={2} />}
            {deleting ? "Deleting…" : "Yes, delete forever"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="inline-flex items-center rounded-lg bg-surface px-3 py-1.5 text-[12px] font-semibold text-foreground ring-1 ring-border transition hover:bg-surface-raised"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard shell ─────────────────────────────────────────────────────────

export interface ProjectDashboardProps {
  project: ProjectRow;
  deployments: DeploymentRow[];
  memory: MemoryRow[];
}

export function ProjectDashboard({
  project: initialProject,
  deployments,
  memory,
}: ProjectDashboardProps) {
  const [tab, setTab] = React.useState<Tab>("overview");
  const [publishState, setPublishState] = React.useState<"idle" | "publishing" | "published" | "failed">("idle");
  const project = initialProject;

  const lastDeployment = deployments.find((d) => d.status === "deployed");
  const hasUnpublishedChanges = publishState === "idle" && (
    !lastDeployment || new Date(project.updated_at) > new Date(lastDeployment.created_at)
  );

  async function handlePublish() {
    setPublishState("publishing");
    // Simulate publish pipeline (real implementation would call /api/deploy)
    await new Promise((r) => setTimeout(r, 2200));
    setPublishState("published");
    setTimeout(() => setPublishState("idle"), 5000);
  }

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      {/* Header */}
      <div className="mb-5 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href="/projects"
            className="text-[11.5px] font-medium text-muted-foreground transition hover:text-foreground"
          >
            ← Apps
          </Link>

          <div className="mt-1 flex items-center gap-2.5 flex-wrap">
            {/* App gradient icon */}
            <div className={cn("size-9 shrink-0 rounded-xl bg-gradient-to-br", project.gradient)} />

            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-semibold tracking-[-0.04em] text-foreground">
                {project.name}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                  STATUS_PILL[project.status].bg,
                  STATUS_PILL[project.status].text,
                )}>
                  {STATUS_PILL[project.status].label}
                </span>
                {lastDeployment && (
                  <span className="text-[11px] text-muted-foreground/60">
                    Last deployed {new Date(lastDeployment.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Preview button */}
          {project.preview_url && (
            <a
              href={project.preview_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-[12.5px] font-medium text-foreground ring-1 ring-border transition hover:bg-surface-raised"
            >
              <ExternalLink className="size-3.5" strokeWidth={1.75} />
              Preview
            </a>
          )}

          {/* Open in workspace */}
          <Link
            href={`/create?projectId=${project.id}`}
            className="flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-[12.5px] font-medium text-foreground ring-1 ring-border transition hover:bg-surface-raised"
          >
            <ArrowUpRight className="size-3.5" strokeWidth={1.75} />
            Edit
          </Link>

          {/* Publish button — shown when there are unpublished changes or in publishing/failed state */}
          <AnimatePresence mode="wait">
            {(hasUnpublishedChanges || publishState === "publishing" || publishState === "published" || publishState === "failed") && (
              <motion.button
                key={publishState}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                type="button"
                onClick={publishState === "idle" || publishState === "failed" ? handlePublish : undefined}
                disabled={publishState === "publishing"}
                className={cn(
                  "flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold transition",
                  publishState === "publishing" && "bg-accent/20 text-accent cursor-wait",
                  publishState === "published" && "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/30",
                  publishState === "failed" && "bg-destructive/10 text-destructive ring-1 ring-destructive/30",
                  (publishState === "idle" || hasUnpublishedChanges) && "bg-gradient-to-r from-accent to-violet-500 text-white shadow-[0_4px_16px_-4px_rgba(30,107,255,0.45)] hover:opacity-90 active:scale-[0.98]",
                )}
              >
                {publishState === "publishing" && (
                  <>
                    <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
                    Deploying…
                  </>
                )}
                {publishState === "published" && (
                  <>
                    <CheckCircle2 className="size-3.5" strokeWidth={2} />
                    Deployed
                  </>
                )}
                {publishState === "failed" && (
                  <>
                    <AlertTriangle className="size-3.5" strokeWidth={2} />
                    Retry deploy
                  </>
                )}
                {publishState === "idle" && (
                  <>
                    <Zap className="size-3.5" strokeWidth={2} />
                    Publish
                  </>
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" aria-label="Project sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-border scrollbar-none">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={cn(
                "relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium transition",
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" strokeWidth={1.75} />
              {label}
              {active && (
                <motion.span
                  layoutId="proj-active-tab"
                  className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-accent"
                />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {tab === "overview" && <OverviewTab project={project} deployments={deployments} />}
          {tab === "architecture" && <ArchitectureTab project={project} deployments={deployments} />}
          {tab === "deployments" && <DeploymentsTab deployments={deployments} />}
          {tab === "analytics" && <AnalyticsTab project={project} />}
          {tab === "users" && <UsersTab project={project} />}
          {tab === "domains" && <DomainsTab project={project} />}
          {tab === "security" && <SecurityTab project={project} />}
          {tab === "environment" && <EnvironmentTab project={project} />}
          {tab === "logs" && <LogsTab project={project} />}
          {tab === "billing" && <BillingTab project={project} />}
          {tab === "integrations" && <IntegrationsTab />}
          {tab === "media" && <MediaTab projectId={project.id} />}
          {tab === "memory" && <MemoryTab memory={memory} />}
          {tab === "settings" && <SettingsTab project={project} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
