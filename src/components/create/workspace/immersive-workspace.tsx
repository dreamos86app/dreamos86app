"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  ArrowUp,
  Paperclip,
  Loader2,
  RotateCcw,
  AlertCircle,
  Sparkles,
  Zap,
  MonitorPlay,
  LayoutGrid,
  Code2,
  ChevronDown,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCreditsStore } from "@/lib/stores/credits-store";
import { createClient } from "@/lib/supabase/client";
import { useHydrated } from "@/lib/hooks/use-hydrated";

import {
  DEFAULT_MODEL_ID,
  MODE_META,
  type CreationMode,
} from "@/lib/creation/models";
import { calculateTokens } from "@/lib/credits/cost-engine";
import { toast } from "@/lib/toast";
import { createDreamChatTransport } from "@/lib/chat/create-chat-transport";
import { runAiPreflight } from "@/lib/ai/run-preflight";
import { isAiPreflightSuccess, preflightBlockedLabel } from "@/lib/ai/preflight-types";
import { applyComposerPaste } from "@/lib/composer/textarea-handlers";
import { composerTextareaClass } from "@/components/ui/composer-shell";
import { ModelPicker } from "@/components/create/workspace/model-picker";
import { ModeSwitch, type EditScope } from "@/components/create/workspace/mode-switch";
import { AttachmentRail, DropZone, type Attachment } from "@/components/create/workspace/attachment-rail";
import { PreviewPanel } from "@/components/create/workspace/preview-panel";
import { BuildStatusNarrator } from "@/components/create/workspace/build-status-narrator";
import { BuilderAssistantMessage } from "@/components/builder/builder-event-ui";
import {
  parseBuildPlanCard,
  taskProgressIndex,
} from "@/lib/creation/parse-build-plan";
import { extractBuilderMetadata } from "@/lib/creation/parse-builder-metadata";
import { isSubmitDebugEnabled } from "@/lib/dev/submit-debug-enabled";
import { IntegrationSecretsPanel } from "@/components/create/workspace/integration-secrets-panel";
import { detectRequiredSecretNames } from "@/lib/integrations/detect-required-secrets";
import { WorkspaceLauncher, type WorkspaceRightTab } from "@/components/create/workspace/workspace-launcher";
import { AppDashboardPanel } from "@/components/create/workspace/app-dashboard-panel";
import { resolveDisplayName } from "@/lib/profile-display";
import { extractFencedCode, stripFencedCodeForChat, parseFencedFiles } from "@/lib/creation/extract-fenced-code";
import { submitDebug, uiSubmitLog } from "@/lib/dev/submit-debug";
import { useComposerClickCapture } from "@/lib/dev/composer-click-capture";
import { pushSubmitTrace } from "@/lib/dev/submit-pipeline-trace";
import { SubmitPipelinePanel } from "@/components/dev/submit-pipeline-panel";
import { CREATE_BUILD_BUNDLE } from "@/lib/dev/create-build-bundle";
import type { Tables } from "@/lib/supabase/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function messageText(m: UIMessage): string {
  if (!m.parts?.length) return "";
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function newAttachmentId() {
  return `att_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

export type CreateWorkspaceProject = Pick<
  Tables<"projects">,
  | "id"
  | "name"
  | "preview_url"
  | "icon_url"
  | "gradient"
  | "status"
  | "framework"
  | "custom_domain"
  | "is_public"
  | "metadata"
  | "published_subdomain"
>;

/** Display names for the next tier (DB `plan_id` is free | pro | business | enterprise). */
const PLAN_NEXT_LABEL: Record<string, string> = {
  free: "Starter",
  pro: "Infinity",
  business: "Infinity",
  enterprise: "Infinity",
};

function CodeRightPanel({
  files,
  fallbackText,
}: {
  files: Array<{ path: string; content: string }>;
  fallbackText: string;
}) {
  const [activePath, setActivePath] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (files.length > 0) {
      setActivePath((prev) => {
        if (prev && files.some((f) => f.path === prev)) return prev;
        return files[0]!.path;
      });
    } else {
      setActivePath(null);
    }
  }, [files]);

  if (files.length === 0 && !fallbackText.trim()) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Code2 className="size-8 text-muted-foreground/40" strokeWidth={1.25} />
        <p className="text-[13px] font-medium text-foreground">No code blocks yet</p>
        <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">
          When the assistant returns fenced ``` source, it will show here. Plain chat stays in the left panel.
        </p>
      </div>
    );
  }

  const active = files.find((f) => f.path === activePath);

  if (files.length === 0) {
    return (
      <pre className="h-full overflow-auto p-4 text-[11px] leading-relaxed text-foreground [scrollbar-gutter:stable]">
        {fallbackText}
      </pre>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="w-[min(40%,220px)] shrink-0 overflow-y-auto border-r border-border bg-surface/50 py-2 text-[11px]">
        <p className="sticky top-0 z-10 bg-surface/95 px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Files ({files.length})
        </p>
        <ul className="space-y-px px-1">
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => setActivePath(f.path)}
                className={cn(
                  "w-full cursor-pointer truncate rounded-md px-2 py-1.5 text-left transition",
                  f.path === activePath ? "bg-accent/15 font-medium text-foreground" : "text-muted-foreground hover:bg-surface",
                )}
              >
                {f.path}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <pre className="min-w-0 flex-1 overflow-auto p-4 text-[11px] leading-relaxed text-foreground [scrollbar-gutter:stable]">
        {active?.content ?? ""}
      </pre>
    </div>
  );
}

function MessageBubble({
  message,
  userAvatar,
  userName,
  streaming,
  mode,
  creditsUsed,
}: {
  message: UIMessage;
  userAvatar?: string | null;
  userName: string;
  streaming?: boolean;
  mode: CreationMode;
  creditsUsed?: number | null;
}) {
  const isUser = message.role === "user";
  const raw = messageText(message);
  const text =
    !isUser && mode === "build" ? stripFencedCodeForChat(raw) : raw;
  const buildMeta = !isUser && mode === "build" ? extractBuilderMetadata(raw) : null;
  const buildPlan = !isUser && mode === "build" ? parseBuildPlanCard(raw) : null;
  const progressIndex =
    buildPlan && mode === "build"
      ? taskProgressIndex(raw.length, buildPlan.taskLabels.length)
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={cn("group flex gap-2.5", isUser && "flex-row-reverse")}
    >
      <div className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border">
        {isUser ? (
          userAvatar ? (
            <Image src={userAvatar} alt={userName} width={24} height={24} className="size-full object-cover" unoptimized />
          ) : (
            <span className="text-[9px] font-semibold text-foreground">{userName.slice(0, 1).toUpperCase()}</span>
          )
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-accent/30 to-accent/10">
            <Sparkles className="size-3 text-accent" strokeWidth={1.75} />
          </div>
        )}
      </div>

      {isUser ? (
        <div className="min-w-0 max-w-[82%] rounded-xl bg-accent px-3 py-2 text-[13px] leading-relaxed text-white">
          {text}
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          {!text ? (
            <div className="rounded-xl bg-surface px-3 py-2 text-[13px] text-muted-foreground ring-1 ring-border">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                Working on your app…
              </span>
            </div>
          ) : mode === "build" && buildPlan ? (
            <BuilderAssistantMessage
              text={text}
              streaming={streaming}
              meta={buildMeta}
              plan={buildPlan}
              progressIndex={progressIndex}
              creditsUsed={creditsUsed}
            />
          ) : (
            <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{text}</div>
          )}
        </div>
      )}
    </motion.div>
  );
}

const MODE_STYLE = {
  discuss: {
    composerWrap:
      "composer-shell border border-border/70 bg-surface shadow-sm transition-colors focus-within:border-accent/35",
    badge: null,
  },
  edit: {
    composerWrap:
      "composer-shell border border-amber-500/25 bg-surface shadow-sm transition-colors focus-within:border-amber-400/40",
    badge: { label: "Surgical Edit", color: "bg-amber-500/10 text-amber-600 ring-amber-500/25" },
  },
  build: {
    composerWrap:
      "composer-shell border border-violet-500/25 bg-surface shadow-sm transition-colors focus-within:border-violet-400/40",
    badge: null,
  },
} satisfies Record<
  string,
  { composerWrap: string; badge: { label: string; color: string } | null }
>;

export interface ImmersiveWorkspaceProps {
  initialPrompt?: string;
  initialMode?: CreationMode;
  initialAutoStart?: boolean;
  project?: CreateWorkspaceProject | null;
}

export function ImmersiveWorkspace({
  initialPrompt = "",
  initialMode = "build",
  initialAutoStart = false,
  project = null,
}: ImmersiveWorkspaceProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const authReturnTo = React.useMemo(() => {
    const qs = searchParams?.toString();
    return qs ? `${pathname}?${qs}` : pathname || "/create";
  }, [pathname, searchParams]);
  const supabase = createClient();
  const { profile, user } = useAuthStore();
  const uid = user?.id ?? profile?.id;
  const { remaining, isConfirmed, resetAt, syncFromDB, deductOptimistic } = useCreditsStore();
  const hydrated = useHydrated();
  const debugEnabled = isSubmitDebugEnabled(
    searchParams,
    profile?.email ?? user?.email ?? null,
  );

  const [input, setInput] = React.useState(initialPrompt);
  const [mode, setMode] = React.useState<CreationMode>(initialMode);
  const [modelId, setModelId] = React.useState(DEFAULT_MODEL_ID);
  const [scope, setScope] = React.useState<EditScope | null>(null);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [creditError, setCreditError] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [localProjectId, setLocalProjectId] = React.useState<string | null>(null);
  const [autoStartFailed, setAutoStartFailed] = React.useState<string | null>(null);
  const autoStartedRef = React.useRef(false);
  const userPinnedScrollRef = React.useRef(false);
  const [showJumpToLatest, setShowJumpToLatest] = React.useState(false);
  const [rightTab, setRightTab] = React.useState<WorkspaceRightTab>("preview");
  const [lastSubmitAt, setLastSubmitAt] = React.useState<number | null>(null);
  const [lastApiUrl, setLastApiUrl] = React.useState<string | null>(null);
  const [lastApiStatus, setLastApiStatus] = React.useState<string | null>(null);
  const [editNeedsApp, setEditNeedsApp] = React.useState(false);
  const [submitBlocker, setSubmitBlocker] = React.useState<string | null>(null);
  const [debugClicked, setDebugClicked] = React.useState(false);
  const [debugSubmitted, setDebugSubmitted] = React.useState(false);
  const [preflightState, setPreflightState] = React.useState("idle");
  const [chatState, setChatState] = React.useState("idle");
  const [debugBlocked, setDebugBlocked] = React.useState("no");
  const [submitStatusLabel, setSubmitStatusLabel] = React.useState("Ready");

  const composerRootRef = React.useRef<HTMLDivElement>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const submitInFlightRef = React.useRef(false);
  useComposerClickCapture("create", composerRootRef);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const conversationIdRef = React.useRef<string | null>(null);
  conversationIdRef.current = conversationId;
  const projectIdRef = React.useRef<string | null>(null);
  const effectiveProjectId = localProjectId ?? project?.id ?? null;
  projectIdRef.current = effectiveProjectId;

  const [remoteProjectPatch, setRemoteProjectPatch] = React.useState<Partial<CreateWorkspaceProject>>({});

  React.useEffect(() => {
    setRemoteProjectPatch({});
  }, [project?.id]);

  const baseProject = React.useMemo((): CreateWorkspaceProject | null => {
    if (project) return project;
    if (!localProjectId) return null;
    return {
      id: localProjectId,
      name: "New app",
      preview_url: null,
      icon_url: null,
      gradient: "from-blue-500/20 via-indigo-500/10 to-violet-500/15",
      status: "building",
      framework: "nextjs",
      custom_domain: null,
      is_public: false,
      metadata: {},
      published_subdomain: null,
    };
  }, [project, localProjectId]);

  const effectiveProject = React.useMemo((): CreateWorkspaceProject | null => {
    if (!baseProject) return null;
    return { ...baseProject, ...remoteProjectPatch };
  }, [baseProject, remoteProjectPatch]);

  React.useEffect(() => {
    if (project?.id) setLocalProjectId(null);
  }, [project?.id]);
  const modeRef = React.useRef(mode);
  const scopeRef = React.useRef<EditScope | null>(scope);
  modeRef.current = mode;
  scopeRef.current = scope;

  const modelIdRef = React.useRef(modelId);
  modelIdRef.current = modelId;

  /** Stable for component lifetime — never tie to conversationId or send wipes mid-flight. */
  const createSessionId = React.useId();

  const transport = React.useMemo(
    () =>
      createDreamChatTransport({
        label: "create",
        getBody: () => ({
          modelId: modelIdRef.current,
          mode: modeRef.current,
          scope: scopeRef.current,
          projectId: projectIdRef.current ?? undefined,
          conversationId: conversationIdRef.current ?? undefined,
        }),
        on402: () => setCreditError(true),
        onSuccess: () => setCreditError(false),
        onFetchStart: (url) => {
          setLastApiUrl(url);
          setLastApiStatus("pending");
          setChatState("pending");
          submitDebug("create", "fetch start", { url });
        },
        onFetchEnd: (status) => {
          const label = String(status);
          setLastApiStatus(label);
          setChatState(label.startsWith("blocked") ? "error" : "ok");
          uiSubmitLog("create", `chat status ${status}`);
          submitDebug("create", "response status", { status });
        },
      }),
    [],
  );

  const { messages, sendMessage, status, error, clearError, regenerate } = useChat({
    id: `dream-create-${createSessionId}`,
    transport,
    onError: (err) => {
      if (process.env.NODE_ENV !== "production") {
        console.error("[create-workspace] stream error", err);
      }
      toast.error(err.message ?? "Generation failed — try again.");
    },
    onFinish: () => {
      const cost = calculateTokens(modelIdRef.current, modeRef.current);
      deductOptimistic(cost);
      if (uid) void syncFromDB(uid, { force: true });
    },
  });
  const isBusy = status === "submitted" || status === "streaming";

  React.useEffect(() => {
    const id = effectiveProjectId;
    if (!id || isBusy) return;
    let cancelled = false;
    void supabase
      .from("projects")
      .select(
        "id, name, preview_url, icon_url, gradient, status, framework, custom_domain, is_public, metadata, published_subdomain",
      )
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error: qErr }) => {
        if (cancelled || qErr || !data) return;
        setRemoteProjectPatch(data as CreateWorkspaceProject);
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveProjectId, isBusy, supabase]);

  React.useEffect(() => {
    submitDebug("create", "mounted");
    pushSubmitTrace("create", "ImmersiveWorkspace loaded — submit pipeline active", { level: "ok" });
    if (uid) void syncFromDB(uid);
  }, [uid, syncFromDB]);

  React.useEffect(() => {
    submitDebug("create", "mode changed", { mode });
    if (mode !== "edit") setEditNeedsApp(false);
  }, [mode]);

  const trimmedInput = input.trim();
  const tokenBlocked = isConfirmed && remaining <= 0;
  const submitDisabledReason = !trimmedInput ? "empty" : isBusy ? "busy" : null;

  const tokensStatus = !isConfirmed ? "loading" : tokenBlocked ? "blocked" : `${remaining}`;
  const planId = profile?.plan_id ?? "free";
  const nextPlanLabel = PLAN_NEXT_LABEL[planId] ?? "Starter";
  const showUpgradeCard = tokenBlocked && planId !== "enterprise";

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  React.useEffect(() => {
    if (userPinnedScrollRef.current) return;
    scrollToBottom(isBusy ? "auto" : "smooth");
  }, [messages, isBusy, scrollToBottom]);

  const onChatScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const pinned = dist > 96;
    userPinnedScrollRef.current = pinned;
    setShowJumpToLatest(pinned);
  }, []);

  React.useEffect(() => {
    if (rightTab === "dashboard" && !effectiveProject?.id) setRightTab("preview");
  }, [rightTab, effectiveProject?.id]);

  function failSubmit(blocked: string, message: string, hint?: string) {
    const full = hint ? `${message} — ${hint}` : message;
    setLastApiStatus(blocked);
    setSubmitBlocker(full);
    setDebugBlocked(blocked.replace(/^blocked:/, "") || "error");
    if (blocked.includes("preflight") || blocked.startsWith("blocked:")) {
      setPreflightState("error");
    }
    pushSubmitTrace("create", full, {
      level: "error",
      error: full,
      blocked: blocked.replace(/^blocked:/, "") || "error",
      preflight: blocked.includes("preflight") ? "error" : undefined,
      chat: blocked.includes("server") ? "error" : undefined,
    });
    toast.error(full);
    submitDebug("create", blocked, { message });
  }

  const onFiles = React.useCallback((files: File[]) => {
    const next: Attachment[] = files.map((f) => ({
      id: newAttachmentId(),
      kind: f.type.startsWith("image/") ? "image" : /\.zip$/i.test(f.name) ? "zip" : "file",
      name: f.name,
      file: f,
      previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      size: f.size,
      status: "ready" as const,
    }));
    setAttachments((prev) => [...prev, ...next]);
  }, []);

  const removeAttachment = React.useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  function notifySubmitBlocked(reason: string) {
    setDebugBlocked(reason);
    if (reason === "empty") {
      failSubmit("blocked:empty", "Type a message before sending.");
    } else if (reason === "busy") {
      failSubmit("blocked:busy", "Please wait for the current generation to finish.");
    }
  }

  const runSubmit = React.useCallback(async (source: "button" | "enter" | "form" | "url-auto" = "button") => {
    setDebugClicked(true);
    setSubmitStatusLabel("Submit started");

    if (submitInFlightRef.current) {
      setDebugBlocked("busy");
      notifySubmitBlocked("busy");
      setSubmitStatusLabel("Failed: A request is already in progress");
      return;
    }
    setDebugSubmitted(true);
    uiSubmitLog("create", "handleSubmit start", { source });
    submitDebug("create", "handleSubmit start", { source });
    const text = input.trim();
    submitDebug("create", "submit guard check", { empty: !text, busy: isBusy, mode });

    if (!text) {
      setDebugBlocked("empty");
      notifySubmitBlocked("empty");
      setSubmitStatusLabel("Failed: Type a message before building");
      return;
    }
    if (isBusy) {
      setDebugBlocked("busy");
      notifySubmitBlocked("busy");
      setSubmitStatusLabel("Failed: Wait for the current generation to finish");
      return;
    }

    submitInFlightRef.current = true;
    const draft = input;
    setLastSubmitAt(Date.now());
    setSubmitBlocker(null);
    setDebugBlocked("no");
    setEditNeedsApp(false);
    clearError();
    submitDebug("create", "selected mode", { mode });

    try {
      setSubmitStatusLabel("Preflight started");
      setLastApiUrl("/api/ai/preflight");
      setLastApiStatus("preflight:pending");
      setPreflightState("pending");
      setChatState("idle");
      uiSubmitLog("create", "preflight fetch start");
      submitDebug("create", "preflight start");

      const pre = await runAiPreflight({
        mode,
        prompt: text,
        projectId: effectiveProjectId,
        conversationId: conversationIdRef.current,
        modelId,
      });

      uiSubmitLog("create", `preflight status ${pre.ok ? "ok" : pre.status}`, {
        code: pre.ok ? undefined : pre.code,
      });
      submitDebug("create", "preflight status", {
        ok: pre.ok,
        status: pre.ok ? 200 : pre.status,
        code: pre.ok ? undefined : pre.code,
      });

      if (!isAiPreflightSuccess(pre)) {
        setPreflightState("error");
        const blocked = preflightBlockedLabel(pre.code, pre.status);
        if (pre.code === "edit_no_app") setEditNeedsApp(true);
        if (pre.code === "insufficient_tokens") setCreditError(true);
        const reason = `Preflight HTTP ${pre.status}${pre.code ? ` (${pre.code})` : ""}: ${pre.error}`;
        pushSubmitTrace("create", reason, {
          level: "error",
          error: pre.hint ? `${pre.error} — ${pre.hint}` : pre.error,
          preflight: "error",
          blocked: pre.code ?? String(pre.status),
        });
        failSubmit(blocked, pre.error, pre.hint);
        setSubmitStatusLabel(
          `Failed: Preflight HTTP ${pre.status}${pre.code ? ` (${pre.code})` : ""} — ${pre.hint ? `${pre.error} — ${pre.hint}` : pre.error}`,
        );
        return;
      }

      setPreflightState("ok");
      pushSubmitTrace("create", "Preflight OK — starting chat", { level: "ok", preflight: "ok" });

      if (pre.projectId) {
        if (!project?.id) setLocalProjectId(pre.projectId);
        projectIdRef.current = pre.projectId;
      }
      if (pre.conversationId) {
        conversationIdRef.current = pre.conversationId;
        setConversationId(pre.conversationId);
      }

      submitDebug("create", "payload ready", {
        mode,
        projectId: projectIdRef.current,
        conversationId: conversationIdRef.current,
      });

      setInput("");
      setAttachments([]);

      setSubmitStatusLabel("Chat started");
      uiSubmitLog("create", "chat fetch start");
      setLastApiUrl("/api/chat");
      setLastApiStatus("pending");
      setChatState("pending");
      await sendMessage({ text });
      setLastApiStatus((s) => (s === "pending" ? "ok" : s));
      setChatState("ok");
      submitDebug("create", "ui updated");
      setSubmitStatusLabel("Chat started (stream active)");
    } catch (err) {
      setLastApiStatus("error");
      setChatState("error");
      const msg = err instanceof Error ? err.message : "Could not send message";
      failSubmit("blocked:server", msg);
      setSubmitStatusLabel(`Failed: ${msg}`);
      if (source === "url-auto") {
        setAutoStartFailed(msg);
        autoStartedRef.current = false;
      }
      if (source !== "url-auto") setInput(draft);
    } finally {
      submitInFlightRef.current = false;
    }
  }, [
    input,
    isBusy,
    mode,
    modelId,
    effectiveProjectId,
    project?.id,
    clearError,
    sendMessage,
  ]);

  const runSubmitRef = React.useRef(runSubmit);
  runSubmitRef.current = runSubmit;

  const handleFormSubmit = React.useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDebugSubmitted(true);
    setSubmitStatusLabel("Click detected");
    uiSubmitLog("create-ui", "form submit fired");
    submitDebug("create", "form submit fired");
    void runSubmitRef.current("form");
  }, []);

  const handleFormSubmitCapture = React.useCallback(() => {
    setSubmitStatusLabel("Click detected");
  }, []);

  const cleanAutostartUrl = React.useCallback(() => {
    if (!searchParams?.get("autostart")) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("autostart");
    next.delete("prompt");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname || "/create", { scroll: false });
  }, [pathname, router, searchParams]);

  React.useEffect(() => {
    if (!hydrated || !initialAutoStart || !initialPrompt.trim()) return;
    if (autoStartedRef.current) return;
    const storageKey = `dreamos_autostart:${initialPrompt.slice(0, 120)}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(storageKey) === "done") {
      return;
    }
    autoStartedRef.current = true;
    const timer = setTimeout(() => {
      cleanAutostartUrl();
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(storageKey, "done");
      }
      void runSubmitRef.current("url-auto").catch(() => {
        autoStartedRef.current = false;
        if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(storageKey);
        setAutoStartFailed("Could not start the build automatically. Check your connection and try again.");
      });
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot URL bootstrap
  }, [hydrated, initialAutoStart, initialPrompt, cleanAutostartUrl]);

  React.useEffect(() => {
    if (!hydrated) return;
    pushSubmitTrace("create", "Create composer mounted", { level: "ok" });
  }, [hydrated]);

  /** Native capture listeners — works even if React handlers fail to attach. */
  React.useEffect(() => {
    if (!hydrated) return;
    const btn = composerRootRef.current?.querySelector(
      "[data-create-build-btn]",
    ) as HTMLButtonElement | null;
    if (!btn) {
      pushSubmitTrace("create", "Build button missing from DOM — cannot wire click", {
        level: "error",
        error: "Build button not found. Try refreshing the page.",
      });
      return;
    }
    pushSubmitTrace("create", "Build button found — native listeners attached", { level: "ok" });

    const onPointerDown = () => {
      setDebugClicked(true);
      setSubmitStatusLabel("Pointer down detected");
      uiSubmitLog("create-ui", "build pointer down");
    };
    const onClick = () => {
      setDebugClicked(true);
      setSubmitStatusLabel("Click detected");
      uiSubmitLog("create-ui", "build click (native)");
      void runSubmitRef.current("button");
    };

    btn.addEventListener("pointerdown", onPointerDown, true);
    btn.addEventListener("click", onClick, true);
    return () => {
      btn.removeEventListener("pointerdown", onPointerDown, true);
      btn.removeEventListener("click", onClick, true);
    };
  }, [hydrated, mode]);

  const showEmpty = messages.length === 0 && !isBusy;
  const modeStyle = MODE_STYLE[mode];
  const lastAssistantText = React.useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    return last ? messageText(last) : "";
  }, [messages]);
  const parsedSourceFiles = React.useMemo(
    () => parseFencedFiles(lastAssistantText),
    [lastAssistantText],
  );
  const previewSrcDoc = React.useMemo(() => {
    const hit =
      parsedSourceFiles.find((f) => f.path === "preview/index.html") ??
      parsedSourceFiles.find((f) => /\.html?$/i.test(f.path));
    return hit?.content.trim() ? hit.content : null;
  }, [parsedSourceFiles]);
  const extractedCode = React.useMemo(() => extractFencedCode(lastAssistantText), [lastAssistantText]);
  const integrationSecretKeys = React.useMemo(
    () => (mode === "build" ? detectRequiredSecretNames(lastAssistantText) : []),
    [mode, lastAssistantText],
  );
  const tokensForPreview = mode === "build" ? calculateTokens(modelId, mode) : null;
  const plan = profile?.plan_id ?? "free";
  const showFreeWatermark = plan === "free";
  const generationActive = messages.length > 0 || isBusy;

  const tabBtn = (id: WorkspaceRightTab, label: string, Icon: typeof MonitorPlay, disabled?: boolean) => (
    <button
      key={id}
      type="button"
      disabled={disabled}
      onClick={() => setRightTab(id)}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition",
        disabled && "cursor-not-allowed opacity-40",
        !disabled && rightTab === id
          ? "bg-surface text-foreground shadow-sm ring-1 ring-border"
          : !disabled && "text-muted-foreground hover:bg-surface/80 hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" strokeWidth={1.75} />
      {label}
    </button>
  );

  return (
    <DropZone onFiles={onFiles} disabled={isBusy} className="flex h-screen w-full flex-col overflow-hidden">
      {debugEnabled && (
        <motion.div
          className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-center text-[11px] font-semibold text-amber-950 dark:text-amber-100"
          data-testid="create-build-bundle"
        >
          Create build bundle: {CREATE_BUILD_BUNDLE}
        </motion.div>
      )}
      <WorkspaceLauncher
        project={
          effectiveProject
            ? {
                id: effectiveProject.id,
                name: effectiveProject.name,
                icon_url: effectiveProject.icon_url,
                gradient: effectiveProject.gradient,
                preview_url: effectiveProject.preview_url,
                metadata: effectiveProject.metadata,
                status: effectiveProject.status,
              }
            : null
        }
        generationActive={generationActive}
        isBusy={isBusy}
        planId={profile?.plan_id}
        onRightTab={setRightTab}
        onAppSection={() => {
          /* menu item ids logged via toast in launcher for future routes */
        }}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-[38%] min-w-[300px] max-w-[480px] flex-col min-h-0 overflow-hidden border-r border-border/50">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 bg-background/60 px-2.5 backdrop-blur-sm">
            <ModeSwitch value={mode} onChange={setMode} />
            {modeStyle.badge && (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", modeStyle.badge.color)}>
                {modeStyle.badge.label}
              </span>
            )}
          </div>

          <div
            ref={scrollRef}
            onScroll={onChatScroll}
            className={cn(
              "min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]",
              mode === "build" && "bg-gradient-to-b from-accent/[0.04] to-transparent",
            )}
          >
            <div className="space-y-3 px-3 py-4">
              {showEmpty && (
                <div className="flex flex-col items-center pt-4 text-center sm:pt-6">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent/30 to-accent/10">
                    <Zap className="size-4 text-accent" strokeWidth={1.75} />
                  </div>
                  <p className="mt-2 text-[13px] font-semibold text-foreground">
                    {mode === "build" ? "Start your build" : "How can we help?"}
                  </p>
                  <p className="mt-0.5 max-w-[240px] text-[11.5px] text-muted-foreground">{MODE_META[mode].description}</p>
                </div>
              )}

              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    userAvatar={profile?.avatar_url ?? null}
                    userName={resolveDisplayName(profile, user)}
                    streaming={isBusy && i === messages.length - 1 && m.role === "assistant"}
                    mode={mode}
                  />
                ))}
              </AnimatePresence>

              {isBusy && messages[messages.length - 1]?.role === "user" && (
                <MessageBubble
                  message={{ id: "pending", role: "assistant", parts: [{ type: "text", text: "" }] } satisfies UIMessage}
                  userName="DreamOS86"
                  streaming
                  mode={mode}
                />
              )}

              {isBusy && (
                <BuildStatusNarrator
                  isStreaming={isBusy}
                  activeStep={taskProgressIndex(
                    lastAssistantText.length,
                    parseBuildPlanCard(lastAssistantText).taskLabels.length || 6,
                  )}
                  className="mt-1"
                />
              )}

              {creditError && (
                <div className="overflow-hidden rounded-xl bg-gradient-to-br from-background via-surface to-background shadow-[0_4px_16px_-4px_rgba(0,0,0,0.3)] ring-1 ring-border/80">
                  <div className="h-[2px] w-full bg-gradient-to-r from-violet-600 via-accent to-sky-500" />
                  <div className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20">
                        <Zap className="size-4 text-accent" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-foreground">You&apos;re out of credits</p>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                          All monthly credits are used{resetAt ? `. They reset after ${new Date(resetAt).toLocaleDateString()}.` : "."} Upgrade to keep
                          building.
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Link
                        href="/pricing"
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-accent to-violet-500 px-3 py-2 text-center text-[12px] font-semibold text-white shadow-[0_4px_12px_-2px_hsl(var(--accent)/0.4)] transition hover:opacity-90"
                      >
                        <Zap className="size-3" strokeWidth={2} />
                        Upgrade to {nextPlanLabel}
                      </Link>
                      <button
                        type="button"
                        onClick={() => setCreditError(false)}
                        className="rounded-xl bg-surface px-3 py-2 text-[12px] font-medium text-muted-foreground ring-1 ring-border transition hover:bg-surface-raised"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {error && !creditError && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive ring-1 ring-destructive/20">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                  <div className="flex-1">
                    <p className="font-semibold">Generation failed</p>
                    <p className="mt-0.5 opacity-90">{error.message ?? "Try again."}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      clearError();
                      regenerate();
                    }}
                    className="shrink-0 rounded bg-destructive/15 px-2 py-1 text-[10.5px] font-semibold"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>

          <div
            ref={composerRootRef}
            className="relative z-30 shrink-0 border-t border-border/50 bg-background/85 px-2.5 pb-3 pt-2 backdrop-blur-md"
          >
            {showUpgradeCard && !creditError && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-accent/25 bg-gradient-to-r from-accent/[0.07] to-violet-500/[0.05] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground">Build is paused — no credits left</p>
                  <p className="text-[10.5px] text-muted-foreground">Upgrade to unlock more monthly credits.</p>
                </div>
                <Link
                  href="/pricing"
                  className="shrink-0 rounded-lg bg-accent px-2.5 py-1.5 text-[10.5px] font-bold text-white shadow-sm"
                >
                  Upgrade to {nextPlanLabel}
                </Link>
              </div>
            )}
            <AttachmentRail attachments={attachments} onRemove={removeAttachment} className="mb-1.5" />
            {submitBlocker && (
              <div className="mb-2 flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                <motion.div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
                  <p>{submitBlocker}</p>
                </motion.div>
                {lastApiStatus?.includes("blocked:auth") && (
                  <Link
                    href={`/auth/login?next=${encodeURIComponent(authReturnTo)}`}
                    className="inline-flex w-fit rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            )}
            {editNeedsApp && mode === "edit" && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-100"
              >
                Edit mode needs an app. Switch to Build to create one, or open an existing project.
              </motion.div>
            )}
            <form
              ref={formRef}
              data-testid="create-composer-form"
              className={cn("relative z-10 rounded-xl", modeStyle.composerWrap)}
              onSubmitCapture={handleFormSubmitCapture}
              onSubmit={handleFormSubmit}
            >
              <div className="flex items-center gap-2 border-b border-border/50 px-2.5 py-1">
                <ModelPicker value={modelId} onChange={setModelId} disabled={isBusy} />
              </div>
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  submitDebug("create", "input changed", { len: e.target.value.length });
                }}
                onPaste={(e) => applyComposerPaste(e, input, setInput)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    uiSubmitLog("create-ui", "enter submit");
                    submitDebug("create", "enter pressed");
                    formRef.current?.requestSubmit();
                  }
                }}
                rows={2}
                placeholder={
                  mode === "build"
                    ? "Describe what to build…"
                    : mode === "discuss"
                      ? "Ask anything…"
                      : "Describe the change…"
                }
                disabled={isBusy}
                spellCheck
                className={cn(
                  composerTextareaClass,
                  "px-3 pb-1 pt-2.5 text-[13px] leading-relaxed",
                )}
              />
              <div className="flex items-center gap-1.5 px-2 pb-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={isBusy}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background hover:text-foreground disabled:opacity-40"
                >
                  <Paperclip className="size-3.5" strokeWidth={1.75} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && onFiles(Array.from(e.target.files))}
                />
                <button
                  type="button"
                  data-create-build-btn
                  data-testid="create-build-button"
                  aria-busy={isBusy || undefined}
                  onPointerDownCapture={() => {
                    setDebugClicked(true);
                    setSubmitStatusLabel("Pointer down detected");
                    uiSubmitLog("create-ui", "build pointer down");
                    submitDebug("create", "button pointer down");
                  }}
                  onClickCapture={() => {
                    setSubmitStatusLabel("Click detected");
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDebugClicked(true);
                    setSubmitStatusLabel("Click detected");
                    uiSubmitLog("create-ui", "build click");
                    submitDebug("create", "button click");
                    void runSubmitRef.current("button");
                  }}
                  className={cn(
                    "relative z-[60] ml-auto flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition pointer-events-auto active:scale-[0.98]",
                    isBusy
                      ? "bg-muted/80 text-muted-foreground"
                      : mode === "build"
                        ? "bg-gradient-to-r from-accent to-violet-500 text-white shadow-[0_4px_14px_-4px_rgba(30,107,255,0.5)] hover:opacity-90"
                        : "bg-accent text-white hover:bg-accent/90",
                  )}
                >
                  {isBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ArrowUp className="size-3.5" strokeWidth={2.25} />
                  )}
                  {isBusy ? "…" : mode === "build" ? "Build" : "Send"}
                </button>
              </div>
            </form>
            {debugEnabled && (
              <>
                <p
                  data-testid="create-submit-status"
                  className={cn(
                    "mt-2 rounded-lg border px-2.5 py-2 text-[12px] font-semibold",
                    submitStatusLabel.startsWith("Failed")
                      ? "border-destructive/50 bg-destructive/10 text-destructive"
                      : "border-border bg-surface text-foreground",
                  )}
                >
                  {submitStatusLabel}
                </p>
                <SubmitPipelinePanel channel="create" inputLen={input.length} mode={mode} />
              </>
            )}
            {autoStartFailed && (
              <div className="mb-2 flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                <p>{autoStartFailed}</p>
                <button
                  type="button"
                  onClick={() => {
                    setAutoStartFailed(null);
                    void runSubmitRef.current("button");
                  }}
                  className="w-fit rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  Retry build
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-atmosphere">
          <div className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-background/75 px-2 py-1.5 backdrop-blur-md">
            {tabBtn("preview", "Preview", MonitorPlay)}
            {tabBtn("dashboard", "Dashboard", LayoutGrid, !effectiveProject?.id)}
            {tabBtn("code", "Code", Code2)}
          </div>
          {effectiveProject?.id && integrationSecretKeys.length > 0 && (
            <div className="shrink-0 border-b border-border/60 bg-background/90 px-2 py-2">
              <IntegrationSecretsPanel projectId={effectiveProject.id} requiredKeys={integrationSecretKeys} />
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            {rightTab === "preview" && (
              <PreviewPanel
                url={effectiveProject?.preview_url ?? null}
                srcDoc={previewSrcDoc}
                appName={effectiveProject?.name ?? null}
                thinking={isBusy}
                editMode={mode === "edit"}
                hasGenerated={
                  !!effectiveProject?.preview_url ||
                  !!previewSrcDoc ||
                  parsedSourceFiles.length > 0
                }
                buildAssistantText={lastAssistantText}
                tokensEstimate={tokensForPreview}
                onEditTarget={(info) => {
                  setInput(`[Targeting: ${info.section}] `);
                  const el = document.querySelector("textarea");
                  el?.focus();
                }}
              />
            )}
            {rightTab === "dashboard" && effectiveProject?.id && (
              <AppDashboardPanel project={effectiveProject} isBusy={isBusy} />
            )}
            {rightTab === "code" && (
              <CodeRightPanel files={parsedSourceFiles} fallbackText={extractedCode} />
            )}
          </div>
        </div>
      </div>

      {showFreeWatermark && (
        <div
          className="pointer-events-none fixed bottom-3 right-3 z-[5000] select-none rounded-lg bg-foreground/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-background shadow-md backdrop-blur-sm"
          aria-hidden
        >
          DreamOS86
        </div>
      )}
    </DropZone>
  );
}
