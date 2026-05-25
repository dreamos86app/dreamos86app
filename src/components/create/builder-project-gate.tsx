"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Home, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ImmersiveWorkspace } from "@/components/create/workspace/immersive-workspace";
import type { CreateWorkspaceProject } from "@/components/create/workspace/immersive-workspace";
import type { BuildStrategy } from "@/lib/create/autostart-handoff";

const VALID_MODES = ["discuss", "edit", "build"] as const;
type Mode = (typeof VALID_MODES)[number];

export type BuilderProjectGateProps = {
  appId: string;
  userId: string;
  initialProject: CreateWorkspaceProject | null;
  initialPrompt?: string;
  initialMode?: Mode;
  initialAutoStart?: boolean;
  initialBuildStrategy?: BuildStrategy;
  initialModelId?: string;
  initialJobId?: string | null;
  initialConversationId?: string | null;
  loadError?: string | null;
};

export function BuilderProjectGate({
  appId,
  userId,
  initialProject,
  initialPrompt = "",
  initialMode = "build",
  initialAutoStart = false,
  initialBuildStrategy = "build_now",
  initialModelId,
  initialJobId = null,
  initialConversationId = null,
  loadError = null,
}: BuilderProjectGateProps) {
  const router = useRouter();
  const supabase = createClient();
  const [project, setProject] = React.useState<CreateWorkspaceProject | null>(initialProject);
  const [phase, setPhase] = React.useState<"loading" | "ready" | "missing">(
    initialProject ? "ready" : "loading",
  );
  const [failureReason, setFailureReason] = React.useState<string | null>(loadError);
  const attemptsRef = React.useRef(0);

  const fetchProject = React.useCallback(async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from("projects")
      .select(
        "id, name, preview_url, icon_url, gradient, status, framework, custom_domain, is_public, metadata, published_subdomain, app_name, build_status, short_description, category, icon_svg",
      )
      .eq("id", appId)
      .eq("owner_id", userId)
      .maybeSingle();

    if (error) {
      setFailureReason(error.message);
      return false;
    }
    if (!data?.id) {
      setFailureReason("not_found_or_forbidden");
      return false;
    }

    const row = data as CreateWorkspaceProject & { app_name?: string | null };
    setProject({
      ...row,
      name: row.app_name?.trim() || row.name,
    });
    setFailureReason(null);
    setPhase("ready");
    return true;
  }, [appId, supabase, userId]);

  React.useEffect(() => {
    if (initialProject) {
      setPhase("ready");
      return;
    }

    let cancelled = false;
    const started = Date.now();
    const maxMs = 5_000;

    async function poll() {
      while (!cancelled && Date.now() - started < maxMs) {
        attemptsRef.current += 1;
        const ok = await fetchProject();
        if (ok) return;
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!cancelled) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[builder-gate] project unavailable", {
            projectId: appId,
            userId,
            reason: failureReason ?? "timeout",
            attempts: attemptsRef.current,
          });
        }
        setPhase("missing");
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [appId, failureReason, fetchProject, initialProject, userId]);

  if (phase === "loading") {
    return (
      <div
        className="flex h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center"
        data-testid="builder-project-loading"
      >
        <Loader2 className="size-6 animate-spin text-muted-foreground/50" strokeWidth={1.75} />
        <p className="text-[14px] font-medium text-foreground">Opening your workspace…</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Creating your app and preparing the builder.
        </p>
      </div>
    );
  }

  if (phase === "missing" || !project) {
    return (
      <div
        className="flex h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center"
        data-testid="builder-project-recovery"
      >
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/40 ring-1 ring-border/60">
          <Sparkles className="size-7 text-accent/80" strokeWidth={1.5} />
        </div>
        <div className="max-w-md space-y-2">
          <h1 className="text-[20px] font-semibold tracking-tight text-foreground">
            We couldn&apos;t open this app
          </h1>
          <p className="text-[14px] text-muted-foreground">
            This project may still be creating, was removed, or you may not have access. You can go
            back to your apps or start again from home.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background px-4 py-2.5 text-[13px] font-medium text-foreground transition hover:bg-muted/40"
          >
            <Home className="size-4" strokeWidth={1.75} />
            Back to Your Apps
          </Link>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
          >
            Start again
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("loading");
              attemptsRef.current = 0;
              void fetchProject().then((ok) => {
                if (!ok) setPhase("missing");
              });
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-4 py-2.5 text-[13px] font-medium text-foreground transition hover:bg-muted/40"
          >
            <RefreshCw className="size-4" strokeWidth={1.75} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ImmersiveWorkspace
      initialPrompt={initialPrompt}
      initialMode={initialMode}
      initialAutoStart={initialAutoStart}
      initialBuildStrategy={initialBuildStrategy}
      initialModelId={initialModelId}
      initialJobId={initialJobId ?? undefined}
      initialConversationId={initialConversationId ?? undefined}
      project={project}
    />
  );
}
