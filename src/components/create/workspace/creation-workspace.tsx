"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import {
  ArrowUp,
  Paperclip,
  Loader2,
  RotateCcw,
  AlertCircle,
  PanelRightOpen,
  PanelRightClose,
  Zap,
  Sparkles,
  X,
  ArrowRight,
  CheckCircle2,
  Code2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCreditsStore } from "@/lib/stores/credits-store";
import { createClient } from "@/lib/supabase/client";

import {
  DEFAULT_MODEL_ID,
  MODE_META,
  type CreationMode,
} from "@/lib/creation/models";
import { calculateCredits } from "@/lib/credits/cost-engine";
import { ModelPicker } from "@/components/create/workspace/model-picker";
import {
  ModeSwitch,
  type EditScope,
} from "@/components/create/workspace/mode-switch";
import {
  AttachmentRail,
  DropZone,
  type Attachment,
} from "@/components/create/workspace/attachment-rail";
import { PreviewPanel } from "@/components/create/workspace/preview-panel";
import { WorkspaceLauncher, type WorkspaceRightTab } from "@/components/create/workspace/workspace-launcher";
import { AgentPhases } from "@/components/create/workspace/agent-phases";
import { BuildTimeline } from "@/components/create/workspace/build-timeline";
import { BuildStatusNarrator } from "@/components/create/workspace/build-status-narrator";
import { AppDashboardPanel } from "@/components/create/workspace/app-dashboard-panel";
import { DreamOS86BrandIcon } from "@/components/brand/dreamos86-brand-icon";
import { extractFencedCode } from "@/lib/creation/extract-fenced-code";
import { toast } from "@/lib/toast";

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

/** Minimal project row for `AppDashboardPanel` when only URL context is hydrated. */
function projectForDashboard(project: { id: string; name: string; previewUrl: string | null }) {
  return {
    id: project.id,
    name: project.name,
    status: "draft" as const,
    preview_url: project.previewUrl,
    custom_domain: null as string | null,
    framework: "—",
    gradient: "from-accent to-violet-600",
    metadata: {},
    is_public: false,
  };
}

// ─── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({
  message,
  userAvatar,
  userName,
  streaming,
  mode,
}: {
  message: UIMessage;
  userAvatar?: string | null;
  userName: string;
  streaming?: boolean;
  mode: CreationMode;
}) {
  const isUser = message.role === "user";
  const text = messageText(message);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={cn("group flex gap-3", isUser && "flex-row-reverse")}
    >
      <div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border">
        {isUser ? (
          userAvatar ? (
            <Image
              src={userAvatar}
              alt={userName}
              width={28}
              height={28}
              className="size-full object-cover"
              unoptimized
            />
          ) : (
            <span className="text-[10px] font-semibold text-foreground">
              {userName.slice(0, 1).toUpperCase()}
            </span>
          )
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-accent/30 to-accent/10">
            <Sparkles className="size-3.5 text-accent" strokeWidth={1.75} />
          </div>
        )}
      </div>

      {isUser ? (
        <div className="min-w-0 max-w-[78%] rounded-2xl bg-accent px-4 py-2.5 text-[13.5px] leading-relaxed text-white">
          {text}
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          {!text ? (
            <div className="rounded-2xl bg-surface px-4 py-2.5 text-[13.5px] leading-relaxed text-muted-foreground ring-1 ring-border">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                Building your app…
              </span>
            </div>
          ) : (
            <AgentPhases text={text} streaming={streaming} suppressCode={mode === "build"} />
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Mode style map ───────────────────────────────────────────────────────────

const MODE_STYLE = {
  discuss: {
    topbar: "border-border/60",
    composerRing: "ring-border focus-within:ring-accent/30",
    badge: null,
  },
  edit: {
    topbar: "border-amber-500/20",
    composerRing: "ring-amber-500/20 focus-within:ring-amber-400/40",
    badge: { label: "Surgical Edit", color: "bg-amber-500/10 text-amber-600 ring-amber-500/25" },
  },
  build: {
    topbar: "border-violet-500/25",
    composerRing: "ring-violet-500/25 focus-within:ring-violet-400/50",
    badge: { label: "Full Build", color: "bg-violet-500/10 text-violet-600 ring-violet-500/25" },
  },
} satisfies Record<string, { topbar: string; composerRing: string; badge: { label: string; color: string } | null }>;

// ─── Out-of-tokens card ───────────────────────────────────────────────────────

const PLAN_META: Record<string, { name: string; quota: number; nextPlan: string; nextPrice: number; nextCredits: string }> = {
  free:     { name: "Free",     quota: 100,   nextPlan: "Starter", nextPrice: 20,  nextCredits: "1,000" },
  starter:  { name: "Starter",  quota: 1_000, nextPlan: "Pro",     nextPrice: 50,  nextCredits: "2,500" },
  pro:      { name: "Pro",      quota: 2_500, nextPlan: "Infinity",nextPrice: 100, nextCredits: "5,000+" },
  infinity: { name: "Infinity", quota: 5_000, nextPlan: "Infinity",nextPrice: 200, nextCredits: "10,000+" },
};

const UPGRADE_PERKS: Record<string, string[]> = {
  free:     ["Manual model selection", "Edit & Build modes", "Custom domains", "10× more credits", "Priority generation"],
  starter:  ["All frontier models", "Advanced AI generation", "Advanced analytics", "API access", "5 collaborators"],
  pro:      ["Dedicated compute", "Enterprise scale", "White-label", "Custom SLAs", "SSO / SAML"],
  infinity: ["Custom SLAs expansion", "Dedicated runtime", "Priority infra"],
};

function OutOfCreditsCard({
  planId,
  totalUsed,
  resetAt,
  onDismiss,
}: {
  planId: string;
  totalUsed: number;
  resetAt: string | null;
  onDismiss: () => void;
}) {
  const meta = PLAN_META[planId] ?? PLAN_META.free;
  const perks = UPGRADE_PERKS[planId] ?? UPGRADE_PERKS.free;
  const daysLeft = resetAt
    ? Math.max(0, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 86_400_000))
    : null;
  const hoursLeft = resetAt
    ? Math.max(0, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 3_600_000))
    : null;
  const usedPct = Math.min(100, Math.round((totalUsed / meta.quota) * 100));
  const resetLabel = daysLeft !== null
    ? daysLeft === 0 && hoursLeft !== null
      ? hoursLeft <= 1 ? "in less than 1 hour" : `in ${hoursLeft}h`
      : daysLeft === 1 ? "tomorrow"
      : `in ${daysLeft} days`
    : "next month";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="relative mt-4 overflow-hidden rounded-2xl bg-background ring-1 ring-border shadow-[0_12px_48px_-12px_rgba(0,0,0,0.45)]"
    >
      {/* Ambient gradient bg */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/[0.04] via-transparent to-violet-500/[0.04] pointer-events-none" />
      {/* Top accent stripe */}
      <div className="h-[3px] w-full bg-gradient-to-r from-amber-500 via-accent to-violet-600" />

      <div className="relative px-5 pt-5 pb-5 space-y-4">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-accent/20 ring-1 ring-amber-500/30">
              <Zap className="size-5 text-amber-500" strokeWidth={2} />
              <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">!</span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-bold text-foreground tracking-tight">You&apos;re out of credits</p>
                <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-500/25 dark:text-amber-400">
                  {meta.name} plan
                </span>
              </div>
              <p className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">
                All <span className="font-semibold text-foreground">{meta.quota.toLocaleString()} credits</span> used this month.
                {" "}Credits refill {resetLabel}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground/40 transition hover:bg-surface hover:text-muted-foreground"
            aria-label="Dismiss"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </div>

        {/* Token usage meter */}
        <div className="rounded-xl bg-surface/70 px-4 py-3 ring-1 ring-border/60 space-y-2">
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="font-medium text-muted-foreground">Credits used this period</span>
            <span className="tabular-nums font-bold text-foreground">
              {totalUsed.toLocaleString()} <span className="font-normal text-muted-foreground">/ {meta.quota.toLocaleString()}</span>
            </span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-border/50">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${usedPct}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-accent"
            />
          </div>
          <p className="text-[10.5px] text-muted-foreground/60 flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-amber-500/60 inline-block" />
            Credits reset {resetLabel}. Current plan: {meta.name}.
          </p>
        </div>

        {/* Upgrade plan highlight */}
        <div>
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/50">
            Upgrade for instant access
          </p>
          <div className="rounded-2xl bg-gradient-to-br from-accent/10 via-background to-violet-500/10 px-4 py-4 ring-1 ring-accent/25">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <Sparkles className="size-3.5 text-accent" strokeWidth={2} />
                  <p className="text-[15px] font-bold tracking-tight text-foreground">{meta.nextPlan}</p>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{meta.nextCredits} credits</span> per month
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[26px] font-black tracking-tight text-foreground leading-none">
                  ${meta.nextPrice}
                </p>
                <p className="text-[10.5px] text-muted-foreground">/ month</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {perks.slice(0, 4).map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10.5px] font-medium text-accent ring-1 ring-accent/15"
                >
                  <CheckCircle2 className="size-2.5" strokeWidth={2.5} />
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex items-stretch gap-2">
          <Link
            href="/pricing"
            className="group relative flex-1 overflow-hidden rounded-2xl bg-gradient-to-r from-accent to-violet-600 px-5 py-3 text-center text-[13.5px] font-bold text-white shadow-[0_6px_20px_-4px_hsl(var(--accent)/0.5)] transition hover:shadow-[0_8px_28px_-4px_hsl(var(--accent)/0.65)] hover:scale-[1.01] active:scale-[0.99]"
          >
            <span className="relative flex items-center justify-center gap-2">
              <Sparkles className="size-4" strokeWidth={2} />
              Upgrade to {meta.nextPlan}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
            </span>
          </Link>
          <Link
            href="/pricing"
            className="flex items-center gap-1.5 rounded-2xl px-4 text-[12px] font-medium text-muted-foreground ring-1 ring-border transition hover:bg-surface hover:text-foreground hover:ring-accent/30"
          >
            All plans
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface CreationWorkspaceProps {
  /** Initial prompt prefill (e.g. from a template URL param) */
  initialPrompt?: string;
  /** Optional existing project context — drives preview iframe + scope */
  project?: {
    id: string;
    name: string;
    previewUrl: string | null;
  } | null;
}

export function CreationWorkspace({
  initialPrompt = "",
  project = null,
}: CreationWorkspaceProps) {
  const supabase = createClient();
  const { profile } = useAuthStore();
  const { deductOptimistic, remaining, isConfirmed, totalUsedThisPeriod, resetAt } = useCreditsStore();

  // ─── UI state ───────────────────────────────────────────────────────────────
  const [input, setInput] = React.useState(initialPrompt);
  const [mode, setMode] = React.useState<CreationMode>("discuss");
  const [modelId, setModelId] = React.useState(DEFAULT_MODEL_ID);
  const [scope, setScope] = React.useState<EditScope | null>(null);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [showPreview, setShowPreview] = React.useState(true);
  const [creditError, setCreditError] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  // Panel mode: "preview" or "project" (stats for this build — app-wide hub is /dashboard)
  const [panelMode, setPanelMode] = React.useState<"preview" | "dashboard" | "code">("preview");

  const fileRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const conversationIdRef = React.useRef<string | null>(null);
  conversationIdRef.current = conversationId;

  // ─── Chat transport ─────────────────────────────────────────────────────────
  const modeRef = React.useRef(mode);
  const scopeRef = React.useRef<EditScope | null>(scope);
  modeRef.current = mode;
  scopeRef.current = scope;

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        fetch: async (reqInput, init) => {
          const res = await globalThis.fetch(reqInput as RequestInfo, init);
          if (res.status === 402) {
            setCreditError(true);
          } else if (res.ok) {
            setCreditError(false);
            // Use profitability-validated credit cost (3x margin guaranteed)
            const creditCost = calculateCredits(modelId, modeRef.current);
            deductOptimistic(creditCost);
          }
          return res;
        },
        prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
          body: {
            ...(body ?? {}),
            id,
            messages,
            trigger,
            messageId,
            modelId,
            mode: modeRef.current,
            scope: scopeRef.current,
            projectId: project?.id,
            conversationId: conversationIdRef.current ?? undefined,
          },
        }),
      }),
    [modelId, deductOptimistic, project?.id],
  );

  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
    clearError,
    regenerate,
  } = useChat({ transport });

  const isBusy = status === "submitted" || status === "streaming";

  const lastAssistantText = React.useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    return last ? messageText(last) : "";
  }, [messages]);

  const codePaneText = React.useMemo(() => extractFencedCode(lastAssistantText), [lastAssistantText]);

  const launcherProject = project
    ? {
        id: project.id,
        name: project.name,
        icon_url: null as string | null,
        gradient: "from-accent to-violet-600",
        preview_url: project.previewUrl,
        metadata: null as unknown,
      }
    : null;

  const generationActive = isBusy || messages.length > 0;

  // Auto-scroll to bottom on new tokens
  React.useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isBusy]);

  // ─── Conversation creation (real Supabase row) ──────────────────────────────
  async function ensureConversation(firstMessage: string): Promise<string | null> {
    if (conversationIdRef.current) return conversationIdRef.current;
    if (!profile?.id) return null;
    const title = firstMessage.slice(0, 80) || "New conversation";
    const { data, error: insertErr } = await supabase
      .from("conversations")
      .insert({ user_id: profile.id, title, model_id: modelId, project_id: null, mode: null })
      .select("id")
      .single();
    if (insertErr || !data) return null;
    conversationIdRef.current = data.id;
    setConversationId(data.id);
    return data.id;
  }

  // ─── Attachment handling ────────────────────────────────────────────────────
  const onFiles = React.useCallback((files: File[]) => {
    const next: Attachment[] = files.map((f) => {
      const isImage = f.type.startsWith("image/");
      const isZip = /\.zip$/i.test(f.name) || f.type === "application/zip";
      return {
        id: newAttachmentId(),
        kind: isImage ? "image" : isZip ? "zip" : "file",
        name: f.name,
        file: f,
        previewUrl: isImage ? URL.createObjectURL(f) : undefined,
        size: f.size,
        status: "ready",
      };
    });
    setAttachments((prev) => [...prev, ...next]);
  }, []);

  const removeAttachment = React.useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  // Cleanup object URLs on unmount
  React.useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Submit ────────────────────────────────────────────────────────────────
  async function submit() {
    const text = input.trim();
    if (!text || isBusy) return;

    // Credit gate — only block if the server has confirmed credits are exhausted.
    // While `isConfirmed` is false the store holds the default free-plan quota,
    // so we never block a user who simply hasn't synced yet.
    if (isConfirmed && remaining <= 0) {
      setCreditError(true);
      return;
    }

    let composed = text;

    // Attachments: include real names + sizes. Binary content is not uploaded
    // — be explicit so the model doesn't pretend it can read files yet.
    if (attachments.length > 0) {
      const list = attachments
        .map((a) => `- ${a.kind}: ${a.name}${a.size ? ` (${a.size} bytes)` : ""}`)
        .join("\n");
      composed = `${composed}\n\nThe user attached ${attachments.length} item(s):\n${list}\n\n(Binary content is not yet uploaded to the server — confirm with the user before writing code that depends on file contents.)`;
    }

    setInput("");
    await ensureConversation(text);

    sendMessage({
      role: "user",
      parts: [{ type: "text", text: composed }],
    });

    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);
  }

  function startFresh() {
    setMessages([]);
    setInput("");
    setAttachments([]);
    setConversationId(null);
    conversationIdRef.current = null;
    clearError();
    setCreditError(false);
  }

  const userName =
    profile?.full_name ?? profile?.email?.split("@")[0] ?? "You";
  const userAvatar = profile?.avatar_url ?? null;
  const showEmpty = messages.length === 0 && !isBusy;
  const modeStyle = MODE_STYLE[mode];

  // Show build timeline when build mode is active and we have content
  const showBuildTimeline = mode === "build" && (isBusy || lastAssistantText.length > 0);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <DropZone
      onFiles={onFiles}
      disabled={isBusy}
      className="flex h-[calc(100vh-3.5rem)] w-full flex-col overflow-hidden"
    >
      {/* Workspace header — WorkspaceName / AppName breadcrumb */}
      <WorkspaceLauncher
        project={launcherProject}
        generationActive={generationActive}
        isBusy={isBusy}
        planId={profile?.plan_id}
        onRightTab={(t: WorkspaceRightTab) => {
          if (!showPreview) setShowPreview(true);
          if (t === "preview") setPanelMode("preview");
          if (t === "dashboard") setPanelMode("dashboard");
          if (t === "code") setPanelMode("code");
        }}
        onAppSection={(section) => {
          if (section === "overview") {
            if (!showPreview) setShowPreview(true);
            setPanelMode("dashboard");
            return;
          }
          toast.info("Open your app in the main create workspace for full management features.");
        }}
      />

      {/* Horizontal split: timeline + chat + preview */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

      {/* BUILD TIMELINE sidebar (left, build mode only) */}
      <AnimatePresence initial={false}>
        {showBuildTimeline && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 200, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="hidden shrink-0 overflow-hidden border-r border-violet-500/15 bg-atmosphere xl:flex"
          >
            <div className="p-3 pt-4 w-full">
              <BuildTimeline
                streamingText={lastAssistantText}
                isStreaming={isBusy}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CENTER: chat column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top control bar — minimal */}
        <div className={cn("flex h-11 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-xl", modeStyle.topbar)}>
          <ModeSwitch value={mode} onChange={setMode} />
          {/* Mode badge */}
          {modeStyle.badge && (
            <motion.span
              key={mode}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "hidden items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 sm:inline-flex",
                modeStyle.badge.color,
              )}
            >
              <Zap className="size-2.5" strokeWidth={2.5} />
              {modeStyle.badge.label}
            </motion.span>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              aria-label={showPreview ? "Hide preview" : "Show preview"}
              onClick={() => setShowPreview((v) => !v)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground/60 transition hover:bg-surface hover:text-foreground"
            >
              {showPreview ? (
                <PanelRightClose className="size-4" strokeWidth={1.65} />
              ) : (
                <PanelRightOpen className="size-4" strokeWidth={1.65} />
              )}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className={cn("relative flex-1 overflow-y-auto", mode === "build" && "bg-gradient-to-b from-violet-500/[0.03] to-transparent")}>
          <div className="mx-auto max-w-3xl px-4 py-6">
            {showEmpty ? <EmptyHero mode={mode} setInput={setInput} /> : null}

            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((m, i) => {
                  const isLast = i === messages.length - 1;
                  return (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      userAvatar={userAvatar}
                      userName={userName}
                      mode={mode}
                      streaming={isBusy && isLast && m.role === "assistant"}
                    />
                  );
                })}
              </AnimatePresence>

              {isBusy && messages[messages.length - 1]?.role === "user" && (
                <MessageBubble
                  message={{
                    id: "pending",
                    role: "assistant",
                    parts: [{ type: "text", text: "" }],
                  } satisfies UIMessage}
                  userName={userName}
                  mode={mode}
                  streaming
                />
              )}
            </div>

            {/* Live build status */}
            {isBusy && messages[messages.length - 1]?.role === "user" && (
              <BuildStatusNarrator isStreaming={isBusy} className="mt-1" />
            )}

            {/* Out-of-credits upgrade card */}
            {creditError && (
              <OutOfCreditsCard
                planId={profile?.plan_id ?? "free"}
                totalUsed={totalUsedThisPeriod}
                resetAt={resetAt}
                onDismiss={() => setCreditError(false)}
              />
            )}
            {error && !creditError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive ring-1 ring-destructive/20">
                <AlertCircle className="size-4 shrink-0" strokeWidth={1.75} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Generation failed</p>
                  <p className="mt-0.5 break-words opacity-90">
                    {error.message ?? "Try again or pick a different model."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearError();
                    regenerate();
                  }}
                  className="flex shrink-0 items-center gap-1 rounded bg-destructive/15 px-2 py-1 text-[11.5px] font-semibold text-destructive transition hover:bg-destructive/20"
                >
                  <RotateCcw className="size-3" strokeWidth={2} />
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t border-border/60 bg-background/90 px-3 py-3 backdrop-blur-xl">
          <div className="mx-auto max-w-3xl">
            <AttachmentRail
              attachments={attachments}
              onRemove={removeAttachment}
              className="mb-2"
            />

            <div className={cn("rounded-2xl bg-surface ring-1 focus-within:ring-2 transition-[ring-color]", modeStyle.composerRing)}>
              {/* Model selector row */}
              <div className="flex items-center gap-2 border-b border-border/50 px-3 py-1.5">
                <ModelPicker value={modelId} onChange={setModelId} disabled={isBusy} />
                {mode === "build" && (
                  <span className="text-[11px] text-accent/80 font-medium">
                    Full system generation
                  </span>
                )}
                {mode === "edit" && (
                  <span className="text-[11px] text-amber-600/80 font-medium">
                    Click the preview to target a section
                  </span>
                )}
              </div>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={3}
                placeholder={
                  mode === "discuss"
                    ? "Describe what you're thinking. Plan, explore, or diagnose…"
                    : mode === "build"
                      ? "Describe the app you want. DreamOS86 builds routes, backend, UI, and runtime…"
                      : scope
                        ? `Describe the change to the ${scope}…`
                        : "Pick a scope, then describe the change…"
                }
                disabled={isBusy}
                className="w-full resize-none bg-transparent px-4 pb-1 pt-3 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
              />

              <div className="flex items-center gap-2 px-2 pb-2 pt-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={isBusy}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background hover:text-foreground disabled:opacity-50"
                  aria-label="Attach files"
                >
                  <Paperclip className="size-4" strokeWidth={1.65} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) onFiles(Array.from(e.target.files));
                    e.target.value = "";
                  }}
                />

                <button
                  type="button"
                  onClick={submit}
                  disabled={isBusy || !input.trim()}
                  className={cn(
                    "ml-auto flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold transition",
                    isBusy || !input.trim()
                      ? "bg-muted text-muted-foreground"
                      : mode === "build"
                        ? "bg-gradient-to-r from-accent to-violet-500 text-white shadow-[0_4px_20px_-4px_rgba(30,107,255,0.5)] hover:opacity-90 active:scale-[0.98]"
                        : "bg-accent text-white shadow-[0_4px_14px_-4px_rgba(30,107,255,0.45)] hover:bg-accent/90 active:scale-[0.98]",
                  )}
                >
                  {isBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ArrowUp className="size-3.5" strokeWidth={2.25} />
                  )}
                  {isBusy ? (mode === "build" ? "Building…" : "Streaming…") : mode === "build" ? "Build" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: preview + project panel */}
      <AnimatePresence initial={false}>
        {showPreview && (
          <motion.aside
            key="preview"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 540, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="hidden shrink-0 flex-col overflow-hidden border-l border-border bg-atmosphere lg:flex"
          >
            {/* Preview | Dashboard | Code */}
            {messages.length > 0 && (
              <div className="flex shrink-0 items-center gap-1 border-b border-border/60 bg-background/70 px-3 py-1.5 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setPanelMode("preview")}
                  className={cn(
                    "rounded-lg px-3 py-1 text-[12px] font-medium transition",
                    panelMode === "preview"
                      ? "bg-surface text-foreground ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setPanelMode("dashboard")}
                  className={cn(
                    "rounded-lg px-3 py-1 text-[12px] font-medium transition",
                    panelMode === "dashboard"
                      ? "bg-surface text-foreground ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => setPanelMode("code")}
                  className={cn(
                    "rounded-lg px-3 py-1 text-[12px] font-medium transition",
                    panelMode === "code"
                      ? "bg-surface text-foreground ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Code
                </button>
              </div>
            )}

            {/* Panel content */}
            <div className="min-h-0 flex-1 overflow-hidden">
              <AnimatePresence mode="wait" initial={false}>
                {panelMode === "preview" || messages.length === 0 ? (
                  <motion.div
                    key="preview-pane"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="h-full p-3"
                  >
                    <PreviewPanel
                      url={project?.previewUrl ?? null}
                      appName={project?.name ?? null}
                      thinking={isBusy}
                      editMode={mode === "edit"}
                      hasGenerated={messages.length > 0 && !!project?.previewUrl}
                      onEditTarget={(info) => {
                        setInput(`[Targeting: ${info.section}] `);
                        const el = document.querySelector("textarea");
                        el?.focus();
                      }}
                    />
                  </motion.div>
                ) : panelMode === "dashboard" ? (
                  <motion.div
                    key="dashboard-pane"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="h-full overflow-y-auto"
                  >
                    <AppDashboardPanel project={project ? projectForDashboard(project) : null} isBusy={isBusy} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="code-pane"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex h-full flex-col"
                  >
                    {codePaneText.trim() ? (
                      <pre className="h-full overflow-auto p-4 text-[11px] leading-relaxed text-foreground [scrollbar-gutter:stable]">
                        {codePaneText}
                      </pre>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                        <Code2 className="size-8 text-muted-foreground/40" strokeWidth={1.25} />
                        <p className="text-[13px] font-medium text-foreground">No code blocks yet</p>
                        <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">
                          Fenced source from the assistant stream appears here. Plain explanations stay in the chat.
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      </div>{/* end horizontal split */}
    </DropZone>
  );
}

// ─── Empty hero ───────────────────────────────────────────────────────────────

function EmptyHero({
  mode,
  setInput,
}: {
  mode: CreationMode;
  setInput: (v: string) => void;
}) {
  const seeds =
    mode === "build"
      ? [
          "Create a finance tracking app with AI insights, charts, and recurring subscription billing.",
          "Build a motivational gym app with daily streaks, challenges, leaderboards, and social sharing.",
          "Create a premium meditation app with calming animations, breathing exercises, and daily routines.",
          "Build an AI-powered real estate CRM with property tracking, lead automation, and client portals.",
          "Create a restaurant ordering platform with real-time kitchen updates, menus, and loyalty rewards.",
          "Build a SaaS project management tool with boards, timelines, sprints, and team collaboration.",
        ]
      : mode === "discuss"
        ? [
            "How should I architect a multi-tenant SaaS with team management and role-based access?",
            "What's the best way to add real-time features like live notifications and collaborative editing?",
            "Help me plan the database schema for an e-commerce platform with inventory and orders.",
            "What tech stack should I use for a mobile-first social app with millions of users?",
          ]
        : [
            "Make the hero section more immersive with a gradient animation and bold typography.",
            "Add Google and GitHub OAuth to the auth flow with a polished sign-in screen.",
            "Create a beautiful onboarding flow with progress steps and animated transitions.",
            "Redesign the dashboard cards with depth, hover effects, and real-time data.",
          ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto max-w-2xl py-10 text-center"
    >
      <div className="mx-auto mb-5 flex size-14 items-center justify-center">
        <DreamOS86BrandIcon size={56} priority />
      </div>
      <h1 className="text-[26px] font-semibold tracking-[-0.04em] text-foreground">
        {mode === "discuss"
          ? "What are we building today?"
          : mode === "build"
            ? "Describe the app you want."
            : "What should I edit?"}
      </h1>
      <p className="mt-2 text-[14px] text-muted-foreground">
        {MODE_META[mode].description}
      </p>

      <div className={cn(
        "mt-6 grid gap-2 text-left",
        mode === "build" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 sm:grid-cols-2",
      )}>
        {seeds.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setInput(s)}
            className="group rounded-xl bg-surface px-3 py-2.5 text-left text-[12.5px] text-foreground ring-1 ring-border transition hover:bg-surface-raised hover:ring-accent/30"
          >
            <span className="line-clamp-2 text-muted-foreground transition group-hover:text-foreground">
              {s}
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}