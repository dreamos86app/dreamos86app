"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { storeAutostartHandoff, type PendingPrompt } from "@/lib/create/autostart-handoff";
import { buildBuilderUrl } from "@/lib/navigation/builder-url";
import type { BuildStrategy } from "@/lib/create/autostart-handoff";

const ImmersiveWorkspace = dynamic(
  () => import("@/components/create/workspace/immersive-workspace").then((m) => m.ImmersiveWorkspace),
  {
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground/40" strokeWidth={1.75} />
      </div>
    ),
  },
);

type CreateWorkspaceEntryProps = {
  initialPrompt?: string;
  initialProjectId?: string | null;
  initialMode?: string;
  initialAutoStart?: boolean;
  initialStrategy?: string;
  initialModel?: string;
  initialSkipDraft?: boolean;
};

async function assertProjectReady(projectId: string): Promise<boolean> {
  for (let i = 0; i < 25; i++) {
    const res = await fetch(`/api/projects/${projectId}/summary`, { credentials: "include" });
    if (res.ok) return true;
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

export function CreateWorkspaceEntry({
  initialPrompt = "",
  initialProjectId = null,
  initialMode = "build",
  initialAutoStart = false,
  initialStrategy = "plan_first",
  initialModel = "",
  initialSkipDraft = false,
}: CreateWorkspaceEntryProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [discussOnly, setDiscussOnly] = React.useState(initialSkipDraft);

  React.useEffect(() => {
    if (discussOnly) return;
    let cancelled = false;

    async function bootstrap() {
      const prompt = initialPrompt.trim();
      const mode = (initialMode === "discuss" || initialMode === "edit" || initialMode === "build"
        ? initialMode
        : "build") as PendingPrompt["mode"];
      const autoStart = initialAutoStart || Boolean(prompt);

      const strategy =
        initialStrategy === "build_now" || initialStrategy === "plan_first"
          ? initialStrategy
          : "plan_first";

      if (autoStart && prompt) {
        const id = storeAutostartHandoff(prompt, mode, {
          buildStrategy: strategy,
          modelId: initialModel || undefined,
        });

        if (initialProjectId) {
          const ready = await assertProjectReady(initialProjectId);
          if (cancelled) return;
          if (!ready) {
            setError("App is still being created. Try again in a moment.");
            return;
          }
          router.replace(navigateToBuilder(initialProjectId, mode, autoStart, strategy, initialModel));
          return;
        }

        if (initialSkipDraft) {
          setDiscussOnly(true);
          return;
        }

        const res = await fetch("/api/create/project-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: "Untitled App",
            idempotencyKey: id,
            sessionId: id,
          }),
        });
        const body = (await res.json()) as { projectId?: string; error?: string; hint?: string; reused?: boolean };
        if (cancelled) return;
        if (!res.ok || !body.projectId) {
          setError(body.error ?? body.hint ?? "Could not open create workspace");
          return;
        }
        const ready = await assertProjectReady(body.projectId);
        if (cancelled) return;
        if (!ready) {
          setError("App was created but is not ready yet. Retry in a moment.");
          return;
        }
        router.replace(navigateToBuilder(body.projectId, mode, autoStart, strategy, initialModel));
        return;
      }

      if (initialProjectId) {
        const ready = await assertProjectReady(initialProjectId);
        if (cancelled) return;
        if (!ready) {
          setError("App is still being created. Try again in a moment.");
          return;
        }
        router.replace(navigateToBuilder(initialProjectId, mode, autoStart, strategy, initialModel));
        return;
      }

      if (prompt) {
        try {
          const intentRes = await fetch("/api/projects/classify-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ prompt }),
          });
          const intent = (await intentRes.json()) as {
            intent?: string;
            shouldCreateProject?: boolean;
            shouldAnswerQuestion?: boolean;
          };
          if (
            !cancelled &&
            (intent.intent === "question_only" ||
              intent.shouldAnswerQuestion ||
              intent.shouldCreateProject === false)
          ) {
            setDiscussOnly(true);
            return;
          }
        } catch {
          /* proceed with draft if classifier unavailable */
        }
      }

      const res = await fetch("/api/create/project-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: "Untitled App" }),
      });
      const body = (await res.json()) as { projectId?: string; error?: string; hint?: string };
      if (cancelled) return;
      if (!res.ok || !body.projectId) {
        setError(body.error ?? body.hint ?? "Could not open create workspace");
        return;
      }
      const ready = await assertProjectReady(body.projectId);
      if (cancelled) return;
      if (!ready) {
        setError("Could not confirm the new app is ready. Try again.");
        return;
      }
      router.replace(navigateToBuilder(body.projectId, mode, autoStart, strategy, initialModel));
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [
    discussOnly,
    initialAutoStart,
    initialMode,
    initialModel,
    initialProjectId,
    initialPrompt,
    initialSkipDraft,
    initialStrategy,
    router,
  ]);

  if (discussOnly) {
    const mode =
      initialMode === "discuss" || initialMode === "edit" || initialMode === "build"
        ? initialMode
        : "discuss";
    return (
      <ImmersiveWorkspace
        initialPrompt={initialPrompt}
        initialMode={mode === "build" ? "discuss" : mode}
        initialAutoStart={initialAutoStart || Boolean(initialPrompt.trim())}
        initialBuildStrategy={
          initialStrategy === "build_now" || initialStrategy === "plan_first"
            ? initialStrategy
            : "build_now"
        }
        initialModelId={initialModel || undefined}
        project={null}
      />
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-[14px] font-medium text-foreground">Could not open builder</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-accent px-4 py-2 text-[13px] font-medium text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Loader2 className="size-5 animate-spin text-muted-foreground/40" strokeWidth={1.75} />
    </div>
  );
}
