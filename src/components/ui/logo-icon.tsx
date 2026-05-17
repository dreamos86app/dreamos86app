import { cn } from "@/lib/utils";

/**
 * DreamOS86 logo icon.
 *
 * Uses a plain <img> tag to guarantee native browser PNG alpha rendering.
 * Next.js Image optimization can silently convert PNG → WebP/JPEG and fill
 * transparent pixels with black. By bypassing the optimizer entirely we ensure
 * the PNG is served RAW and alpha is fully preserved on every surface.
 *
 * No mix-blend-mode. No background fill. No opacity tricks.
 * Transparent areas are genuinely transparent — they show whatever is behind.
 */
export function LogoIcon({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt="DreamOS86"
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
      decoding="async"
      fetchPriority="high"
    />
  );
}
