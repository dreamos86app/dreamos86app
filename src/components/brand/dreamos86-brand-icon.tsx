import { cn } from "@/lib/utils";

/** Canonical transparent DreamOS86 platform mark (not user/project app icons). */
export const DREAMOS86_BRAND_ICON_VERSION = "12";
export const DREAMOS86_BRAND_ICON_SRC = `/brand/dreamos86-icon.png?v=${DREAMOS86_BRAND_ICON_VERSION}`;

export type DreamOS86BrandIconProps = {
  size?: number;
  className?: string;
  alt?: string;
  priority?: boolean;
};

/**
 * DreamOS86 platform branding — transparent PNG only, no forced background tile.
 */
export function DreamOS86BrandIcon({
  size = 32,
  className,
  alt = "DreamOS86",
  priority = false,
}: DreamOS86BrandIconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={DREAMOS86_BRAND_ICON_SRC}
      alt={alt}
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
    />
  );
}
