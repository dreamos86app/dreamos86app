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

/** Marks that use `currentColor` for light/dark contrast (not brand hex on dark UI). */
const MONOCHROME_PROVIDERS = new Set<IntegrationProvider>([
  "github",
  "vercel",
  "resend",
  "openai",
]);

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
    wellClassName:
      "bg-[#10A37F]/10 ring-[#10A37F]/22 dark:bg-accent/12 dark:ring-accent/30",
    simpleIcon: siOpenai,
  },
  gemini: {
    title: "Gemini",
    wellClassName:
      "bg-gradient-to-br from-[#4285F4]/14 via-[#9B72CB]/12 to-[#D96570]/12 ring-[#4285F4]/25 dark:from-[#4285F4]/20 dark:via-[#9B72CB]/15 dark:to-[#D96570]/15",
    simpleIcon: siGooglegemini,
  },
};

const SIZE_PX = { sm: 20, md: 26, lg: 34 } as const;

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

/** OpenAI blossom — green in light mode, white on dark cards. */
function OpenAIMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn("shrink-0 text-[#10A37F] dark:text-white", className)}
      aria-hidden
    >
      <path fill="currentColor" d={siOpenai.path} />
    </svg>
  );
}

/** Google Gemini sparkle — gradient star, scaled for visual balance with other marks. */
function GeminiMark({ size, className }: { size: number; className?: string }) {
  const gradId = React.useId().replace(/:/g, "");
  const dim = Math.round(size * 1.18);
  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 24 24"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="48%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path fill={`url(#${gradId})`} d={siGooglegemini.path} />
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
  const forceMono =
    mono &&
    (variant === "mono-light" ||
      variant === "mono-dark" ||
      variant === "brand");
  const useBrandColor = !forceMono;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={undefined}
      aria-hidden
      className={cn(
        "shrink-0",
        forceMono && "text-zinc-900 dark:text-white",
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

  if (provider === "openai") {
    return <OpenAIMark size={px} className={className} />;
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
export function SupabaseIcon(props: Omit<IntegrationIconProps, "provider">) {
  return <IntegrationIcon provider="supabase" {...props} />;
}
export function StripeIcon(props: Omit<IntegrationIconProps, "provider">) {
  return <IntegrationIcon provider="stripe" {...props} />;
}
export function GitHubIcon(props: Omit<IntegrationIconProps, "provider">) {
  return <IntegrationIcon provider="github" variant="mono-light" {...props} />;
}
export function VercelIcon(props: Omit<IntegrationIconProps, "provider">) {
  return <IntegrationIcon provider="vercel" variant="mono-light" {...props} />;
}
export function ResendIcon(props: Omit<IntegrationIconProps, "provider">) {
  return <IntegrationIcon provider="resend" variant="mono-light" {...props} />;
}
export function SlackIcon(props: Omit<IntegrationIconProps, "provider">) {
  return <IntegrationIcon provider="slack" {...props} />;
}
export function OpenAIIcon(props: Omit<IntegrationIconProps, "provider">) {
  return (
    <IntegrationIcon
      provider="openai"
      className={cn("text-[#10A37F] dark:text-white", props.className)}
      {...props}
    />
  );
}
export function GeminiIcon(props: Omit<IntegrationIconProps, "provider">) {
  return <IntegrationIcon provider="gemini" {...props} />;
}

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
        "inline-flex shrink-0 items-center justify-center rounded-xl p-2 shadow-sm ring-1",
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
        className={
          provider === "openai"
            ? "text-[#10A37F] dark:text-white"
            : provider && MONOCHROME_PROVIDERS.has(provider)
              ? "text-zinc-900 dark:text-white"
              : undefined
        }
      />
    </span>
  );
}
