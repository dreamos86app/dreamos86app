"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Monitor,
  Smartphone,
  Tablet,
  RefreshCw,
  ExternalLink,
  Globe,
  ShieldAlert,
  Loader2,
  Wifi,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BuildPreviewSurface } from "@/components/create/workspace/build-preview-surface";

type Viewport = "desktop" | "tablet" | "mobile";

const VIEWPORT_CONFIG: Record<Viewport, { width: string; label: string; icon: React.ElementType }> = {
  desktop: { width: "w-full max-w-[1280px]", label: "Desktop", icon: Monitor },
  tablet: { width: "w-[768px] max-w-full", label: "Tablet", icon: Tablet },
  mobile: { width: "w-[390px] max-w-full", label: "Mobile", icon: Smartphone },
};

// Section zones used by the visual targeting overlay
const TARGET_ZONES = [
  { id: "header", label: "Header / Navbar", y: 0, h: 12 },
  { id: "hero", label: "Hero Section", y: 12, h: 25 },
  { id: "content", label: "Main Content", y: 37, h: 35 },
  { id: "features", label: "Features / Cards", y: 72, h: 15 },
  { id: "footer", label: "Footer", y: 87, h: 13 },
];

export interface PreviewPanelProps {
  url: string | null;
  /** Inline HTML for generated previews (e.g. from `preview/index.html`). */
  srcDoc?: string | null;
  appName?: string | null;
  thinking?: boolean;
  className?: string;
  editMode?: boolean;
  /** Whether any generation has completed. Edit targeting only activates when true. */
  hasGenerated?: boolean;
  onEditTarget?: (info: { x: number; y: number; section: string }) => void;
  /** Build-mode assistant excerpt — powers plan/progress surface (not full code). */
  buildAssistantText?: string;
  tokensEstimate?: number | null;
}

export function PreviewPanel({
  url,
  srcDoc = null,
  appName,
  thinking = false,
  className,
  editMode = false,
  hasGenerated = false,
  onEditTarget,
  buildAssistantText = "",
  tokensEstimate = null,
}: PreviewPanelProps) {
  const [viewport, setViewport] = React.useState<Viewport>("desktop");
  const [reloadKey, setReloadKey] = React.useState(0);
  const [iframeError, setIframeError] = React.useState(false);
  const [iframeLoading, setIframeLoading] = React.useState(false);
  const [hoveredZone, setHoveredZone] = React.useState<string | null>(null);

  React.useEffect(() => {
    setIframeError(false);
    if (url || srcDoc) setIframeLoading(true);
  }, [url, srcDoc, reloadKey]);

  const hasInline = !!srcDoc?.trim();
  const hasUrl = !!url || hasInline;
  const displayHost = hasInline
    ? "live preview (generated)"
    : hasUrl && url
      ? (() => {
          try { return new URL(url).host; }
          catch { return url; }
        })()
      : "preview";

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-xl)] bg-background ring-1 ring-border",
        className,
      )}
    >
      {/* Browser chrome topbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface/80 px-3 py-1.5 backdrop-blur">
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-red-400/70" />
          <span className="size-2.5 rounded-full bg-amber-400/70" />
          <span className="size-2.5 rounded-full bg-green-400/70" />
        </div>

        {/* URL bar */}
        <div className="flex flex-1 items-center gap-1.5 rounded-md bg-background/80 px-2.5 py-1 ring-1 ring-border/60">
          <Globe className="size-3 shrink-0 text-muted-foreground/60" strokeWidth={1.75} />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
            {displayHost}
          </span>
          {(hasUrl && iframeLoading) && (
            <Wifi className="size-3 shrink-0 animate-pulse text-accent/60" strokeWidth={1.75} />
          )}
          {(hasUrl && !iframeLoading && !iframeError) && (
            <span className="size-1.5 shrink-0 rounded-full bg-green-400" />
          )}
        </div>

        {/* Viewport switch */}
        <div className="flex items-center gap-0.5 rounded-md bg-background p-0.5 ring-1 ring-border">
          {(["desktop", "tablet", "mobile"] as Viewport[]).map((vp) => {
            const { icon: Icon, label } = VIEWPORT_CONFIG[vp];
            return (
              <button
                key={vp}
                type="button"
                aria-label={`${label} preview`}
                aria-pressed={viewport === vp}
                onClick={() => setViewport(vp)}
                title={label}
                className={cn(
                  "flex size-6 items-center justify-center rounded-[5px] transition",
                  viewport === vp
                    ? "bg-surface text-foreground shadow-[var(--shadow-xs)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" strokeWidth={1.7} />
              </button>
            );
          })}
        </div>

        {/* Reload */}
        <button
          type="button"
          aria-label="Reload preview"
          disabled={!hasUrl}
          onClick={() => setReloadKey((k) => k + 1)}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface hover:text-foreground disabled:opacity-40"
        >
          <RefreshCw className="size-3" strokeWidth={1.7} />
        </button>

        {/* Open in new tab */}
        {hasUrl && (
          <a
            href={url!}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open in new tab"
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface hover:text-foreground"
          >
            <ExternalLink className="size-3" strokeWidth={1.7} />
          </a>
        )}
      </div>

      {/* Viewport surface */}
      <div className="relative flex-1 overflow-hidden bg-atmosphere">
        {/* Edit mode: guard — only show targeting overlay after generation exists */}
        {editMode && !hasGenerated && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 text-center px-8">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20">
                <Pencil className="size-5 text-amber-500" strokeWidth={1.75} />
              </div>
              <p className="text-[14px] font-semibold text-foreground">Nothing to edit yet</p>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed max-w-[260px]">
                Generate your first interface to begin surgical editing.
              </p>
              <p className="text-[11.5px] text-muted-foreground/60">
                Switch to <span className="font-semibold text-accent">Build</span> mode and describe your app.
              </p>
            </div>
          </div>
        )}

        {/* Edit mode targeting overlay — only when generation exists */}
        {editMode && hasGenerated && (
          <div className="absolute inset-0 z-30 cursor-crosshair">
            {/* Dim overlay */}
            <div className="absolute inset-0 bg-background/30 backdrop-blur-[1px]" />

            {/* Zone labels */}
            {TARGET_ZONES.map((zone) => (
              <div
                key={zone.id}
                onMouseEnter={() => setHoveredZone(zone.id)}
                onMouseLeave={() => setHoveredZone(null)}
                onClick={() => onEditTarget?.({ x: 0, y: zone.y, section: zone.label })}
                style={{ top: `${zone.y}%`, height: `${zone.h}%` }}
                className="absolute inset-x-0 transition-all duration-150"
              >
                {hoveredZone === zone.id && (
                  <motion.div
                    layoutId="zone-highlight"
                    className="absolute inset-2 rounded-xl ring-2 ring-accent/60 bg-accent/10"
                    transition={{ duration: 0.12 }}
                  />
                )}
                <div className={cn(
                  "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-all",
                  hoveredZone === zone.id
                    ? "bg-accent text-white shadow-lg scale-105"
                    : "bg-background/80 text-foreground/70 ring-1 ring-border backdrop-blur-sm",
                )}>
                  {zone.label}
                </div>
              </div>
            ))}

            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-background/90 px-4 py-2 text-[12px] font-medium text-foreground backdrop-blur ring-1 ring-border shadow-lg">
              Click a section to target it for editing
            </div>
          </div>
        )}

        {!hasUrl && (
          <BuildPreviewSurface
            thinking={thinking}
            assistantText={buildAssistantText}
            tokensEstimate={tokensEstimate}
            appName={appName}
          />
        )}

        {hasUrl && (
          <div className="absolute inset-0 flex items-center justify-center p-3">
            {/* Mobile black pillars */}
            {viewport === "mobile" && (
              <div className="absolute inset-0 bg-black/90" />
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={`${viewport}-${reloadKey}`}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[0_8px_32px_-8px_rgba(0,0,0,0.18)] ring-1 ring-border",
                  // Desktop: full width, natural 16:9-ish height
                  viewport === "desktop" && "h-full w-full",
                  // Tablet: 768px wide, full height
                  viewport === "tablet" && "h-full w-[768px] max-w-full",
                  // Mobile: phone form factor (9:19.5), centered
                  viewport === "mobile" && "relative z-10 w-[390px] max-w-full shadow-[0_0_40px_rgba(0,0,0,0.5)]",
                )}
              >
                {/* Mobile notch decoration */}
                {viewport === "mobile" && (
                  <>
                    <div className="absolute top-0 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-b-xl bg-black/90" />
                    <style>{`.mobile-iframe { height: calc(100vh - 80px); max-height: 844px; }`}</style>
                  </>
                )}

                {/* Loading overlay */}
                <AnimatePresence>
                  {iframeLoading && (
                    <motion.div
                      initial={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="size-5 animate-spin text-accent" strokeWidth={1.75} />
                        <span className="text-[11px] text-muted-foreground">Loading preview…</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {iframeError ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-destructive/20">
                      <ShieldAlert className="size-5 text-destructive" strokeWidth={1.7} />
                    </div>
                    <p className="text-[13px] font-semibold text-foreground">Preview blocked</p>
                    <p className="max-w-xs text-[11.5px] text-muted-foreground">
                      The app sets <code className="rounded bg-muted px-1 text-[10px]">X-Frame-Options</code>{" "}
                      preventing embedding. Open it directly instead.
                    </p>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-accent/90"
                      >
                        Open app
                        <ExternalLink className="size-3.5" strokeWidth={2} />
                      </a>
                    )}
                  </div>
                ) : (
                  <iframe
                    key={reloadKey}
                    src={hasInline ? undefined : url ?? undefined}
                    srcDoc={hasInline ? (srcDoc ?? undefined) : undefined}
                    title={appName ?? "App preview"}
                    className="h-full w-full flex-1 border-0"
                    onLoad={() => setIframeLoading(false)}
                    onError={() => {
                      setIframeError(true);
                      setIframeLoading(false);
                    }}
                    sandbox="allow-scripts allow-same-origin"
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {/* AI streaming overlay */}
        <AnimatePresence>
          {hasUrl && thinking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 flex items-end justify-center pb-6"
            >
              <div className="flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-[11.5px] font-medium text-foreground shadow-lg ring-1 ring-border backdrop-blur">
                <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                Updating preview…
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
