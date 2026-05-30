/**
 * Deterministic app icon SVG when image generation is unavailable.
 * Produces polished gradient tiles with category-aware glyphs (no API key required).
 */

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const PALETTES = [
  ["#1e6bff", "#60a5fa"],
  ["#6366f1", "#a78bfa"],
  ["#0ea5e9", "#38bdf8"],
  ["#059669", "#34d399"],
  ["#d97706", "#fbbf24"],
  ["#dc2626", "#f87171"],
  ["#7c3aed", "#c4b5fd"],
  ["#0891b2", "#67e8f9"],
];

function normalizeCategory(category?: string): string {
  return (category ?? "productivity").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/** Simple vector mark per category (centered in 128×128 viewBox). */
function categoryGlyph(category?: string): string {
  const c = normalizeCategory(category);
  if (c.includes("portfolio") || c.includes("creative") || c.includes("gallery")) {
    return `<rect x="34" y="38" width="28" height="22" rx="4" fill="#ffffff" opacity="0.95"/><rect x="66" y="48" width="28" height="22" rx="4" fill="#ffffff" opacity="0.75"/><rect x="44" y="68" width="40" height="26" rx="4" fill="#ffffff" opacity="0.88"/>`;
  }
  if (c.includes("restaurant") || c.includes("food") || c.includes("cafe")) {
    return `<circle cx="64" cy="58" r="18" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.95"/><path d="M52 78 L76 78" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.9"/>`;
  }
  if (c.includes("shop") || c.includes("commerce") || c.includes("store") || c.includes("ecommerce")) {
    return `<path d="M44 52 L84 52 L78 88 L50 88 Z" fill="#ffffff" opacity="0.92"/><path d="M54 52 C54 42 74 42 74 52" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.9"/>`;
  }
  if (c.includes("saas") || c.includes("software") || c.includes("devtools")) {
    return `<rect x="40" y="44" width="48" height="10" rx="3" fill="#ffffff" opacity="0.9"/><rect x="40" y="60" width="36" height="10" rx="3" fill="#ffffff" opacity="0.75"/><rect x="40" y="76" width="42" height="10" rx="3" fill="#ffffff" opacity="0.85"/>`;
  }
  if (c.includes("finance") || c.includes("bank")) {
    return `<path d="M40 82 L88 82 L64 42 Z" fill="#ffffff" opacity="0.9"/>`;
  }
  if (c.includes("health") || c.includes("medical") || c.includes("fitness")) {
    return `<rect x="58" y="44" width="12" height="44" rx="3" fill="#ffffff" opacity="0.92"/><rect x="44" y="58" width="40" height="12" rx="3" fill="#ffffff" opacity="0.92"/>`;
  }
  if (c.includes("education") || c.includes("course") || c.includes("learn")) {
    return `<path d="M64 44 L88 54 L64 64 L40 54 Z" fill="#ffffff" opacity="0.9"/><rect x="52" y="64" width="24" height="28" rx="3" fill="#ffffff" opacity="0.8"/>`;
  }
  return "";
}

function initialsGlyph(appName: string): string {
  const initials = appName
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "A";
  const glyph = initials.length === 1 ? initials : initials.slice(0, 2);
  return `<text x="64" y="74" text-anchor="middle" font-family="system-ui,Segoe UI,sans-serif" font-size="44" font-weight="700" fill="#ffffff">${glyph}</text>`;
}

export function generateAppIconSvg(appName: string, category?: string): string {
  const seed = `${category ?? ""}:${appName}`.trim() || "app";
  const h = hashString(seed);
  const [c1, c2] = PALETTES[h % PALETTES.length]!;
  const mark = categoryGlyph(category) || initialsGlyph(appName);
  const safeName = appName.replace(/[<>&"']/g, "");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${safeName}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#g)"/>
  ${mark}
</svg>`;
}

export function appIconSvgDataUrl(appName: string, category?: string): string {
  const svg = generateAppIconSvg(appName, category);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
