import Link from "next/link";
import { cn } from "@/lib/utils";
import { DreamOS86BrandIcon } from "@/components/brand/dreamos86-brand-icon";

export type DreamOS86BrandLockupVariant = "header" | "sidebar" | "drawer" | "footer" | "auth";

export type DreamOS86BrandLockupSize = "sm" | "md" | "lg";

const VARIANT_STYLES: Record<
  DreamOS86BrandLockupVariant,
  { icon: number; text: string }
> = {
  header: { icon: 30, text: "text-[13px] sm:text-[14px]" },
  sidebar: { icon: 28, text: "text-[13.5px]" },
  drawer: { icon: 30, text: "text-[14px]" },
  footer: { icon: 24, text: "text-[13px]" },
  auth: { icon: 44, text: "text-[17px]" },
};

const SIZE_ICON: Record<DreamOS86BrandLockupSize, number> = {
  sm: 32,
  md: 40,
  lg: 44,
};

export type DreamOS86BrandLockupProps = {
  variant?: DreamOS86BrandLockupVariant;
  size?: DreamOS86BrandLockupSize;
  /** Tighter icon–text spacing (6–8px) for auth pages */
  compact?: boolean;
  gapClassName?: string;
  className?: string;
  href?: string;
  showText?: boolean;
  priority?: boolean;
  onClick?: () => void;
};

/**
 * DreamOS86 platform mark: transparent cloud + wordmark. Not for user/project icons.
 */
export function DreamOS86BrandLockup({
  variant = "header",
  size,
  compact = false,
  gapClassName,
  className,
  href = "/",
  showText = true,
  priority = false,
  onClick,
}: DreamOS86BrandLockupProps) {
  const styles = VARIANT_STYLES[variant];
  const iconPx = size ? SIZE_ICON[size] : styles.icon;
  const inner = (
    <>
      <DreamOS86BrandIcon size={iconPx} alt="" priority={priority} />
      {showText && (
        <span
          className={cn(
            "truncate font-semibold tracking-[-0.03em] text-foreground",
            styles.text,
            variant === "auth" && "-ml-1.5",
          )}
        >
          DreamOS86
        </span>
      )}
    </>
  );

  const rootClass = cn(
    "flex min-w-0 shrink items-center",
    variant === "auth" ? "gap-0.5" : "gap-1",
    gapClassName,
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        onClick={onClick}
        className={rootClass}
        aria-label="DreamOS86 home"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className={rootClass} onClick={onClick} role={onClick ? "button" : undefined}>
      {inner}
    </div>
  );
}
