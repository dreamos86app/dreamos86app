"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  X,
  Globe,
  Smartphone,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  Rocket,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Apple,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

export type PublishTargetId = "web" | "custom_domain" | "android_apk" | "android_aab";

export type PublishUiState = {
  web?: { note?: string; saved?: boolean };
  custom_domain?: { domain?: string; saved?: boolean };
  android_apk?: { requested?: boolean; saved?: boolean };
  android_aab?: { requested?: boolean; saved?: boolean };
  /** ISO 8601 */
  updated_at?: string;
};

type PublishApiPayload = {
  projectId?: string;
  subdomain: string | null;
  publicWebUrl: string | null;
  customDomainAllowed: boolean;
  platformBaseDomain?: string;
  error?: string;
};

type ReadinessPayload = {
  issues: Array<{ severity: string; code: string; message: string }>;
  fileCount: number;
  error?: string;
};

type WrapJob = {
  id?: string;
  status?: string;
  error_message?: string | null;
  kind?: string;
};

function proOrHigher(planId: string | undefined): boolean {
  const p = (planId ?? "free").toLowerCase();
  return p === "pro" || p === "business" || p === "enterprise" || p.startsWith("inf");
}

interface PublishModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string | null;
  planId: string | undefined;
  initialDraft: PublishUiState | null;
  onSaved: (draft: PublishUiState) => void;
  /** False until the app has a preview URL or icon — web publish stays honestly locked. */
  artifactsReady?: boolean;
}

export function PublishModal({
  open,
  onClose,
  projectId,
  planId,
  initialDraft,
  onSaved,
  artifactsReady = true,
}: PublishModalProps) {
  const [tab, setTab] = React.useState<"web" | "mobile">("web");
  const [publishInfo, setPublishInfo] = React.useState<PublishApiPayload | null>(null);
  const [readiness, setReadiness] = React.useState<ReadinessPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [posting, setPosting] = React.useState(false);
  const [wrapBusy, setWrapBusy] = React.useState<null | "android_apk" | "android_aab">(null);
  const [lastWrapJob, setLastWrapJob] = React.useState<WrapJob | null>(null);
  const [local, setLocal] = React.useState<PublishUiState>(initialDraft ?? {});
  const localRef = React.useRef(local);
  localRef.current = local;
  const [mobilePlatform, setMobilePlatform] = React.useState<"ios" | "android">("android");

  React.useEffect(() => {
    if (open && initialDraft) setLocal(initialDraft);
  }, [open, initialDraft]);

  React.useEffect(() => {
    if (!open || !projectId) {
      setPublishInfo(null);
      setReadiness(null);
      setLastWrapJob(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [pubRes, readyRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/publish`, { credentials: "include" }),
          fetch(`/api/projects/${projectId}/publish/readiness`, { credentials: "include" }),
        ]);
        const pub = (await pubRes.json()) as PublishApiPayload;
        const ready = (await readyRes.json()) as ReadinessPayload;
        if (cancelled) return;
        setPublishInfo(pub);
        setReadiness(ready);
      } catch {
        if (!cancelled) toast.error("Could not load publish data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  async function refreshPublishAfterAllocate(next: PublishApiPayload) {
    setPublishInfo(next);
    const merged: PublishUiState = {
      ...localRef.current,
      web: { ...localRef.current.web, saved: true, note: "subdomain_allocated" },
      updated_at: new Date().toISOString(),
    };
    setLocal(merged);
    if (!projectId) return;
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ publish_ui: merged }),
      });
      onSaved(merged);
    } catch {
      /* best-effort */
    }
  }

  async function ensureWebPublish() {
    if (!projectId) {
      toast.error("Save your app first.");
      return;
    }
    setPosting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/publish`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not allocate subdomain");
      const verifyRes = await fetch(`/api/projects/${projectId}/publish`, { credentials: "include" });
      const next = (await verifyRes.json()) as PublishApiPayload;
      await refreshPublishAfterAllocate(next);
      toast.success("Live web URL is ready on DreamOS86.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPosting(false);
    }
  }

  function copyUrl(url: string) {
    void navigator.clipboard.writeText(url).then(
      () => toast.success("Copied"),
      () => toast.error("Could not copy"),
    );
  }

  async function requestWrap(kind: "android_apk" | "android_aab") {
    if (!projectId) return;
    setWrapBusy(kind);
    setLastWrapJob(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/wrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ kind }),
      });
      const j = (await res.json()) as { job?: WrapJob; error?: string; locked?: boolean };
      if (!res.ok) {
        toast.error(j.error ?? "Request failed");
        return;
      }
      if (!j.job) {
        toast.error("No job returned");
        return;
      }
      setLastWrapJob(j.job);
      if (j.job.status === "requires_builder_config") {
        toast.info(j.job.error_message ?? "Mobile builder is not configured on the server.");
      } else {
        toast.success("Build job recorded.");
      }
      const patchKey = kind === "android_apk" ? "android_apk" : "android_aab";
      const merged: PublishUiState = {
        ...localRef.current,
        [patchKey]: { requested: true, saved: true },
        updated_at: new Date().toISOString(),
      };
      setLocal(merged);
      onSaved(merged);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start build");
    } finally {
      setWrapBusy(null);
    }
  }

  const androidLocked = !proOrHigher(planId);
  const publicUrl = publishInfo?.publicWebUrl ?? null;
  const customAllowed = publishInfo?.customDomainAllowed ?? false;
  const webPublishLocked = !projectId || !artifactsReady;

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-foreground/25 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-title"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex max-h-[min(92dvh,820px)] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-xl)] bg-background shadow-2xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" strokeWidth={1.75} />
        </button>

        <div className="border-b border-border bg-gradient-to-r from-accent/[0.1] via-background to-violet-500/[0.06] px-5 py-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent/12 ring-1 ring-accent/20">
            <Rocket className="size-5 text-accent" strokeWidth={1.65} />
          </div>
          <h2 id="publish-title" className="mt-3 text-[18px] font-semibold tracking-tight text-foreground">
            Publish
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
            DreamOS86 hosts the web version for you at a dedicated subdomain. Mobile packaging uses the same project files
            — availability depends on your plan and the platform builder.
          </p>

          {!artifactsReady && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-100">
              <Lock className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              <p>
                Web publish needs generated app files or a working preview. Finish a build, then return here.
              </p>
            </div>
          )}

          <div className="mt-4 flex rounded-xl bg-background/80 p-1 ring-1 ring-border/80">
            <button
              type="button"
              onClick={() => setTab("web")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-semibold transition",
                tab === "web" ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground",
              )}
            >
              <Globe className="size-3.5" strokeWidth={1.75} /> Web
            </button>
            <button
              type="button"
              onClick={() => setTab("mobile")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12.5px] font-semibold transition",
                tab === "mobile" ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground",
              )}
            >
              <Smartphone className="size-3.5" strokeWidth={1.75} /> Mobile
              <span className="rounded-md bg-violet-500/15 px-1.5 py-px text-[9px] font-bold uppercase text-violet-600 dark:text-violet-300">
                Pro+
              </span>
            </button>
          </div>
        </div>

        <motion.div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 pb-12">
          {!projectId && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-100 ring-1 ring-amber-500/25">
              Start a build first — publishing attaches to your saved app record.
            </p>
          )}

          {loading && projectId && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading publish state…
            </div>
          )}

          {tab === "web" && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-surface/60 p-4 ring-1 ring-border/80">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Live app URL</p>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Every app gets a stable public hostname on{" "}
                  <span className="font-medium text-foreground">{publishInfo?.platformBaseDomain ?? "dreamos86.com"}</span>.
                  Updates to your generated UI roll forward here when you rebuild.
                </p>

                {publicUrl ? (
                  <div className="mt-3 break-all rounded-xl bg-background px-3 py-2.5 font-mono text-[12px] text-foreground ring-1 ring-border">
                    {publicUrl}
                  </div>
                ) : (
                  <p className="mt-3 text-[12px] text-muted-foreground">
                    No subdomain reserved yet — generate a web build first or allocate below.
                  </p>
                )}

                <motion.button
                  type="button"
                  whileTap={{ scale: webPublishLocked ? 0.94 : 0.97 }}
                  disabled={posting}
                  onClick={() => {
                    if (webPublishLocked) {
                      toast.info("Generate a preview or app icon first — then you can publish to the web.");
                      return;
                    }
                    void ensureWebPublish();
                  }}
                  className={cn(
                    "mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-violet-600 px-4 py-3 text-[13px] font-semibold text-white shadow-lg transition",
                    webPublishLocked && "cursor-not-allowed opacity-65",
                    posting && "pointer-events-none opacity-80",
                  )}
                >
                  {posting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <span className="text-lg leading-none" aria-hidden>
                      {webPublishLocked ? "—" : "🚀"}
                    </span>
                  )}
                  {publicUrl ? "Refresh live URL" : "Publish to web"}
                </motion.button>

                <div className="mt-3 flex flex-wrap gap-2">
                  {publicUrl && (
                    <>
                      <Button type="button" size="sm" variant="secondary" onClick={() => copyUrl(publicUrl)}>
                        <Copy className="mr-1 size-3" /> Copy
                      </Button>
                      <Button type="button" size="sm" variant="secondary" asChild>
                        <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="mr-1 size-3" /> Open
                        </a>
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div
                className={cn(
                  "rounded-2xl p-4 ring-1",
                  customAllowed ? "bg-surface/40 ring-border/70" : "bg-muted/15 ring-border/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <Wrench className="size-4 text-muted-foreground" strokeWidth={1.65} />
                  <span className="text-[13px] font-semibold text-foreground">Custom domain</span>
                  {!customAllowed && (
                    <span className="rounded-full bg-muted px-2 py-px text-[10px] font-semibold text-muted-foreground">
                      Upgrade
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {customAllowed
                    ? "Contact us to map your domain — TLS and routing are handled on DreamOS86 infrastructure."
                    : "Custom domains are available on paid plans. Your app still ships on the free subdomain above."}
                </p>
                {!customAllowed && (
                  <Link
                    href="/pricing"
                    className="mt-2 inline-flex text-[12px] font-semibold text-accent hover:underline underline-offset-2"
                  >
                    View plans
                  </Link>
                )}
              </div>

            </div>
          )}

          {tab === "mobile" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-xl bg-violet-500/10 px-3 py-2 text-[12px] text-violet-950 dark:text-violet-100 ring-1 ring-violet-500/20">
                <Smartphone className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                <div>
                  <p className="font-semibold">Mobile App · Pro and above</p>
                  <p className="mt-0.5 opacity-90">
                    Packaging scans your saved source for store-readiness, then queues APK/AAB jobs on honest infrastructure
                    status — no fake &quot;build succeeded&quot; toasts.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl bg-background/80 p-4 ring-1 ring-border/80">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ship checklist</p>
                <ol className="mt-3 list-none space-y-2.5 text-[12px] text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-[11px] font-bold text-accent">
                      1
                    </span>
                    <span>
                      Run a full build so files and previews are saved to your app record — publishing attaches to that.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-[11px] font-bold text-accent">
                      2
                    </span>
                    <span>Review the readiness scan — fix blockers before store packaging.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-[11px] font-bold text-accent">
                      3
                    </span>
                    <span>Pick <strong className="text-foreground">Android</strong> or <strong className="text-foreground">iOS</strong> — we only queue jobs your plan actually unlocks.</span>
                  </li>
                </ol>
              </div>

              <div className="flex rounded-xl bg-muted/50 p-1 ring-1 ring-border/70">
                <button
                  type="button"
                  onClick={() => setMobilePlatform("android")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold transition",
                    mobilePlatform === "android" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground",
                  )}
                >
                  <Smartphone className="size-3.5" strokeWidth={1.75} />
                  Android
                </button>
                <button
                  type="button"
                  onClick={() => setMobilePlatform("ios")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-semibold transition",
                    mobilePlatform === "ios" ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground",
                  )}
                >
                  <Apple className="size-3.5" strokeWidth={1.75} />
                  iOS
                </button>
              </div>

              {mobilePlatform === "ios" ? (
                <div className="rounded-2xl bg-surface/60 p-4 ring-1 ring-border/80">
                  <p className="text-[13px] font-semibold text-foreground">App Store pipeline</p>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                    iOS exports use the same honest job system as Android once the builder contract includes signing &
                    notarization. You&apos;ll see real statuses here — no pretend &quot;uploaded to App Store&quot;
                    toasts.
                  </p>
                  <p className="mt-3 text-[11.5px] text-muted-foreground">Pro+ will unlock this segment first; you can still prepare assets and copy using the scan above.</p>
                </div>
              ) : null}

              {mobilePlatform === "android" ? (
                <>
              <div className="rounded-2xl bg-surface/50 p-4 ring-1 ring-border/80">
                <p className="text-[12px] font-semibold text-foreground">App Store Readiness Scan</p>
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  Rule-based review of generated files ({readiness?.fileCount ?? 0} on disk).
                </p>
                <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                  {!readiness?.issues?.length && !loading && (
                    <li className="flex gap-2 text-[12px] text-muted-foreground">
                      <CheckCircle2 className="size-4 shrink-0 text-positive" strokeWidth={1.75} />
                      No blockers detected — run a build that saves files first if this stays empty.
                    </li>
                  )}
                  {readiness?.issues.map((issue, i) => (
                    <li
                      key={`${issue.code}-${i}`}
                      className="flex gap-2 rounded-lg bg-background/80 px-2 py-1.5 text-[11.5px] ring-1 ring-border/60"
                    >
                      <AlertTriangle
                        className={cn(
                          "mt-0.5 size-3.5 shrink-0",
                          issue.severity === "error" ? "text-destructive" : "text-amber-600",
                        )}
                        strokeWidth={1.75}
                      />
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant={androidLocked ? "secondary" : "accent"}
                  className="flex-1"
                  disabled={androidLocked || !projectId || wrapBusy !== null}
                  onClick={() => void requestWrap("android_apk")}
                >
                  {androidLocked ? (
                    <span className="flex items-center gap-1">
                      <Lock className="size-3.5" /> Android APK — upgrade
                    </span>
                  ) : wrapBusy === "android_apk" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Queue Android APK"
                  )}
                </Button>
                <Button
                  type="button"
                  variant={androidLocked ? "secondary" : "accent"}
                  className="flex-1"
                  disabled={androidLocked || !projectId || wrapBusy !== null}
                  onClick={() => void requestWrap("android_aab")}
                >
                  {androidLocked ? (
                    <span className="flex items-center gap-1">
                      <Lock className="size-3.5" /> Android AAB — upgrade
                    </span>
                  ) : wrapBusy === "android_aab" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Queue Android AAB"
                  )}
                </Button>
              </div>

              {androidLocked && (
                <Link
                  href="/pricing"
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-violet-600 px-4 py-2.5 text-center text-[12.5px] font-semibold text-white shadow-md transition hover:opacity-95"
                >
                  Unlock mobile builds
                </Link>
              )}

              {lastWrapJob && (
                <div className="rounded-xl bg-muted/30 px-3 py-2 text-[11.5px] ring-1 ring-border/70">
                  <p className="font-semibold text-foreground">Last job · {lastWrapJob.status}</p>
                  {lastWrapJob.error_message && (
                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{lastWrapJob.error_message}</p>
                  )}
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                Switch to the iOS tab above for the App Store roadmap — Android jobs queue from this section.
              </p>
                </>
              ) : null}
            </div>
          )}

        </motion.div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
