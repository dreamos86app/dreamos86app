"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { CreateComposerReadyBridge } from "@/components/create/create-composer-ready-bridge";
import { ImmersiveWorkspace } from "@/components/create/workspace/immersive-workspace";
import { storeAutostartHandoff, type PendingPrompt } from "@/lib/create/autostart-handoff";
import { buildBuilderUrl } from "@/lib/navigation/builder-url";
import type { BuildStrategy } from "@/lib/create/autostart-handoff";
import { readPendingCreatePrompt } from "@/components/create/create-server-composer-island";

const BOOTSTRAP_TIMEOUT_MS = 5_000;

type CreateWorkspaceEntryProps = {
  initialPrompt?: string;
  initialProjectId?: string | null;
  initialMode?: string;
  initialAutoStart?: boolean;
  initialStrategy?: string;
  initialModel?: string;
  initialSkipDraft?: boolean;
  onWorkspaceShellReady?: () => void;
};

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = BOOTSTRAP_TIMEOUT_MS, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function assertProjectReady(projectId: string): Promise<boolean> {
  const deadline = Date.now() + BOOTSTRAP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetchWithTimeout(`/api/projects/${projectId}/summary`, {
        credentials: "include",
        timeoutMs: Math.max(800, deadline - Date.now()),
      });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

function navigateToBuilder(
  projectId: string,
  mode: PendingPrompt["mode"],
  autoStart: boolean,
  strategy: BuildStrategy,
  model?: string,
): string {
  return buildBuilderUrl({
    projectId,
    autostart: autoStart,
    strategy,
    model: model || null,
    mode,
  });
}

function resolveMode(initialMode: string): PendingPrompt["mode"] {
  return initialMode === "discuss" || initialMode === "edit" || initialMode === "build"
    ? initialMode
    : "build";
}

function resolveStrategy(initialStrategy: string): BuildStrategy {
  return initialStrategy === "build_now" || initialStrategy === "plan_first"
    ? initialStrategy
    : "plan_first";
}

export function CreateWorkspaceEntry({
  initialPrompt = "",
  initialProjectId = null,
  initialMode = "build",
  initialAutoStart = false,
  initialStrategy = "plan_first",
  initialModel = "",
  initialSkipDraft = false,
  onWorkspaceShellReady,
}: CreateWorkspaceEntryProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [discussOnly, setDiscussOnly] = React.useState(initialSkipDraft);
  const [bootstrapPhase, setBootstrapPhase] = React.useState<"idle" | "running" | "done">("idle");
  const workspaceReadyRef = React.useRef(false);

  const prompt = (initialPrompt || readPendingCreatePrompt()).trim();
  const mode = resolveMode(initialMode);
  const autoStart = initialAutoStart || Boolean(prompt);
  const strategy = resolveStrategy(initialStrategy);

  const plainEmptyBuild =
    mode === "build" && !initialProjectId && !(autoStart && Boolean(prompt) && !initialSkipDraft);

  const needsRedirectBootstrap =
    !discussOnly &&
    (Boolean(initialProjectId) || (autoStart && Boolean(prompt) && !initialSkipDraft));

  const notifyWorkspaceReady = React.useCallback(() => {
    if (workspaceReadyRef.current) return;
    workspaceReadyRef.current = true;
    onWorkspaceShellReady?.();
  }, [onWorkspaceShellReady]);

  React.useEffect(() => {
    if (!needsRedirectBootstrap) return;
    if (workspaceReadyRef.current) return;
    let cancelled = false;
    setBootstrapPhase("running");
    setError(null);

    async function bootstrap() {
      try {
        if (initialProjectId) {
          const ready = await assertProjectReady(initialProjectId);
          if (cancelled) return;
          if (!ready) {
            setError("App is still being created. Try again in a moment.");
            setBootstrapPhase("done");
            return;
          }
          router.replace(
            navigateToBuilder(initialProjectId, mode, autoStart, strategy, initialModel),
          );
          return;
        }

        const id = storeAutostartHandoff(prompt, mode, {
          buildStrategy: strategy,
          modelId: initialModel || undefined,
        });

        const res = await fetchWithTimeout("/api/create/project-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: "Untitled App",
            idempotencyKey: id,
            sessionId: id,
          }),
        });
        const body = (await res.json()) as {
          projectId?: string;
          error?: string;
          hint?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.projectId) {
          setError(body.error ?? body.hint ?? "Could not open create workspace");
          setBootstrapPhase("done");
          return;
        }
        const ready = await assertProjectReady(body.projectId);
        if (cancelled) return;
        if (!ready) {
          setError("App was created but is not ready yet. Retry in a moment.");
          setBootstrapPhase("done");
          return;
        }
        router.replace(
          navigateToBuilder(body.projectId, mode, autoStart, strategy, initialModel),
        );
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error && err.name === "AbortError"
            ? "Create workspace timed out. Check your connection and retry."
            : err instanceof Error
              ? err.message
              : "Could not open create workspace";
        setError(msg);
        setBootstrapPhase("done");
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [
    autoStart,
    initialModel,
    initialProjectId,
    mode,
    needsRedirectBootstrap,
    prompt,
    router,
    strategy,
  ]);

  const bootstrapBanner =
    needsRedirectBootstrap && bootstrapPhase === "running" ? (
      <div
        className="pointer-events-none absolute inset-x-0 top-12 z-50 flex justify-center px-4"
        data-testid="create-bootstrap-loading"
      >
        <span className="rounded-full border border-border/60 bg-background/95 px-3 py-1 text-[12px] text-muted-foreground shadow-sm">
          Opening your app…
        </span>
      </div>
    ) : null;

  if (error) {
    return (
      <div
        className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-background/90 px-6 text-center"
        data-testid="create-bootstrap-error"
      >
        <p className="text-[14px] font-medium text-foreground">Could not open builder</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setBootstrapPhase("idle");
            window.location.reload();
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white"
        >
          <RefreshCw className="size-3.5" strokeWidth={1.75} />
          Retry
        </button>
      </div>
    );
  }

  if (discussOnly) {
    const discussMode = mode === "build" ? "discuss" : mode;
    return (
      <>
        {bootstrapBanner}
        <CreateComposerReadyBridge />
        <ImmersiveWorkspace
          initialPrompt={initialPrompt || readPendingCreatePrompt()}
          initialMode={discussMode}
          initialAutoStart={initialAutoStart || Boolean(prompt)}
          initialBuildStrategy={strategy === "build_now" ? "build_now" : "plan_first"}
          initialModelId={initialModel || undefined}
          project={null}
          onComposerReadyChange={(ready) => {
            if (ready) notifyWorkspaceReady();
          }}
        />
      </>
    );
  }

  const keepWorkspaceMounted =
    workspaceReadyRef.current || !needsRedirectBootstrap || plainEmptyBuild;

  if (!keepWorkspaceMounted) {
    return bootstrapBanner;
  }

  return (
    <>
      {bootstrapBanner}
      <CreateComposerReadyBridge />
      <ImmersiveWorkspace
        initialPrompt={initialPrompt || readPendingCreatePrompt()}
        initialMode={mode}
        initialAutoStart={false}
        initialBuildStrategy={strategy}
        initialModelId={initialModel || undefined}
        project={null}
        onComposerReadyChange={(ready) => {
          if (ready) notifyWorkspaceReady();
        }}
      />
    </>
  );
}
