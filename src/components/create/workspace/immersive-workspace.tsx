"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
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
  Sparkles,
  Zap,
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
import { AgentPhases } from "@/components/create/workspace/agent-phases";
import { BuildTimeline } from "@/components/create/workspace/build-timeline";
import { OrchestrationNarrator } from "@/components/create/workspace/orchestration-narrator";
import { WorkspaceLauncher } from "@/components/create/workspace/workspace-launcher";

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

// ─── Message bubble (compact for narrow panel) ───────────────────────────────

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

// WorkspaceHeader is now the WorkspaceLauncher component — imported above.

// ─── Mode style ───────────────────────────────────────────────────────────────

const MODE_STYLE = {
  discuss: {
    composerRing: "ring-border focus-within:ring-accent/30",
    badge: null,
  },
  edit: {
    composerRing: "ring-amber-500/20 focus-within:ring-amber-400/40",
    badge: { label: "Surgical Edit", color: "bg-amber-500/10 text-amber-600 ring-amber-500/25" },
  },
  build: {
    composerRing: "ring-violet-500/25 focus-within:ring-violet-400/50",
    badge: { label: "Full Build", color: "bg-violet-500/10 text-violet-600 ring-violet-500/25" },
  },
} satisfies Record<string, { composerRing: string; badge: { label: string; color: string } | null }>;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ImmersiveWorkspaceProps {
  initialPrompt?: string;
  project?: { id: string; name: string; preview_url: string | null } | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ImmersiveWorkspace({
  initialPrompt = "",
  project = null,
}: ImmersiveWorkspaceProps) {
  const supabase = createClient();
  const { profile } = useAuthStore();
  const { deductOptimistic } = useCreditsStore();
  const hydrated = useHydrated();

  const [input, setInput] = React.useState(initialPrompt);
  const [mode, setMode] = React.useState<CreationMode>("build");
  const [modelId, setModelId] = React.useState(DEFAULT_MODEL_ID);
  const [scope, setScope] = React.useState<EditScope | null>(null);
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [creditError, setCreditError] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [autoSubmitted, setAutoSubmitted] = React.useState(false);

  const fileRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const conversationIdRef = React.useRef<string | null>(null);
  conversationIdRef.current = conversationId;
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
            const m = CREATION_MODELS.find((x) => x.id === modelId);
            deductOptimistic(m?.credits ?? 1);
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

  const { messages, sendMessage, status, error, clearError, regenerate } = useChat({ transport });
  const isBusy = status === "submitted" || status === "streaming";

  // Auto-scroll to bottom
  React.useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isBusy]);

  // Auto-submit initial prompt
  React.useEffect(() => {
    if (!hydrated || autoSubmitted || !initialPrompt.trim()) return;
    setAutoSubmitted(true);
    const timer = setTimeout(() => {
      sendMessage({ role: "user", parts: [{ type: "text", text: initialPrompt }] } as Parameters<typeof sendMessage>[0]);
      setInput("");
    }, 300);
    return () => clearTimeout(timer);
  }, [hydrated, autoSubmitted, initialPrompt, sendMessage]);

  async function ensureConversation(firstMessage: string): Promise<string | null> {
    if (conversationIdRef.current) return conversationIdRef.current;
    if (!profile?.id) return null;
    const title = firstMessage.slice(0, 80) || "New session";
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

  function submit() {
    const text = input.trim();
    if (!text || isBusy) return;
    // Edit mode no longer requires a pre-selected scope; visual targeting prefills the input
    ensureConversation(text);
    const parts: UIMessage["parts"] = [{ type: "text", text }];
    if (attachments.length > 0) {
      for (const att of attachments) {
        if (att.kind === "image" && att.previewUrl) {
          parts.push({ type: "text", text: `[Image attached: ${att.name}]` });
        } else {
          parts.push({ type: "text", text: `[File attached: ${att.name}]` });
        }
      }
    }
    sendMessage({ role: "user", parts } as Parameters<typeof sendMessage>[0]);
    setInput("");
    setAttachments([]);
  }

  const showEmpty = messages.length === 0 && !isBusy;
  const modeStyle = MODE_STYLE[mode];
  const lastAssistantText = React.useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    return last ? messageText(last) : "";
  }, [messages]);
  const showBuildTimeline = mode === "build" && (isBusy || lastAssistantText.length > 0);

  return (
    <DropZone onFiles={onFiles} disabled={isBusy} className="flex h-screen w-full flex-col overflow-hidden">
      {/* Workspace header — WorkspaceName / AppName breadcrumb */}
      <WorkspaceLauncher
        projectName={project?.name}
        isBusy={isBusy}
      />

      {/* Main split: 35% chat + 65% preview */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* LEFT: orchestration panel */}
        <div className="flex w-[38%] min-w-[300px] max-w-[480px] flex-col overflow-hidden border-r border-border/50">
          {/* Mode + controls bar */}
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 bg-background/60 px-2.5 backdrop-blur-sm">
            <ModeSwitch value={mode} onChange={setMode} compact />
            {modeStyle.badge && (
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", modeStyle.badge.color)}>
                {modeStyle.badge.label}
              </span>
            )}
            {showBuildTimeline && (
              <span className="ml-auto text-[10px] text-violet-500 font-medium">
                {isBusy ? "Building…" : `${lastAssistantText.split("##").length - 1} phases`}
              </span>
            )}
          </div>

          {/* Messages */}
          <div ref={scrollRef} className={cn("flex-1 overflow-y-auto", mode === "build" && "bg-gradient-to-b from-violet-500/[0.03] to-transparent")}>
            <div className="px-3 py-4 space-y-3">
              {showEmpty && (
                <div className="flex flex-col items-center pt-8 text-center">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/30 to-accent/10">
                    <Zap className="size-5 text-accent" strokeWidth={1.75} />
                  </div>
                  <p className="mt-3 text-[13.5px] font-semibold text-foreground">
                    {mode === "build" ? "Building your app…" : "Ready to orchestrate"}
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {MODE_META[mode].description}
                  </p>
                </div>
              )}

              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    userAvatar={profile?.avatar_url ?? null}
                    userName={profile?.full_name ?? "You"}
                    streaming={isBusy && i === messages.length - 1 && m.role === "assistant"}
                  />
                ))}
              </AnimatePresence>

              {isBusy && messages[messages.length - 1]?.role === "user" && (
                <MessageBubble
                  message={{ id: "pending", role: "assistant", parts: [{ type: "text", text: "" }] } satisfies UIMessage}
                  userName="DreamOS86"
                  streaming
                />
              )}

              {isBusy && (
                <OrchestrationNarrator
                  streamingText={messages.length ? messageText(messages[messages.length - 1]) : ""}
                  isStreaming={isBusy}
                  className="mt-1"
                />
              )}

              {creditError && (
                <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-600 ring-1 ring-amber-500/30">
                  Out of credits. <a href="/pricing" className="font-semibold underline">Upgrade</a> to continue.
                </div>
              )}
              {error && !creditError && (
                <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive ring-1 ring-destructive/20">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" strokeWidth={1.75} />
                  <div className="flex-1">
                    <p className="font-semibold">Generation failed</p>
                    <p className="opacity-90 mt-0.5">{error.message ?? "Try again."}</p>
                  </div>
                  <button type="button" onClick={() => { clearError(); regenerate(); }} className="shrink-0 rounded bg-destructive/15 px-2 py-1 text-[10.5px] font-semibold">
                    Retry
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Build timeline (compact, inside left panel) */}
          <AnimatePresence initial={false}>
            {showBuildTimeline && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden border-t border-violet-500/15"
              >
                <div className="p-2">
                  <BuildTimeline streamingText={lastAssistantText} isStreaming={isBusy} className="w-full ring-0 bg-transparent p-0" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Composer */}
          <div className="shrink-0 border-t border-border/60 bg-background/90 px-2.5 py-2.5 backdrop-blur-xl">
            <AttachmentRail attachments={attachments} onRemove={removeAttachment} className="mb-1.5" />
            <div className={cn("rounded-xl bg-surface ring-1 focus-within:ring-2 transition-[box-shadow]", modeStyle.composerRing)}>
              <div className="flex items-center gap-2 border-b border-border/50 px-2.5 py-1">
                <ModelPicker value={modelId} onChange={setModelId} disabled={isBusy} />
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
                rows={2}
                placeholder={
                  mode === "build"
                    ? "Describe what to build…"
                    : mode === "discuss"
                      ? "Ask anything…"
                      : "Describe the change…"
                }
                disabled={isBusy}
                className="w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
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
                <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && onFiles(Array.from(e.target.files))} />
                <button
                  type="button"
                  onClick={submit}
                  disabled={isBusy || !input.trim()}
                  className={cn(
                    "ml-auto flex h-7 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition",
                    isBusy || !input.trim()
                      ? "bg-muted text-muted-foreground"
                      : mode === "build"
                        ? "bg-gradient-to-r from-accent to-violet-500 text-white shadow-[0_4px_14px_-4px_rgba(30,107,255,0.5)] hover:opacity-90"
                        : "bg-accent text-white hover:bg-accent/90",
                  )}
                >
                  {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" strokeWidth={2.25} />}
                  {isBusy ? "…" : mode === "build" ? "Build" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: preview — 65% of space */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-atmosphere">
          <PreviewPanel
            url={project?.preview_url ?? null}
            appName={project?.name ?? null}
            thinking={isBusy}
            editMode={mode === "edit"}
            onEditTarget={(info) => {
              setInput(`[Targeting: ${info.section}] `);
              const el = document.querySelector("textarea");
              el?.focus();
            }}
          />
        </div>
      </div>
    </DropZone>
  );
}
