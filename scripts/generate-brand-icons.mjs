/**
 * Generate DreamOS86 platform icons from a transparent PNG master.
 * Preserves alpha — no flatten(), no matte stripping, no backgrounds on the main icon.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BRAND_DIR = path.join(ROOT, "public/brand");
const ASSETS_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".cursor",
  "projects",
  "c-Users-XenoD-Desktop-DreamOS86-dreamos-platform",
  "assets",
);

const MASTER_CANDIDATES = [
  path.join(BRAND_DIR, "dreamos86-master-source.png"),
  path.join(BRAND_DIR, "dreamos86-icon-transparent.png"),
  path.join(ROOT, "public/icon.png"),
];

const CANONICAL_ICON = path.join(BRAND_DIR, "dreamos86-icon.png");
const CANONICAL_TRANSPARENT = path.join(BRAND_DIR, "dreamos86-icon-transparent.png");
const MASKABLE_OUT = path.join(BRAND_DIR, "dreamos86-icon-maskable.png");

const PUBLIC_DIR = path.join(ROOT, "public");
const APP_DIR = path.join(ROOT, "src/app");

const PNG_SIZES = [
  { file: "favicon-16x16.png", size: 16 },
  { file: "favicon-32x32.png", size: 32 },
  { file: "favicon-48x48.png", size: 48 },
  { file: "favicon-64x64.png", size: 64 },
  { file: "icon.png", size: 32 },
  { file: "favicon.png", size: 32 },
  { file: "apple-touch-icon.png", size: 180 },
  { file: "favicon-192x192.png", size: 192 },
  { file: "favicon-512x512.png", size: 512 },
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
];

const BRAND_SIZES = [
  { file: "dreamos86-icon-192.png", size: 192 },
  { file: "dreamos86-icon-512.png", size: 512 },
];

const FAVICON_ICO_PATHS = [
  path.join(PUBLIC_DIR, "favicon.ico"),
  path.join(APP_DIR, "favicon.ico"),
];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function findNewestAssetUpload() {
  if (!(await exists(ASSETS_DIR))) return null;
  const names = await fs.readdir(ASSETS_DIR);
  const ranked = names
    .filter((n) => n.endsWith(".png"))
    .map((n) => {
      const lower = n.toLowerCase();
      let score = 0;
      if (lower.includes("for_app_transperent") || lower.includes("for_app_transparent"))
        score += 120;
      if (lower.includes("untitled_design")) score += 100;
      if (lower.includes("dreamos86_trans")) score += 80;
      if (lower.includes("2026-05-20")) score += 20;
      return { name: n, score };
    })
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return null;
  return path.join(ASSETS_DIR, ranked[0].name);
}

async function syncMasterFromAssetsIfNewer() {
  const asset = await findNewestAssetUpload();
  const masterPath = path.join(BRAND_DIR, "dreamos86-master-source.png");
  if (!asset) return masterPath;
  try {
    const [aStat, mStat] = await Promise.all([
      fs.stat(asset),
      exists(masterPath) ? fs.stat(masterPath) : null,
    ]);
    if (!mStat || aStat.mtimeMs > mStat.mtimeMs) {
      await fs.mkdir(BRAND_DIR, { recursive: true });
      await fs.copyFile(asset, masterPath);
      console.log("[generate-brand-icons] Synced master from assets:", path.basename(asset));
    }
  } catch {
    /* use existing master */
  }
  return masterPath;
}

async function resolveMasterSource() {
  const masterPath = await syncMasterFromAssetsIfNewer();
  if (await exists(masterPath)) return masterPath;
  for (const p of MASTER_CANDIDATES) {
    if (await exists(p)) return p;
  }
  return null;
}

const TRANSPARENT_BG = { r: 0, g: 0, b: 0, alpha: 0 };

/** Cloud fill ratio inside square canvas (86–92% visible area). */
const ICON_FILL_RATIO = 0.89;

/**
 * Resize PNG on transparent canvas — icon scaled up (no matte, no background shape).
 */
async function resizeTransparentPng(input, size, output, fillRatio = ICON_FILL_RATIO) {
  const inner = Math.max(8, Math.round(size * fillRatio));
  const iconBuf = await sharp(input)
    .ensureAlpha()
    .resize(inner, inner, {
      fit: "contain",
      background: TRANSPARENT_BG,
      kernel: sharp.kernel.lanczos3,
    })
    .png({ force: true })
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: TRANSPARENT_BG,
    },
  })
    .composite([{ input: iconBuf, gravity: "center" }])
    .png({ compressionLevel: 9, adaptiveFiltering: true, force: true })
    .toFile(output);
}

/** PWA maskable safe zone — separate file only; main icon stays fully transparent. */
async function writeMaskableIcon(input, canvasSize, output) {
  const iconSize = Math.round(canvasSize * 0.72);
  const offset = Math.round((canvasSize - iconSize) / 2);
  const iconBuf = await sharp(input)
    .ensureAlpha()
    .resize(iconSize, iconSize, {
      fit: "contain",
      background: TRANSPARENT_BG,
      kernel: sharp.kernel.lanczos3,
    })
    .png({ force: true })
    .toBuffer();

  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: TRANSPARENT_BG,
    },
  })
    .composite([{ input: iconBuf, left: offset, top: offset }])
    .png({ force: true })
    .toFile(output);
}

/** Build favicon.ico from the same 32px PNG used for /icon.png (DreamOS86 cloud, not Vercel). */
async function writeFaviconIco(pngSourcePath) {
  const sizes = [16, 32, 48];
  const pngBuffers = await Promise.all(
    sizes.map(async (size) => {
      const inner = Math.max(8, Math.round(size * ICON_FILL_RATIO));
      const iconBuf = await sharp(pngSourcePath)
        .ensureAlpha()
        .resize(inner, inner, {
          fit: "contain",
          background: TRANSPARENT_BG,
          kernel: sharp.kernel.lanczos3,
        })
        .png({ force: true })
        .toBuffer();
      return sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: TRANSPARENT_BG,
        },
      })
        .composite([{ input: iconBuf, gravity: "center" }])
        .png({ force: true })
        .toBuffer();
    }),
  );

  const ico = await pngToIco(pngBuffers);
  for (const dest of FAVICON_ICO_PATHS) {
    await fs.writeFile(dest, ico);
    console.log("  wrote", path.relative(ROOT, dest), `(${ico.length} bytes)`);
  }
}

async function writeCanonicalBrandPngs(master) {
  const meta = await sharp(master).metadata();
  const dim = Math.max(meta.width ?? 512, meta.height ?? 512, 512);
  await resizeTransparentPng(master, dim, CANONICAL_ICON);
  await resizeTransparentPng(master, dim, CANONICAL_TRANSPARENT);
  console.log(`  wrote brand/dreamos86-icon.png (${dim}x${dim}, alpha)`);
}

async function main() {
  const master = await resolveMasterSource();
  if (!master) {
    console.error(
      "[generate-brand-icons] Missing master — place transparent PNG at public/brand/dreamos86-master-source.png",
    );
    process.exit(1);
  }

  await fs.mkdir(BRAND_DIR, { recursive: true });
  console.log("[generate-brand-icons] Master:", path.basename(master));

  await fs.copyFile(master, path.join(BRAND_DIR, "dreamos86-master-source.png"));
  await writeCanonicalBrandPngs(master);

  for (const { file, size } of BRAND_SIZES) {
    await resizeTransparentPng(master, size, path.join(BRAND_DIR, file));
    console.log("  wrote brand/", file, `(${size}x${size}, alpha)`);
  }

  for (const { file, size } of PNG_SIZES) {
    await resizeTransparentPng(master, size, path.join(PUBLIC_DIR, file));
    console.log("  wrote", file, `(${size}x${size}, alpha)`);
  }

  await writeMaskableIcon(master, 512, MASKABLE_OUT);
  console.log("  wrote brand/dreamos86-icon-maskable.png (maskable only)");

  const iconPng = path.join(PUBLIC_DIR, "icon.png");
  await resizeTransparentPng(master, 32, iconPng);
  await resizeTransparentPng(master, 32, path.join(APP_DIR, "icon.png"));
  await resizeTransparentPng(master, 180, path.join(APP_DIR, "apple-icon.png"));
  await resizeTransparentPng(master, 180, path.join(PUBLIC_DIR, "apple-touch-icon.png"));

  console.log("  generating favicon.ico from public/icon.png …");
  await writeFaviconIco(iconPng);

  console.log("[generate-brand-icons] Done — alpha preserved; favicon.ico written to public/ and src/app/");
}

main().catch((err) => {
  console.error("[generate-brand-icons] Failed:", err);
  process.exit(1);
});
