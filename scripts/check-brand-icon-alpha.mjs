/**
 * Verify DreamOS86 platform icons keep alpha and favicon.ico is not the Vercel default.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

/** Default Vercel template favicon.ico byte size — must not ship in production. */
const VERCEL_DEFAULT_FAVICON_SIZE = 25931;

const PNG_CHECKS = [
  { label: "canonical brand icon", path: "public/brand/dreamos86-icon.png" },
  { label: "public icon.png", path: "public/icon.png" },
  { label: "apple-touch-icon", path: "public/apple-touch-icon.png" },
  { label: "favicon 32", path: "public/favicon-32x32.png" },
  { label: "app icon", path: "src/app/icon.png" },
];

const FAVICON_ICO_PATHS = [
  { label: "public/favicon.ico", path: "public/favicon.ico" },
  { label: "src/app/favicon.ico", path: "src/app/favicon.ico" },
];

const CORNER_OFFSETS = [
  [0, 0],
  [1, 0],
  [0, 1],
];

function cornerAlpha(data, width, x, y) {
  const i = (y * width + x) * 4;
  return data[i + 3];
}

async function checkPngTransparency(relPath) {
  const abs = path.join(ROOT, relPath);
  try {
    await fs.access(abs);
  } catch {
    return { ok: false, error: `missing: ${relPath}` };
  }

  const meta = await sharp(abs).metadata();
  if (!meta.hasAlpha) {
    return { ok: false, error: `${relPath}: no alpha channel (flattened?)` };
  }

  const { data, info } = await sharp(abs).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;

  let transparentCorners = 0;
  for (const [dx, dy] of CORNER_OFFSETS) {
    const corners = [
      cornerAlpha(data, w, dx, dy),
      cornerAlpha(data, w, w - 1 - dx, dy),
      cornerAlpha(data, w, dx, h - 1 - dy),
      cornerAlpha(data, w, w - 1 - dx, h - 1 - dy),
    ];
    if (corners.some((a) => a < 32)) transparentCorners += 1;
  }

  if (transparentCorners === 0) {
    return {
      ok: false,
      error: `${relPath}: corners are opaque — likely gray/white matte (flattened)`,
    };
  }

  let opaqueGrayMatte = 0;
  let opaqueBlack = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a > 240 && r < 12 && g < 12 && b < 12) opaqueBlack += 1;
    if (a > 240 && Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && r > 180 && r < 245) {
      opaqueGrayMatte += 1;
    }
  }
  const total = data.length / 4;
  if (opaqueBlack / total > 0.35) {
    return {
      ok: false,
      error: `${relPath}: ${((opaqueBlack / total) * 100).toFixed(1)}% opaque black — matte background`,
    };
  }
  if (opaqueGrayMatte / total > 0.25) {
    return {
      ok: false,
      error: `${relPath}: ${((opaqueGrayMatte / total) * 100).toFixed(1)}% opaque gray — flattened canvas`,
    };
  }

  return { ok: true, width: w, height: h, hasAlpha: true };
}

async function checkFaviconIco(relPath) {
  const abs = path.join(ROOT, relPath);
  try {
    const stat = await fs.stat(abs);
    if (stat.size === VERCEL_DEFAULT_FAVICON_SIZE) {
      return {
        ok: false,
        error: `${relPath}: ${stat.size} bytes matches Vercel default favicon.ico — replace with DreamOS86 icon`,
      };
    }
    if (stat.size < 500) {
      return { ok: false, error: `${relPath}: suspiciously small (${stat.size} bytes)` };
    }
    const iconStat = await fs.stat(path.join(ROOT, "public/icon.png"));
    if (stat.mtimeMs < iconStat.mtimeMs - 5000) {
      return {
        ok: false,
        error: `${relPath}: older than public/icon.png — regenerate with npm run icons:generate`,
      };
    }
    return { ok: true, size: stat.size, mtime: stat.mtime.toISOString() };
  } catch {
    return { ok: false, error: `missing: ${relPath}` };
  }
}

async function main() {
  let failed = false;

  for (const { label, path: rel } of PNG_CHECKS) {
    const result = await checkPngTransparency(rel);
    if (result.ok) {
      console.log(`[icons:check] OK ${label} (${result.width}x${result.height}, alpha)`);
    } else {
      console.error(`[icons:check] FAIL ${label}:`, result.error);
      failed = true;
    }
  }

  const icoResults = [];
  for (const { label, path: rel } of FAVICON_ICO_PATHS) {
    const result = await checkFaviconIco(rel);
    icoResults.push({ label, result });
    if (result.ok) {
      console.log(`[icons:check] OK ${label} (${result.size} bytes, not Vercel default)`);
    } else {
      console.error(`[icons:check] FAIL ${label}:`, result.error);
      failed = true;
    }
  }

  if (icoResults.length === 2 && icoResults.every((r) => r.result.ok)) {
    if (icoResults[0].result.size !== icoResults[1].result.size) {
      console.error(
        "[icons:check] FAIL favicon.ico mismatch: public and src/app must be identical (Next.js uses src/app/favicon.ico)",
      );
      failed = true;
    } else {
      console.log("[icons:check] OK public/favicon.ico and src/app/favicon.ico match");
    }
  }

  if (failed) process.exit(1);
  console.log("[icons:check] All checks passed.");
}

main().catch((err) => {
  console.error("[icons:check] Error:", err);
  process.exit(1);
});
