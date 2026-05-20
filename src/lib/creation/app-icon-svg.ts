/**
 * Deterministic app icon SVG when image generation is unavailable.
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

export function generateAppIconSvg(appName: string, category?: string): string {
  const seed = `${category ?? ""}:${appName}`.trim() || "app";
  const h = hashString(seed);
  const [c1, c2] = PALETTES[h % PALETTES.length]!;
  const initials = appName
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "A";

  const glyph =
    initials.length === 1
      ? initials
      : initials.slice(0, 2);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="${appName}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#g)"/>
  <text x="64" y="74" text-anchor="middle" font-family="system-ui,Segoe UI,sans-serif" font-size="44" font-weight="700" fill="#ffffff">${glyph}</text>
</svg>`;
}

export function appIconSvgDataUrl(appName: string, category?: string): string {
  const svg = generateAppIconSvg(appName, category);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
