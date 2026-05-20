"use client";

import * as React from "react";
import {
  siGithub,
  siGooglegemini,
  siOpenai,
  siResend,
  siStripe,
  siSupabase,
  siVercel,
  type SimpleIcon,
} from "simple-icons";
import { cn } from "@/lib/utils";

export type IntegrationProvider =
  | "supabase"
  | "stripe"
  | "github"
  | "vercel"
  | "resend"
  | "slack"
  | "openai"
  | "gemini";

const PROVIDER_ALIASES: Record<string, IntegrationProvider> = {
  supabase: "supabase",
  stripe: "stripe",
  github: "github",
  vercel: "vercel",
  resend: "resend",
  slack: "slack",
  openai: "openai",
  gemini: "gemini",
  googlegemini: "gemini",
};

/** Monochrome marks — use `currentColor` + light/dark text classes for contrast. */
const MONOCHROME_PROVIDERS = new Set<IntegrationProvider>(["github", "vercel", "resend"]);

export const INTEGRATION_BRANDS: Record<
  IntegrationProvider,
  {
    title: string;
    wellClassName: string;
    simpleIcon?: SimpleIcon;
  }
> = {
  supabase: {
    title: "Supabase",
    wellClassName: "bg-[#3ECF8E]/15 ring-[#3ECF8E]/25",
    simpleIcon: siSupabase,
  },
  stripe: {
    title: "Stripe",
    wellClassName: "bg-[#635BFF]/12 ring-[#635BFF]/20",
    simpleIcon: siStripe,
  },
  github: {
    title: "GitHub",
    wellClassName: "bg-[#f6f8fa] ring-border/70 dark:bg-white/12 dark:ring-white/15",
    simpleIcon: siGithub,
  },
  vercel: {
    title: "Vercel",
    wellClassName: "bg-[#f6f8fa] ring-border/70 dark:bg-white/12 dark:ring-white/15",
    simpleIcon: siVercel,
  },
  resend: {
    title: "Resend",
    wellClassName: "bg-[#f6f8fa] ring-border/70 dark:bg-white/12 dark:ring-white/15",
    simpleIcon: siResend,
  },
  slack: {
    title: "Slack",
    wellClassName: "bg-[#4A154B]/10 ring-[#4A154B]/20",
  },
  openai: {
    title: "OpenAI",
    wellClassName: "bg-[#10A37F]/12 ring-[#10A37F]/25",
    simpleIcon: siOpenai,
  },
  gemini: {
    title: "Gemini",
    wellClassName: "bg-gradient-to-br from-[#4285F4]/12 via-[#9B72CB]/10 to-[#D96570]/10 ring-[#4285F4]/20",
    simpleIcon: siGooglegemini,
  },
};

const SIZE_PX = { sm: 18, md: 24, lg: 32 } as const;

function resolveProvider(input: string | undefined): IntegrationProvider | null {
  if (!input) return null;
  return PROVIDER_ALIASES[input.toLowerCase()] ?? null;
}

function resolvePx(size: IntegrationIconProps["size"], pixelSize?: number): number {
  if (typeof pixelSize === "number") return pixelSize;
  if (typeof size === "number") return size;
  if (size === "sm" || size === "md" || size === "lg") return SIZE_PX[size];
  return SIZE_PX.md;
}

function SlackMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path
        fill="#E01E5A"
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
      />
      <path
        fill="#36C5F0"
        d="M8.835 5.042a2.528 2.528 0 0 1-2.52-2.52A2.528 2.528 0 0 1 8.835 0a2.528 2.528 0 0 1 2.523 2.522v2.52H8.835zm0 1.271a2.528 2.528 0 0 1 2.523 2.521 2.528 2.528 0 0 1-2.523 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.313z"
      />
      <path
        fill="#2EB67D"
        d="M18.956 8.835a2.528 2.528 0 0 1 2.522-2.52A2.528 2.528 0 0 1 24 8.835a2.528 2.528 0 0 1-2.522 2.523h-2.522V8.835zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.528 2.528 0 0 1-2.523-2.521V2.522A2.528 2.528 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.313z"
      />
      <path
        fill="#ECB22E"
        d="M15.165 18.956a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.165 24a2.528 2.528 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.528 2.528 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.521h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.313z"
      />
    </svg>
  );
}

/** Google Gemini four-point star (brand colors). */
function GeminiMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <path
        fill="#4285F4"
        d="M12 2.25 9.82 9.04 3.25 11.25l6.57 2.21L12 20.25l2.18-6.79 6.57-2.21-6.57-2.21L12 2.25z"
      />
      <path
        fill="#9B72CB"
        d="M12 6.1 10.95 9.35 7.7 10.4l3.25 1.05L12 14.75l1.05-3.3 3.25-1.05-3.25-1.05L12 6.1z"
        opacity={0.95}
      />
      <path fill="#D96570" d="M12 8.4 11.45 10.2 9.65 10.75 11.45 11.3 12 13.1l.55-1.8 1.8-.55-1.8-.55L12 8.4z" />
      <path
        fill="#F4B400"
        d="M18.2 12.1c-1.35.5-2.5 1.35-3.35 2.45.85 1.1 2 1.95 3.35 2.45-.5-1.35-1.35-2.5-2.45-3.35 1.1-.85 1.95-2 2.45-3.35z"
        opacity={0.85}
      />
    </svg>
  );
}

function SimpleIconMark({
  icon,
  provider,
  size,
  variant,
  className,
}: {
  icon: SimpleIcon;
  provider: IntegrationProvider;
  size: number;
  variant?: "brand" | "mono-light" | "mono-dark";
  className?: string;
}) {
  const mono = MONOCHROME_PROVIDERS.has(provider);
  const useBrandColor = !mono || variant === "brand";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={undefined}
      aria-hidden
      className={cn(
        "shrink-0",
        mono && variant !== "brand" && "text-[#181717] dark:text-white",
        className,
      )}
    >
      <path
        fill={useBrandColor ? `#${icon.hex}` : "currentColor"}
        d={icon.path}
      />
    </svg>
  );
}

export interface IntegrationIconProps {
  /** Preferred prop name */
  provider?: IntegrationProvider | string;
  /** Back-compat with older call sites */
  slug?: string;
  size?: "sm" | "md" | "lg" | number;
  pixelSize?: number;
  /** `mono-light` / `mono-dark` force contrast on monochrome marks; default follows theme. */
  variant?: "brand" | "mono-light" | "mono-dark";
  className?: string;
  title?: string;
}

export function IntegrationIcon({
  provider: providerProp,
  slug,
  size = "md",
  pixelSize,
  variant = "brand",
  className,
  title,
}: IntegrationIconProps) {
  const provider = resolveProvider(providerProp ?? slug);
  const px = resolvePx(size, pixelSize);

  if (!provider) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-muted font-bold text-muted-foreground",
          className,
        )}
        style={{ width: px, height: px, fontSize: px * 0.38 }}
        title={title}
        aria-hidden={!title}
      >
        ?
      </span>
    );
  }

  if (provider === "slack") {
    return <SlackMark size={px} className={className} />;
  }

  if (provider === "gemini") {
    return <GeminiMark size={px} className={className} />;
  }

  const brand = INTEGRATION_BRANDS[provider];
  const icon = brand.simpleIcon;
  if (!icon) {
    return null;
  }

  return (
    <SimpleIconMark
      icon={icon}
      provider={provider}
      size={px}
      variant={variant}
      className={className}
    />
  );
}

export interface IntegrationIconWellProps {
  provider: IntegrationProvider | string;
  size?: "sm" | "md" | "lg";
  wellClassName?: string;
  className?: string;
  title?: string;
}

/** Circular icon well — consistent size and centering across cards. */
export function IntegrationIconWell({
  provider: providerProp,
  size = "md",
  wellClassName,
  className,
  title,
}: IntegrationIconWellProps) {
  const provider = resolveProvider(
    typeof providerProp === "string" ? providerProp : providerProp,
  );
  const brand = provider ? INTEGRATION_BRANDS[provider] : null;

  const wellSize =
    size === "sm" ? "size-8" : size === "lg" ? "size-12" : "size-10";
  const iconSize = size === "sm" ? "sm" : size === "lg" ? "lg" : "md";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full p-2 shadow-sm ring-1",
        wellSize,
        brand?.wellClassName ?? "bg-background ring-border/60",
        wellClassName,
        className,
      )}
      title={title ?? brand?.title}
    >
      <IntegrationIcon
        provider={provider ?? "supabase"}
        size={iconSize}
        title={title ?? brand?.title}
      />
    </span>
  );
}
