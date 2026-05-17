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
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCreditsStore } from "@/lib/stores/credits-store";
import { createClient } from "@/lib/supabase/client";
import { useHydrated } from "@/lib/hooks/use-hydrated";

import {
  CREATION_MODELS,
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
import { WorkspaceLauncher } from "@/components/create/workspace/workspace-launcher";
import { AgentPhases } from "@/components/create/workspace/agent-phases";
import { BuildTimeline } from "@/components/create/workspace/build-timeline";
import { OrchestrationNarrator } from "@/components/create/workspace/orchestration-narrator";

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

// ─── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({
  message,
  userAvatar,
  userName,
  streaming,
}: {
  message: UIMessage;
  userAvatar?: string | null;
  userName: string;
  streaming?: boolean;
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
                Orchestrating…
              </span>
            </div>
          ) : (
            <AgentPhases text={text} streaming={streaming} />
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

// ─── Out-of-credits card ──────────────────────────────────────────────────────

const PLAN_META: Record<string, { name: string; quota: number; nextPlan: string; nextPrice: number; nextCredits: string }> = {
  free:     { name: "Free",     quota: 100,    nextPlan: "Starter", nextPrice: 20,  nextCredits: "10,000" },
  starter:  { name: "Starter",  quota: 10_000, nextPlan: "Pro",     nextPrice: 50,  nextCredits: "25,000" },
  pro:      { name: "Pro",      quota: 25_000, nextPlan: "Infinity",nextPrice: 100, nextCredits: "50,000+" },
  infinity: { name: "Infinity", quota: 50_000, nextPlan: "Infinity",nextPrice: 100, nextCredits: "683,500" },
};

const UPGRADE_PERKS: Record<string, string[]> = {
  free:     ["Manual model selection", "Edit & Build modes", "Custom domains", "100× more credits", "Priority orchestration"],
  starter:  ["All frontier models", "Multi-agent orchestration", "Advanced analytics", "API access", "5 collaborators"],
  pro:      ["Dedicated compute", "Enterprise concurrency", "White-label", "Custom SLAs", "SSO / SAML"],
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
  // Estimate at ~50 credits/generation average
  const estGens = Math.floor(meta.quota / 50);
  const usedPct = Math.min(100, Math.round((totalUsed / meta.quota) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--background))] via-[hsl(var(--surface))] to-[hsl(var(--background))] ring-1 ring-border/80 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.35)]"
    >
      {/* Top gradient stripe */}
      <div className="h-[2px] w-full bg-gradient-to-r from-violet-600 via-accent to-sky-500" />

      <div className="px-5 pt-5 pb-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/15 to-accent/20 ring-1 ring-accent/25">
              <Zap className="size-5 text-accent" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[14.5px] font-semibold text-foreground">Orchestration limit reached</p>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-border">
                  {meta.name} plan
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-muted-foreground leading-relaxed">
                You&apos;ve used all {meta.quota.toLocaleString()} monthly credits.
                {daysLeft !== null && daysLeft > 0 && (
                  <span className="ml-1 text-muted-foreground/70">Resets in {daysLeft}d.</span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1 text-muted-foreground/50 transition hover:bg-surface hover:text-muted-foreground"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        </div>

        {/* Usage meter */}
        <div className="mt-4 rounded-xl bg-surface/60 px-4 py-3 ring-1 ring-border/60">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-2">
            <span className="font-medium">This period&apos;s usage</span>
            <span className="tabular-nums font-semibold text-foreground">
              {totalUsed.toLocaleString()} / {meta.quota.toLocaleString()} credits
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-violet-500"
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10.5px] text-muted-foreground/70">
            ~{estGens} generations / month at average model cost
          </p>
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-border/60" />

        {/* Suggested plan */}
        <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Recommended upgrade
        </p>

        <div className="rounded-xl bg-gradient-to-br from-accent/8 via-background to-violet-500/8 px-4 py-3.5 ring-1 ring-accent/20">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[14px] font-bold tracking-tight text-foreground">{meta.nextPlan}</p>
              <p className="text-[11.5px] text-muted-foreground">{meta.nextCredits} orchestration credits / month</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[22px] font-bold tracking-tight text-foreground">
                ${meta.nextPrice}
              </p>
              <p className="text-[10.5px] text-muted-foreground">/ month</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {perks.map((f) => (
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

        {/* CTA buttons */}
        <div className="mt-4 flex items-stretch gap-2">
          <Link
            href="/pricing"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-violet-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_16px_-4px_hsl(var(--accent)/0.45)] transition hover:opacity-90 active:scale-[0.98]"
          >
            <Sparkles className="size-3.5" strokeWidth={2} />
            Upgrade to {meta.nextPlan}
            <ArrowRight className="size-3.5" strokeWidth={2} />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 rounded-xl px-3.5 text-[12px] font-medium text-muted-foreground ring-1 ring-border transition hover:bg-surface hover:text-foreground"
          >
            View all plans
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
  // Panel mode: "preview" or "dashboard" — only active after first generation
  const [panelMode, setPanelMode] = React.useState<"preview" | "dashboard">("preview");

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
      .insert({ user_id: profile.id, title, model_id: modelId })
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

  // For build timeline: get the last assistant message text
  const lastAssistantText = React.useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return "";
    return last.parts?.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("") ?? "";
  }, [messages]);

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
        projectName={project?.name}
        isBusy={isBusy}
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
                  streaming
                />
              )}
            </div>

            {/* Live orchestration narration */}
            {isBusy && (
              <OrchestrationNarrator
                streamingText={messages.length ? messageText(messages[messages.length - 1]) : ""}
                isStreaming={isBusy}
                className="mt-1"
              />
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

      {/* RIGHT: preview + dashboard panel */}
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
            {/* Panel mode bar — only shown after generation */}
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
                ) : (
                  <motion.div
                    key="dashboard-pane"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="h-full overflow-y-auto p-4"
                  >
                    <InlineDashboard project={project} isBusy={isBusy} />
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
        <Image
          src="/logo.png"
          alt=""
          width={56}
          height={56}
          className="object-contain"
          priority
        />
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

// ─── Inline dashboard (right panel dashboard mode) ───────────────────────────

function InlineDashboard({
  project,
  isBusy,
}: {
  project: { id: string; name: string; previewUrl: string | null } | null;
  isBusy: boolean;
}) {
  const appName = project?.name ?? "Untitled App";

  const stats = [
    { label: "Status", value: isBusy ? "Building…" : "Live", color: isBusy ? "text-amber-500" : "text-emerald-500" },
    { label: "Deploy", value: "Vercel Edge", color: "text-muted-foreground" },
    { label: "Region", value: "iad1", color: "text-muted-foreground" },
    { label: "Runtime", value: "Next.js 15", color: "text-muted-foreground" },
  ];

  const sections = [
    {
      title: "Overview",
      items: [
        { label: "App name", value: appName },
        { label: "Framework", value: "Next.js (App Router)" },
        { label: "Visibility", value: "Private" },
        { label: "Last deploy", value: "Just now" },
      ],
    },
    {
      title: "Environment",
      items: [
        { label: "NODE_ENV", value: "production" },
        { label: "NEXT_PUBLIC_APP_URL", value: "https://dreamos86.com" },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      {/* App identity row */}
      <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 ring-1 ring-border">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent/30 to-violet-500/30 text-[15px] font-bold text-foreground">
          {appName[0]?.toUpperCase() ?? "A"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">{appName}</p>
          <p className="text-[11px] text-muted-foreground">App workspace</p>
        </div>
        {isBusy && <Loader2 className="size-4 shrink-0 animate-spin text-accent" strokeWidth={1.75} />}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-surface px-3 py-2.5 ring-1 ring-border">
            <p className="text-[10.5px] text-muted-foreground">{s.label}</p>
            <p className={cn("mt-0.5 text-[12.5px] font-semibold", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Details sections */}
      {sections.map((sec) => (
        <div key={sec.title} className="rounded-xl bg-surface ring-1 ring-border">
          <div className="border-b border-border px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{sec.title}</p>
          </div>
          <div className="divide-y divide-border">
            {sec.items.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <p className="text-[12px] text-muted-foreground">{item.label}</p>
                <p className="truncate text-[12px] font-medium text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Domains */}
      <div className="rounded-xl bg-surface ring-1 ring-border">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Domains</p>
        </div>
        <div className="px-4 py-3">
          {project?.previewUrl ? (
            <a
              href={project.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[12.5px] text-accent hover:underline underline-offset-2"
            >
              {project.previewUrl}
            </a>
          ) : (
            <p className="text-[12px] text-muted-foreground">No domain assigned yet.</p>
          )}
        </div>
      </div>

      {/* App usage */}
      <div className="rounded-xl bg-surface ring-1 ring-border">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Usage this session</p>
        </div>
        <div className="px-4 py-3 text-[12px] text-muted-foreground">
          Orchestration calls and model usage will appear here after generation completes.
        </div>
      </div>
    </div>
  );
}
