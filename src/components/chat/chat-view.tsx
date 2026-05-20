"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Send, Paperclip, X, AlertCircle,
  Loader2, Copy, Check, RotateCcw, MoreHorizontal,
  Link2, HelpCircle, MessageSquare, PanelLeft,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { appUrl, getPublicSiteUrl } from "@/lib/app-url";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useCreditsStore } from "@/lib/stores/credits-store";
import type { Conversation, Message } from "@/lib/supabase/types";
import { variants } from "@/lib/motion";
import { CreditsUpgradeModal } from "@/components/chat/credits-upgrade-modal";
import { calculateTokens } from "@/lib/credits/cost-engine";
import { resolveDisplayName } from "@/lib/profile-display";
import { toast } from "@/lib/toast";
import { createDreamChatTransport } from "@/lib/chat/create-chat-transport";
import { runAiPreflightDeduped } from "@/lib/ai/preflight-inflight";
import { isAiPreflightSuccess, preflightBlockedLabel } from "@/lib/ai/preflight-types";
import { applyComposerPaste } from "@/lib/composer/textarea-handlers";
import { composerTextareaClass } from "@/components/ui/composer-shell";
import { DreamOS86BrandIcon } from "@/components/brand/dreamos86-brand-icon";
import { DreamOS86BrandLockup } from "@/components/brand/dreamos86-brand-lockup";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { submitDebug, uiSubmitLog } from "@/lib/dev/submit-debug";
import { useComposerClickCapture } from "@/lib/dev/composer-click-capture";
import { pushSubmitTrace } from "@/lib/dev/submit-pipeline-trace";
import { SubmitPipelinePanel } from "@/components/dev/submit-pipeline-panel";
import { CHAT_BUILD_BUNDLE } from "@/lib/dev/chat-build-bundle";
import { isSubmitDebugEnabled } from "@/lib/dev/submit-debug-enabled";

const DISCUSS_MODEL_ID_FREE = "gpt-4o-mini";

export type ChatAttachment = { id?: string; url?: string; mime?: string; name?: string };

function parseAttachments(raw: unknown): ChatAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is ChatAttachment =>
      !!x &&
      typeof x === "object" &&
      "url" in x &&
      typeof (x as ChatAttachment).url === "string",
  );
}

function planIsFree(planId: string | null | undefined): boolean {
  if (!planId) return true;
  const p = planId.toLowerCase();
  return p === "free" || p === "starter";
}

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useConversations(userId: string | undefined) {
  const supabase = createClient();
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const maxWait = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 1000);

    void Promise.resolve(
      supabase
        .from("conversations")
        .select("*")
        .eq("user_id", userId)
        .eq("archived", false)
        .order("updated_at", { ascending: false })
        .limit(50),
    )
      .then(({ data, error }) => {
        if (cancelled) return;
        setConversations(error ? [] : (data ?? []));
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(maxWait);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(maxWait);
    };
  }, [userId]);

  return { conversations, setConversations, loading };
}

function useMessages(conversationId: string | null, userId: string | undefined, reloadTick: number) {
  const supabase = createClient();
  const [history, setHistory] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!conversationId || !userId) {
      setHistory([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const maxWait = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 1000);

    void Promise.resolve(
      supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true }),
    )
      .then(({ data, error }) => {
        if (cancelled) return;
        setHistory(error ? [] : ((data as Message[]) ?? []));
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(maxWait);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(maxWait);
    };
  }, [conversationId, userId, reloadTick]);

  return { history, loading };
}

function messageText(msg: { content?: string; parts?: UIMessage["parts"] }): string {
  if (typeof msg.content === "string" && msg.content.length > 0) return msg.content;
  if (!msg.parts?.length) return "";
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

// ─── Message action menu ──────────────────────────────────────────────────────

function MessageActionMenu({ text }: { text: string }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function copyText() {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setOpen(false);
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex size-6 cursor-pointer items-center justify-center rounded-lg text-muted-foreground/40 opacity-0 transition hover:bg-surface hover:text-muted-foreground group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Message actions"
      >
        <MoreHorizontal className="size-3.5" strokeWidth={1.75} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-full left-0 z-50 mb-1 w-48 overflow-hidden rounded-xl bg-background shadow-xl ring-1 ring-border"
          >
            <div className="p-1">
              <button
                type="button"
                onClick={copyText}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-foreground transition hover:bg-surface"
              >
                {copied
                  ? <Check className="size-3.5 text-positive shrink-0" strokeWidth={2} />
                  : <Copy className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />}
                {copied ? "Copied!" : "Copy message"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const base = getPublicSiteUrl();
                  const pathAndQuery =
                    typeof window !== "undefined"
                      ? `${window.location.pathname}${window.location.search}`
                      : pathname || "/chat";
                  navigator.clipboard.writeText(`${base}${pathAndQuery}`).catch(() => {});
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-foreground transition hover:bg-surface"
              >
                <Link2 className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                Copy link
              </button>
              <div className="my-1 h-px bg-border/60 mx-1" />
              <Link
                href="/help/docs/how-credits-work"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-muted-foreground transition hover:bg-surface hover:text-foreground"
              >
                <HelpCircle className="size-3.5 shrink-0" strokeWidth={1.75} />
                How tokens work
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg, displayName, avatarUrl, attachments = [] }: {
  msg: { role: string; content?: string; parts?: UIMessage["parts"] };
  displayName: string;
  avatarUrl?: string | null;
  attachments?: ChatAttachment[];
}) {
  const text = messageText(msg);
  const isUser = msg.role === "user";
  const images = attachments.filter((a) => a.mime?.startsWith("image/"));
  const files = attachments.filter((a) => !a.mime?.startsWith("image/"));
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn("group flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}
    >
      <div className="shrink-0 pt-0.5">
        {isUser ? (
          <div className="rounded-full ring-2 ring-accent/20">
            <Avatar src={avatarUrl} name={displayName} size="sm" />
          </div>
        ) : (
          <motion.div className="flex size-9 shrink-0 items-center justify-center">
            <DreamOS86BrandIcon size={32} alt="DreamOS86" />
          </motion.div>
        )}
      </div>
      <div className={cn("flex max-w-[min(100%,560px)] flex-col gap-1.5", isUser && "items-end")}>
        <div
          className={cn(
            "relative overflow-hidden px-4 py-3 text-[14px] leading-relaxed shadow-sm",
            isUser
              ? "rounded-2xl rounded-tr-md bg-gradient-to-br from-accent to-blue-600 text-white"
              : "rounded-2xl rounded-tl-md border border-border/60 bg-gradient-to-b from-background to-surface/95 text-foreground ring-1 ring-accent/10",
          )}
        >
          {!isUser && (
            <span
              className="pointer-events-none absolute inset-0 opacity-[0.55]"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in oklab, var(--accent) 10%, transparent) 0%, transparent 50%)",
              }}
              aria-hidden
            />
          )}
          <div className={cn("relative whitespace-pre-wrap", !isUser && "text-foreground/95")}>{text}</div>
          {images.length > 0 && (
            <div className={cn("relative mt-2 flex flex-wrap gap-2", isUser ? "justify-end" : "justify-start")}>
              {images.map((a) => (
                <a
                  key={a.id ?? a.url}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block max-w-[min(100%,280px)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- raw PNG alpha */}
                  <img
                    src={a.url}
                    alt={a.name ?? ""}
                    className="max-h-56 w-full rounded-lg object-contain"
                  />
                </a>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <ul className={cn("relative mt-2 list-disc space-y-0.5 pl-4 text-[12px]", isUser ? "text-white/90" : "text-muted-foreground")}>
              {files.map((a) => (
                <li key={a.id ?? a.url}>
                  <a href={a.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {a.name ?? "Attachment"}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!isUser && (
          <div className="flex items-center gap-1.5">
            <MessageActionMenu text={text} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main ChatView ────────────────────────────────────────────────────────────

export function ChatView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const authReturnTo = React.useMemo(() => {
    const qs = searchParams?.toString();
    return qs ? `${pathname}?${qs}` : pathname || "/chat";
  }, [pathname, searchParams]);

  const supabase = createClient();
  const { profile, user, session, loading: authLoading } = useAuthStore();
  const hydrated = useHydrated();
  const { remaining, syncFromDB, isConfirmed } = useCreditsStore();
  const debugEnabled = isSubmitDebugEnabled(
    searchParams,
    profile?.email ?? user?.email ?? null,
  );
  const freePlan = planIsFree(profile?.plan_id);
  const [paidDiscussModel, setPaidDiscussModel] = React.useState("claude-sonnet-4-6");
  const effectiveDiscussModel = freePlan ? DISCUSS_MODEL_ID_FREE : paidDiscussModel;
  const discussTokens = React.useMemo(
    () => calculateTokens(effectiveDiscussModel, "discuss"),
    [effectiveDiscussModel],
  );
  /** Block sends only after server confirmed balance; avoids false zero before /api/credits hydrates. */
  const tokenBlocked = isConfirmed && remaining < discussTokens;
  const userId = user?.id ?? profile?.id;
  const sessionReady = hydrated && !authLoading;
  const needsSignIn = sessionReady && !session?.user;

  const [activeConvId, setActiveConvId] = React.useState<string | null>(null);
  const [mobileConvOpen, setMobileConvOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [attachments, setAttachments] = React.useState<File[]>([]);
  const [tokenError, setTokenError] = React.useState(false);
  const [showCreditsModal, setShowCreditsModal] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [lastSubmitAt, setLastSubmitAt] = React.useState<number | null>(null);
  const [lastApiUrl, setLastApiUrl] = React.useState<string | null>(null);
  const [lastApiStatus, setLastApiStatus] = React.useState<string | null>(null);
  const [submitBlocker, setSubmitBlocker] = React.useState<string | null>(null);
  const [debugClicked, setDebugClicked] = React.useState(false);
  const [debugSubmitted, setDebugSubmitted] = React.useState(false);
  const [preflightState, setPreflightState] = React.useState("idle");
  const [chatState, setChatState] = React.useState("idle");
  const [debugBlocked, setDebugBlocked] = React.useState("no");
  const [submitStatusLabel, setSubmitStatusLabel] = React.useState("Ready");
  const composerRootRef = React.useRef<HTMLDivElement>(null);
  const submitInFlightRef = React.useRef(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  useComposerClickCapture("chat", composerRootRef);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const pendingAttachmentIdsRef = React.useRef<string[]>([]);

  const [histReload, setHistReload] = React.useState(0);
  const { conversations, setConversations, loading: convLoading } = useConversations(userId);
  const { history, loading: histLoading } = useMessages(activeConvId, userId, histReload);

  const convRef = React.useRef(activeConvId);
  convRef.current = activeConvId;

  /** Stable for component lifetime — never tie to activeConvId or send wipes mid-flight. */
  const chatSessionId = React.useId();

  const histById = React.useMemo(() => new Map(history.map((m) => [m.id, m])), [history]);

  const discussModelRef = React.useRef(effectiveDiscussModel);
  discussModelRef.current = effectiveDiscussModel;

  const transport = React.useMemo(
    () =>
      createDreamChatTransport({
        label: "chat",
        getBody: () => ({
          modelId: discussModelRef.current,
          mode: "discuss",
          conversationId: convRef.current ?? undefined,
          attachmentIds: [...pendingAttachmentIdsRef.current],
        }),
        on402: () => {
          pendingAttachmentIdsRef.current = [];
          setTokenError(true);
        },
        onSuccess: () => {
          setTokenError(false);
        },
        onFetchStart: (url) => {
          setLastApiUrl(url);
          setLastApiStatus("pending");
          setChatState("pending");
          submitDebug("chat", "fetch start", { url });
        },
        onFetchEnd: (status) => {
          const label = String(status);
          setLastApiStatus(label);
          setChatState(label.startsWith("blocked") ? "error" : "ok");
          uiSubmitLog("chat", `chat status ${status}`);
          submitDebug("chat", "response status", { status });
        },
      }),
    [],
  );

  const { messages, sendMessage, regenerate, status, error, setMessages, clearError } = useChat({
    id: `dream-ai-chat-${chatSessionId}`,
    transport,
    onError: (err) => {
      pendingAttachmentIdsRef.current = [];
      if (process.env.NODE_ENV !== "production") {
        console.error("[ai-chat] stream error", err);
      }
      toast.error(err.message ?? "Chat failed — try again.");
    },
    onFinish: () => {
      pendingAttachmentIdsRef.current = [];
      if (userId) void syncFromDB(userId, { force: true });
    },
  });
  const isBusy = status === "submitted" || status === "streaming";

  const trimmedInput = input.trim();
  const submitDisabledReason = !trimmedInput ? "empty" : isBusy ? "busy" : null;

  const tokensStatus = !isConfirmed
    ? "loading"
    : tokenBlocked
      ? "blocked"
      : `${remaining}`;

  const wasBusyRef = React.useRef(false);
  React.useEffect(() => {
    if (wasBusyRef.current && !isBusy && activeConvId) {
      setHistReload((n) => n + 1);
    }
    wasBusyRef.current = isBusy;
  }, [isBusy, activeConvId]);

  React.useEffect(() => {
    if (!activeConvId) return;
    if (histLoading || isBusy) return;
    // Do not replace live `useChat` messages with an empty history (brand-new thread + first reply race).
    if (history.length === 0) return;
    setMessages(
      history.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        parts: [{ type: "text" as const, text: m.content }],
      })),
    );
  }, [history, activeConvId, histLoading, isBusy, setMessages]);

  React.useEffect(() => {
    if (messages.length === 0 && !isBusy) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isBusy, activeConvId]);

  function startNewConversation() {
    setActiveConvId(null);
    convRef.current = null;
    setInput("");
    setMessages([]);
    setTokenError(false);
    pendingAttachmentIdsRef.current = [];
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  const filteredConvs = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );

  function failSend(blocked: string, message: string, hint?: string) {
    const full = hint ? `${message} — ${hint}` : message;
    setLastApiStatus(blocked);
    setSubmitBlocker(full);
    setDebugBlocked(blocked.replace(/^blocked:/, "") || "error");
    if (blocked.includes("preflight") || blocked.startsWith("blocked:")) {
      setPreflightState("error");
    }
    pushSubmitTrace("chat", full, {
      level: "error",
      error: full,
      blocked: blocked.replace(/^blocked:/, "") || "error",
      preflight: blocked.includes("preflight") ? "error" : undefined,
      chat: blocked.includes("server") || blocked.includes("tokens") ? "error" : undefined,
    });
    toast.error(full);
    submitDebug("chat", blocked, { message });
  }

  function notifySubmitBlocked(reason: string) {
    setDebugBlocked(reason);
    if (reason === "empty") {
      failSend("blocked:empty", "Type a message before sending.");
    } else if (reason === "busy") {
      return;
    }
  }

  const runSend = React.useCallback(async (source: "form" | "preset" | "button" = "form", presetText?: string) => {
    setDebugClicked(true);
    setSubmitStatusLabel("Submit started");

    if (submitInFlightRef.current) {
      setDebugBlocked("busy");
      notifySubmitBlocked("busy");
      setSubmitStatusLabel("Failed: A request is already in progress");
      return;
    }
    setDebugSubmitted(true);
    uiSubmitLog("chat", "handleSubmit start", { source });
    submitDebug("chat", "handleSend start", { source });
    const text = (presetText ?? input).trim();
    if (!text) {
      setDebugBlocked("empty");
      notifySubmitBlocked("empty");
      setSubmitStatusLabel("Failed: Type a message before sending");
      return;
    }
    if (isBusy) {
      return;
    }

    submitInFlightRef.current = true;
    const draft = presetText ?? input;
    setLastSubmitAt(Date.now());
    setSubmitBlocker(null);
    setDebugBlocked("no");
    setTokenError(false);
    clearError();

    try {
    setSubmitStatusLabel("Preflight started");
    setLastApiUrl("/api/ai/preflight");
    setLastApiStatus("preflight:pending");
    setPreflightState("pending");
    setChatState("idle");
    uiSubmitLog("chat", "preflight fetch start");
    submitDebug("chat", "preflight start");

    const pre = await runAiPreflightDeduped({
      mode: "discuss",
      prompt: text,
      conversationId: activeConvId,
      modelId: effectiveDiscussModel,
    });

    uiSubmitLog("chat", `preflight status ${pre.ok ? "ok" : pre.status}`, {
      code: pre.ok ? undefined : pre.code,
    });
    submitDebug("chat", "preflight status", {
      ok: pre.ok,
      status: pre.ok ? 200 : pre.status,
      code: pre.ok ? undefined : pre.code,
    });

    if (!isAiPreflightSuccess(pre)) {
      setPreflightState("error");
      const blocked = preflightBlockedLabel(pre.code, pre.status);
      if (pre.code === "insufficient_tokens") {
        setTokenError(true);
        setShowCreditsModal(true);
      }
      const reason = `Preflight HTTP ${pre.status}${pre.code ? ` (${pre.code})` : ""}: ${pre.error}`;
      pushSubmitTrace("chat", reason, {
        level: "error",
        error: pre.hint ? `${pre.error} — ${pre.hint}` : pre.error,
        preflight: "error",
        blocked: pre.code ?? String(pre.status),
      });
      failSend(blocked, pre.error, pre.hint);
      setSubmitStatusLabel(
        `Failed: Preflight HTTP ${pre.status}${pre.code ? ` (${pre.code})` : ""} — ${pre.hint ? `${pre.error} — ${pre.hint}` : pre.error}`,
      );
      return;
    }

    setPreflightState("ok");
    pushSubmitTrace("chat", "Preflight OK — starting chat", { level: "ok", preflight: "ok" });

    const hadConv = Boolean(activeConvId);
    if (pre.conversationId) {
      convRef.current = pre.conversationId;
      setActiveConvId(pre.conversationId);
      if (!hadConv) {
        const stub: Conversation = {
          id: pre.conversationId,
          user_id: pre.userId,
          title: text.slice(0, 60) || "New conversation",
          model_id: effectiveDiscussModel,
          project_id: null,
          mode: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          pinned: false,
          archived: false,
          message_count: 0,
          last_message_at: null,
        };
        setConversations((prev) => [stub, ...prev.filter((c) => c.id !== pre.conversationId)]);
      }
    }

    const uploadIds: string[] = [];
    if (attachments.length > 0) {
      for (const f of attachments) {
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch("/api/chat/attachments", { method: "POST", body: fd });
        const j = (await r.json()) as { id?: string; error?: string };
        if (!r.ok) {
          failSend("blocked:server", j.error ?? "Could not upload attachment");
          setSubmitStatusLabel(`Failed: ${j.error ?? "Could not upload attachment"}`);
          return;
        }
        if (j.id) uploadIds.push(j.id);
      }
      setAttachments([]);
    }
    pendingAttachmentIdsRef.current = uploadIds;

    if (!presetText) setInput("");

      setSubmitStatusLabel("Chat started");
      uiSubmitLog("chat", "chat fetch start");
      setLastApiUrl("/api/chat");
      setLastApiStatus("pending");
      setChatState("pending");
      await sendMessage({ text });
      setLastApiStatus((s) => (s === "pending" ? "ok" : s));
      setChatState("ok");
      submitDebug("chat", "ui updated");
      setSubmitStatusLabel("Chat started (stream active)");
    } catch (err) {
      setChatState("error");
      const msg = err instanceof Error ? err.message : "Could not send message";
      if (!msg.includes("Not enough tokens") && !msg.toLowerCase().includes("credit")) {
        failSend("blocked:server", msg);
      } else {
        setTokenError(true);
        setShowCreditsModal(true);
        setLastApiStatus("blocked:tokens");
        setDebugBlocked("credits");
      }
      setSubmitStatusLabel(`Failed: ${msg}`);
      if (!presetText) setInput(draft);
    } finally {
      submitInFlightRef.current = false;
    }
  }, [
    input,
    isBusy,
    attachments,
    activeConvId,
    effectiveDiscussModel,
    clearError,
    sendMessage,
    setConversations,
  ]);

  const runSendRef = React.useRef(runSend);
  runSendRef.current = runSend;

  const handleFormSubmit = React.useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setDebugSubmitted(true);
    setSubmitStatusLabel("Click detected");
    uiSubmitLog("chat-ui", "form submit fired");
    submitDebug("chat", "form submit fired");
    void runSendRef.current("form");
  }, []);

  const handleFormSubmitCapture = React.useCallback(() => {
    setSubmitStatusLabel("Click detected");
  }, []);

  async function handleSend(e?: React.FormEvent, presetText?: string) {
    e?.preventDefault();
    await runSendRef.current(presetText ? "preset" : "form", presetText);
  }

  React.useEffect(() => {
    if (!hydrated) return;
    pushSubmitTrace("chat", "Chat composer mounted", { level: "ok" });
  }, [hydrated]);

  React.useEffect(() => {
    if (!hydrated) return;
    const btn = composerRootRef.current?.querySelector(
      "[data-chat-send-btn]",
    ) as HTMLButtonElement | null;
    if (!btn) {
      pushSubmitTrace("chat", "Send button missing from DOM — cannot wire click", {
        level: "error",
        error: "Send button not found. Try refreshing the page.",
      });
      return;
    }
    pushSubmitTrace("chat", "Send button found — native listeners attached", { level: "ok" });

    const onPointerDown = () => {
      setDebugClicked(true);
      setSubmitStatusLabel("Pointer down detected");
      uiSubmitLog("chat-ui", "send pointer down");
    };
    const onClick = () => {
      setDebugClicked(true);
      setSubmitStatusLabel("Click detected");
      uiSubmitLog("chat-ui", "send click (native)");
      void runSendRef.current("button");
    };

    btn.addEventListener("pointerdown", onPointerDown, true);
    btn.addEventListener("click", onClick, true);
    return () => {
      btn.removeEventListener("pointerdown", onPointerDown, true);
      btn.removeEventListener("click", onClick, true);
    };
  }, [hydrated]);

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
      {debugEnabled && (
        <div
          className="shrink-0 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1 text-center text-[11px] font-semibold text-amber-950 dark:text-amber-100"
          data-testid="chat-build-bundle"
        >
          Chat build bundle: {CHAT_BUILD_BUNDLE}
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Conversation sidebar */}
      <div className="hidden w-64 shrink-0 flex-col border-r border-border bg-background lg:flex">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations"
              className="h-8 w-full rounded-lg bg-surface pl-8 pr-3 text-[12px] text-foreground outline-none ring-1 ring-border focus:ring-accent/40"
            />
          </div>
          <button
            onClick={startNewConversation}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground ring-1 ring-border transition hover:bg-surface hover:text-foreground active:scale-95"
            title="New conversation"
          >
            <Plus className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {convLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <MessageSquare className="mx-auto mb-2 size-8 text-muted-foreground/30" strokeWidth={1.25} />
              <p className="text-[12px] font-medium text-foreground">No conversations yet</p>
              <p className="mt-1 text-[11px] text-muted-foreground/80">Start a new chat below — it saves automatically.</p>
              <button
                type="button"
                onClick={startNewConversation}
                className="mt-4 w-full cursor-pointer rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white transition hover:bg-accent/90 active:scale-[0.98]"
              >
                Start a new chat
              </button>
            </div>
          ) : (
            filteredConvs.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={cn(
                  "group w-full cursor-pointer px-3 py-2.5 text-left transition hover:bg-surface",
                  activeConvId === conv.id && "bg-surface",
                )}
              >
                <p className={cn(
                  "truncate text-[12.5px] font-medium leading-snug",
                  activeConvId === conv.id ? "text-foreground" : "text-foreground/80",
                )}>
                  {conv.title}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(conv.updated_at).toLocaleDateString()}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Link to create a new app */}
        <div className="border-t border-border p-3">
          <Link
            href="/"
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white transition hover:bg-accent/90 active:scale-[0.98]"
          >
            <DreamOS86BrandIcon size={16} alt="" />
            Create a new app
          </Link>
        </div>
      </div>

      {/* Mobile conversation sheet */}
      <AnimatePresence>
        {mobileConvOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/50 lg:hidden"
              aria-label="Close conversations"
              onClick={() => setMobileConvOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="fixed inset-y-0 left-0 z-[61] flex w-[min(100%,280px)] flex-col border-r border-border bg-background shadow-xl lg:hidden"
            >
              <div className="flex items-center justify-between border-b border-border px-3 py-3">
                <DreamOS86BrandLockup variant="drawer" href="/" onClick={() => setMobileConvOpen(false)} />
                <button
                  type="button"
                  onClick={() => setMobileConvOpen(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {filteredConvs.map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => {
                      setActiveConvId(conv.id);
                      setMobileConvOpen(false);
                    }}
                    className={cn(
                      "w-full px-3 py-2.5 text-left transition hover:bg-surface",
                      activeConvId === conv.id && "bg-surface",
                    )}
                  >
                    <p className="truncate text-[12.5px] font-medium text-foreground">{conv.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {conv.mode ? `${conv.mode} · ` : ""}
                      {new Date(conv.updated_at).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
              <div className="border-t border-border p-3">
                <button
                  type="button"
                  onClick={() => {
                    startNewConversation();
                    setMobileConvOpen(false);
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[12px] font-medium text-white"
                >
                  <Plus className="size-4" />
                  New chat
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main chat area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3 safe-area-pad-x lg:hidden">
          <button
            type="button"
            onClick={() => setMobileConvOpen(true)}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground ring-1 ring-border transition hover:bg-surface hover:text-foreground"
            title="Conversations"
          >
            <PanelLeft className="size-4" strokeWidth={1.75} />
          </button>
          <div className="min-w-0 flex-1">
            <DreamOS86BrandLockup variant="drawer" href="/chat" showText />
          </div>
          <button
            type="button"
            onClick={startNewConversation}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-accent text-white shadow-sm transition hover:bg-accent/90 active:scale-95"
            title="New chat"
          >
            <Plus className="size-4" strokeWidth={2} />
          </button>
        </div>
        {/* Chat label bar */}
        <div className="flex h-10 shrink-0 flex-wrap items-center gap-2 border-b border-border px-4">
          <div className="flex items-center gap-1.5 rounded-full bg-muted/50 px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground ring-1 ring-border/60">
            <DreamOS86BrandIcon size={18} alt="" />
            {freePlan ? "Discuss · automatic model" : "Discuss · choose model"}
          </div>
          {!freePlan && (
            <select
              value={paidDiscussModel}
              onChange={(e) => setPaidDiscussModel(e.target.value)}
              aria-label="Model"
              className="rounded-lg border border-border/80 bg-background px-2 py-1 text-[11px] text-foreground outline-none"
            >
              <option value="claude-sonnet-4-6">Claude Sonnet</option>
              <option value="claude-haiku-4-5">Claude Haiku</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o mini</option>
            </select>
          )}
          <span className="ml-auto hidden text-[11px] text-muted-foreground/60 sm:inline">
            Friendly answers about DreamOS86 — no coding jargon unless you want it
          </span>
        </div>

        {/* Messages */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 sm:px-5 lg:px-6">
            {messages.length === 0 && !isBusy && (
              <motion.div
                variants={variants.fadeUp}
                initial="hidden"
                animate="show"
                className="flex flex-col items-center py-8 text-center sm:py-10"
              >
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/25 via-accent/15 to-violet-500/20 ring-1 ring-accent/25 shadow-[0_8px_28px_-12px_rgba(37,99,235,0.22)]">
                  <DreamOS86BrandIcon size={44} alt="DreamOS86" />
                </div>
                <h2 className="text-[20px] font-semibold tracking-tight text-foreground">
                  How can I help?
                </h2>
                <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                  Ask how DreamOS86 works, what to build first, or where to find pricing and settings. Short, plain-language answers.
                </p>
                <div className="mt-6 flex w-full max-w-xl flex-col gap-2">
                  {[
                    { q: "What is DreamOS86 in one sentence?", prompt: "What is DreamOS86 in one sentence?" },
                    { q: "How do I build my first app here?", prompt: "How do I build my first app step by step?" },
                    { q: "Where do tokens and pricing work?", prompt: "How do tokens work and where is pricing?" },
                    { q: "Can you link me to templates and examples?", prompt: "Where are templates and example apps?" },
                  ].map(({ q, prompt }) => (
                    <button
                      key={q}
                      type="button"
                      disabled={isBusy || tokenBlocked || !userId}
                      onClick={() => {
                        setInput(prompt);
                        requestAnimationFrame(() => textareaRef.current?.focus());
                      }}
                      className="cursor-pointer rounded-xl border border-border/80 bg-background/80 px-4 py-3 text-left text-[12.5px] text-muted-foreground shadow-sm transition hover:border-accent/35 hover:bg-surface hover:text-foreground hover:shadow-md active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {histLoading && messages.length === 0 ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              messages.map((msg, idx) => {
                const row = msg.id ? histById.get(msg.id) : undefined;
                const att = parseAttachments(row?.attachments);
                return (
                  <MessageBubble
                    key={msg.id ?? idx}
                    msg={{ role: msg.role, parts: msg.parts }}
                    displayName={resolveDisplayName(profile, user)}
                    avatarUrl={profile?.avatar_url}
                    attachments={att}
                  />
                );
              })
            )}

            {isBusy && (
              <div className="flex gap-3">
                <div className="flex size-7 shrink-0 items-center justify-center">
                  <DreamOS86BrandIcon size={18} alt="" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-surface px-4 py-3 ring-1 ring-border">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(error || tokenError) && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 rounded-xl bg-destructive/10 px-4 py-3 ring-1 ring-destructive/20"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={1.75} />
                <div>
                  <p className="text-[13px] font-medium text-destructive">
                    {tokenError ? "Not enough tokens" : "Something went wrong"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-destructive/70">
                    {tokenError
                      ? "Add tokens or upgrade your plan to keep chatting."
                      : error?.message ?? "The AI is temporarily unavailable. Try again."}
                  </p>
                </div>
                {!tokenError && (
                  <button
                    onClick={() => { clearError(); void regenerate(); }}
                    className="ml-auto flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-destructive transition hover:bg-destructive/10"
                  >
                    <RotateCcw className="size-3.5" strokeWidth={1.75} /> Retry
                  </button>
                )}
              </motion.div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        <div
          ref={composerRootRef}
          className="relative z-30 shrink-0 border-t border-border/60 bg-background/90 px-3 pt-2.5 backdrop-blur-xl pb-[max(0.875rem,calc(4rem+env(safe-area-inset-bottom,0px)))] lg:pb-3"
        >
          {attachments.length > 0 && (
            <div className="mx-auto mb-2 flex w-full max-w-3xl flex-wrap gap-2">
              {attachments.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1 text-[12px] ring-1 ring-border">
                  <Paperclip className="size-3" strokeWidth={1.75} />
                  <span className="max-w-[120px] truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}
                    className="cursor-pointer"
                  >
                    <X className="size-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {submitBlocker && (
            <motion.div className="mx-auto mb-2 flex w-full max-w-3xl flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                <p>{submitBlocker}</p>
              </div>
              {lastApiStatus?.includes("blocked:auth") && (
                <Link
                  href={`/auth/login?next=${encodeURIComponent(authReturnTo)}`}
                  className="inline-flex w-fit rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white"
                >
                  Sign in
                </Link>
              )}
            </motion.div>
          )}

          <form
            ref={formRef}
            data-testid="chat-composer-form"
            onSubmitCapture={handleFormSubmitCapture}
            onSubmit={handleFormSubmit}
            className="composer-shell relative z-10 mx-auto flex w-full max-w-3xl items-end gap-2 rounded-xl border border-border/70 bg-surface/80 px-2 py-1.5 shadow-sm transition-[border-color,box-shadow] focus-within:border-border focus-within:shadow-sm"
          >
            <input
              type="file"
              ref={fileRef}
              className="hidden"
              multiple
              accept="image/*,.pdf,.txt,.zip,.json"
              onChange={(e) => setAttachments((a) => [...a, ...Array.from(e.target.files ?? [])])}
            />

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Attach a file or image"
              className="-translate-y-0.5 mb-0.5 cursor-pointer rounded-lg p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground active:scale-95"
            >
              <Paperclip className="size-4" strokeWidth={1.65} />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                submitDebug("chat", "input changed", { len: e.target.value.length });
              }}
              onPaste={(e) => applyComposerPaste(e, input, setInput)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  uiSubmitLog("chat-ui", "enter submit");
                  submitDebug("chat", "enter pressed");
                  formRef.current?.requestSubmit();
                }
              }}
              placeholder="Ask anything…"
              rows={1}
              disabled={isBusy}
              spellCheck
              className={cn(
                composerTextareaClass,
                "max-h-36 min-h-[36px] flex-1 py-2 text-[13.5px] leading-relaxed",
              )}
            />

            <button
              type="button"
              data-chat-send-btn
              data-testid="chat-send-button"
              aria-busy={isBusy || undefined}
              onPointerDownCapture={() => {
                setDebugClicked(true);
                setSubmitStatusLabel("Pointer down detected");
                uiSubmitLog("chat-ui", "send pointer down");
                submitDebug("chat", "send pointer down");
              }}
              onClickCapture={() => setSubmitStatusLabel("Click detected")}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDebugClicked(true);
                setSubmitStatusLabel("Click detected");
                uiSubmitLog("chat-ui", "send click");
                submitDebug("chat", "send button click");
                void runSendRef.current("button");
              }}
              className={cn(
                "relative z-[60] mb-1 inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-sm)] bg-accent px-3 text-accent-foreground shadow-[var(--shadow-sm)] transition hover:brightness-[1.03] active:scale-[0.97] pointer-events-auto",
                isBusy && "opacity-70",
              )}
              title={
                tokenBlocked
                  ? "Not enough credits — upgrade to continue"
                  : needsSignIn
                    ? "Sign in to send"
                    : submitDisabledReason === "busy"
                      ? "Waiting for reply"
                      : undefined
              }
            >
              {isBusy
                ? <Loader2 className="size-3.5 animate-spin" />
                : <Send className="size-3.5" strokeWidth={2} />}
            </button>
          </form>

          {debugEnabled && (
            <>
              <p
                data-testid="chat-submit-status"
                className={cn(
                  "mx-auto mt-2 max-w-3xl rounded-lg border px-2.5 py-2 text-center text-[12px] font-semibold",
                  submitStatusLabel.startsWith("Failed")
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-border bg-surface text-foreground",
                )}
              >
                {submitStatusLabel}
              </p>
              <SubmitPipelinePanel channel="chat" inputLen={input.length} />
            </>
          )}

          <p className="mx-auto mt-1.5 max-w-3xl text-center text-[11px] text-muted-foreground">
            {needsSignIn
              ? `Please sign in again at ${appUrl("/auth/login")} (same origin as this tab) to send messages.`
              : tokenBlocked
                ? <>Not enough credits —{" "}
                  <button
                    type="button"
                    onClick={() => setShowCreditsModal(true)}
                    className="cursor-pointer text-accent hover:underline underline-offset-2"
                  >
                    upgrade your plan
                  </button>
                </>
                : "Enter to send · Shift+Enter for new line"}
          </p>
        </div>
      </div>

      <AnimatePresence>
        {showCreditsModal && (
          <CreditsUpgradeModal
            onClose={() => setShowCreditsModal(false)}
            currentPlanId={profile?.plan_id ?? "free"}
          />
        )}
      </AnimatePresence>
      </div>
    </div>
  );
}
