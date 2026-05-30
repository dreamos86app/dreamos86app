import sharp from "sharp";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ensurePublicBucket } from "@/lib/supabase/ensure-storage-bucket";
import { routeImageProvider } from "@/lib/ai/image-provider-routing";
import { isProviderConfigured } from "@/lib/ai/provider-availability";
import { generateAppIconSvg } from "@/lib/creation/app-icon-svg";
import { isDreamOSMediaProviderDisabled } from "@/lib/media/dreamos-media-router";

const LOGO_BUCKET = "project-icons";
const MIN_LOGO_PX = 720;

export type LogoAssetUrls = {
  iconUrl: string;
  iconOriginalUrl: string;
  icon512Url: string;
  icon192Url: string;
  faviconUrl: string;
};

export type LogoGenerationResult =
  | {
      ok: true;
      urls: LogoAssetUrls;
      provider: string;
      modelId: string;
      providerCostUsd: number;
      width: number;
      height: number;
    }
  | {
      ok: false;
      error: string;
      providerCostUsd: number;
    };

export function buildLogoPrompt(input: {
  appName: string;
  shortDescription: string;
  category?: string;
}): string {
  const purpose = input.shortDescription.trim() || input.category || "modern SaaS app";
  return [
    `Create a premium modern app icon for ${input.appName}, ${purpose}.`,
    "Use a clean abstract symbol that reflects the app's purpose and audience.",
    "App-store-ready square icon, soft depth, crisp edges, modern SaaS style.",
    "No readable text, no watermark, high contrast, minimal but memorable.",
    "Clean background suitable for app cards and favicons.",
  ].join(" ");
}

/** True when OpenAI image generation can run (key present, not kill-switched). */
export function isAiLogoGenerationAvailable(): boolean {
  if (isDreamOSMediaProviderDisabled("logo")) return false;
  return isProviderConfigured("openai");
}

async function generateOpenAiLogo(prompt: string): Promise<{
  buffer: Buffer;
  providerCostUsd: number;
  modelId: string;
}> {
  const route = routeImageProvider("image_simple");
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured for logo generation");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: route.modelId,
      prompt,
      n: 1,
      size: "1024x1024",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Image provider failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = json.data?.[0];
  if (!item) throw new Error("Image provider returned no image");

  let buffer: Buffer;
  if (item.b64_json) {
    buffer = Buffer.from(item.b64_json, "base64");
  } else if (item.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error("Failed to download generated image");
    buffer = Buffer.from(await imgRes.arrayBuffer());
  } else {
    throw new Error("Image provider returned unsupported payload");
  }

  return { buffer, providerCostUsd: route.estimatedCostUsd, modelId: route.modelId };
}

async function validateLogoBuffer(buffer: Buffer): Promise<{ ok: true; width: number; height: number } | { ok: false; error: string }> {
  if (!buffer.length) return { ok: false, error: "empty_image" };
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < MIN_LOGO_PX || height < MIN_LOGO_PX) {
    return { ok: false, error: `image_too_small_${width}x${height}` };
  }
  const format = meta.format;
  if (!format || !["png", "jpeg", "webp"].includes(format)) {
    return { ok: false, error: `unsupported_format_${format ?? "unknown"}` };
  }
  return { ok: true, width, height };
}

async function uploadLogoDerivatives(
  projectId: string,
  operationId: string,
  source: Buffer,
): Promise<LogoAssetUrls> {
  const admin = createSupabaseAdmin();
  const bucket = await ensurePublicBucket(admin, LOGO_BUCKET);
  if (!bucket.ok) throw new Error(bucket.error);

  const basePath = `${projectId}/${operationId}`;
  const png1024 = await sharp(source).resize(1024, 1024, { fit: "cover" }).png().toBuffer();
  const png512 = await sharp(source).resize(512, 512, { fit: "cover" }).png().toBuffer();
  const png192 = await sharp(source).resize(192, 192, { fit: "cover" }).png().toBuffer();
  const png64 = await sharp(source).resize(64, 64, { fit: "cover" }).png().toBuffer();

  const uploads: Array<{ path: string; body: Buffer; contentType: string }> = [
    { path: `${basePath}/icon-1024.png`, body: png1024, contentType: "image/png" },
    { path: `${basePath}/icon-512.png`, body: png512, contentType: "image/png" },
    { path: `${basePath}/icon-192.png`, body: png192, contentType: "image/png" },
    { path: `${basePath}/favicon-64.png`, body: png64, contentType: "image/png" },
  ];

  for (const file of uploads) {
    const { error } = await admin.storage.from(LOGO_BUCKET).upload(file.path, file.body, {
      contentType: file.contentType,
      upsert: true,
      cacheControl: "86400",
    });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  }

  const pub = (path: string) => admin.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  const iconOriginalUrl = pub(`${basePath}/icon-1024.png`);
  const icon512Url = pub(`${basePath}/icon-512.png`);
  const icon192Url = pub(`${basePath}/icon-192.png`);
  const faviconUrl = pub(`${basePath}/favicon-64.png`);

  return {
    iconUrl: icon512Url,
    iconOriginalUrl,
    icon512Url,
    icon192Url,
    faviconUrl,
  };
}

/**
 * Polished brand icon from deterministic SVG → PNG (no OpenAI, no Action Credits).
 */
export async function generateBrandIconFromSvg(input: {
  projectId: string;
  operationId: string;
  appName: string;
  category?: string;
}): Promise<LogoGenerationResult> {
  try {
    const svg = generateAppIconSvg(input.appName, input.category);
    const buffer = await sharp(Buffer.from(svg)).resize(1024, 1024).png().toBuffer();
    const validated = await validateLogoBuffer(buffer);
    if (!validated.ok) {
      return { ok: false, error: validated.error, providerCostUsd: 0 };
    }
    const urls = await uploadLogoDerivatives(input.projectId, input.operationId, buffer);
    return {
      ok: true,
      urls,
      provider: "dreamos",
      modelId: "brand_svg_v1",
      providerCostUsd: 0,
      width: validated.width,
      height: validated.height,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "brand_svg_failed",
      providerCostUsd: 0,
    };
  }
}

export async function generateAppLogo(input: {
  projectId: string;
  operationId: string;
  appName: string;
  shortDescription: string;
  category?: string;
}): Promise<LogoGenerationResult> {
  const route = routeImageProvider("image_simple");

  if (!isAiLogoGenerationAvailable()) {
    return generateBrandIconFromSvg({
      projectId: input.projectId,
      operationId: input.operationId,
      appName: input.appName,
      category: input.category,
    });
  }

  let providerCostUsd = 0;

  try {
    const prompt = buildLogoPrompt(input);
    const generated = await generateOpenAiLogo(prompt);
    providerCostUsd = generated.providerCostUsd;

    const validated = await validateLogoBuffer(generated.buffer);
    if (!validated.ok) {
      const fallback = await generateBrandIconFromSvg({
        projectId: input.projectId,
        operationId: input.operationId,
        appName: input.appName,
        category: input.category,
      });
      return fallback.ok ? fallback : { ok: false, error: validated.error, providerCostUsd: 0 };
    }

    const urls = await uploadLogoDerivatives(input.projectId, input.operationId, generated.buffer);
    return {
      ok: true,
      urls,
      provider: route.provider,
      modelId: generated.modelId,
      providerCostUsd,
      width: validated.width,
      height: validated.height,
    };
  } catch {
    return generateBrandIconFromSvg({
      projectId: input.projectId,
      operationId: input.operationId,
      appName: input.appName,
      category: input.category,
    });
  }
}

export function buildFallbackIconSvg(appName: string, category?: string): string {
  return generateAppIconSvg(appName, category);
}
