import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { assertActionCreditsAffordable } from "@/lib/action-credits/assert-action-credits-affordable";
import { chargeActionCredit } from "@/lib/action-credits/charge-action-credit";
import { quoteLogoRegenerationCredits } from "@/lib/action-credits/logo-generation-pricing";
import {
  isDreamOSMediaProviderDisabled,
  routeDreamOSMedia,
} from "@/lib/media/dreamos-media-router";
import { generateAppName } from "@/lib/projects/app-name-generator";
import {
  buildFallbackIconSvg,
  generateAppLogo,
  generateBrandIconFromSvg,
  isAiLogoGenerationAvailable,
  type LogoAssetUrls,
} from "@/lib/projects/app-logo-generation";

type Writer = SupabaseClient<Database>;

export type AppIdentityResult = {
  appName: string;
  slug: string;
  shortDescription: string;
  category: string;
  namingConfidence: number;
  namingSource: "build_intent" | "fallback";
  iconSvg: string;
  iconUrl: string | null;
  logoAssets: Partial<LogoAssetUrls>;
  logoGenerationStatus: "generated" | "fallback" | "skipped" | "insufficient_credits" | "failed";
  logoGenerationError: string | null;
  logoGenerationActionCreditCost: number;
  logoGenerationOperationId: string;
  reused: boolean;
  userNotice?: string;
};

export type CreateAppIdentityInput = {
  writer: Writer;
  userId: string;
  userEmail?: string | null;
  projectId: string;
  buildOperationId: string;
  buildIntent: string;
  planSummary?: string;
  categoryHint?: string;
  userSelectedModelId?: string | null;
  onProgress?: (step: string) => void;
  /** Skip AI logo (e.g. idempotent reuse). */
  skipLogo?: boolean;
};

function metaRecord(metadata: Json | null | undefined): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

function readStoredIdentity(meta: Record<string, unknown>, buildOperationId: string): AppIdentityResult | null {
  const identity = meta.app_identity;
  if (!identity || typeof identity !== "object") return null;
  const row = identity as Record<string, unknown>;
  if (row.build_operation_id !== buildOperationId) return null;
  if (typeof row.app_name !== "string") return null;

  return {
    appName: row.app_name,
    slug: typeof row.slug === "string" ? row.slug : row.app_name.toLowerCase(),
    shortDescription: typeof row.short_description === "string" ? row.short_description : "",
    category: typeof row.category === "string" ? row.category : "productivity",
    namingConfidence: typeof row.naming_confidence === "number" ? row.naming_confidence : 0.8,
    namingSource: row.naming_source === "fallback" ? "fallback" : "build_intent",
    iconSvg: typeof row.icon_svg === "string" ? row.icon_svg : buildFallbackIconSvg(row.app_name),
    iconUrl: typeof row.icon_url === "string" ? row.icon_url : null,
    logoAssets: {
      iconOriginalUrl: typeof row.icon_original_url === "string" ? row.icon_original_url : undefined,
      icon512Url: typeof row.icon_512_url === "string" ? row.icon_512_url : undefined,
      icon192Url: typeof row.icon_192_url === "string" ? row.icon_192_url : undefined,
      faviconUrl: typeof row.favicon_url === "string" ? row.favicon_url : undefined,
    },
    logoGenerationStatus:
      row.logo_generation_status === "generated" ||
      row.logo_generation_status === "fallback" ||
      row.logo_generation_status === "skipped" ||
      row.logo_generation_status === "insufficient_credits" ||
      row.logo_generation_status === "failed"
        ? row.logo_generation_status
        : "fallback",
    logoGenerationError: typeof row.logo_generation_error === "string" ? row.logo_generation_error : null,
    logoGenerationActionCreditCost:
      typeof row.logo_generation_action_credit_cost === "number" ? row.logo_generation_action_credit_cost : 0,
    logoGenerationOperationId:
      typeof row.logo_generation_operation_id === "string"
        ? row.logo_generation_operation_id
        : `${buildOperationId}:logo`,
    reused: true,
  };
}

export async function ensureIdempotentIdentity(
  writer: Writer,
  projectId: string,
  buildOperationId: string,
): Promise<AppIdentityResult | null> {
  const { data } = await writer.from("projects").select("metadata").eq("id", projectId).maybeSingle();
  return readStoredIdentity(metaRecord(data?.metadata), buildOperationId);
}

export async function persistAppIdentity(
  writer: Writer,
  projectId: string,
  userId: string,
  identity: AppIdentityResult,
  buildOperationId: string,
): Promise<void> {
  const { data: cur } = await writer
    .from("projects")
    .select("metadata, name")
    .eq("id", projectId)
    .eq("owner_id", userId)
    .maybeSingle();

  const prevMeta = metaRecord(cur?.metadata);
  const curName = cur?.name?.trim() ?? "";
  const shouldRename = !curName || /^new app$/i.test(curName) || /^new build$/i.test(curName) || /^untitled/i.test(curName);

  const identityMeta = {
    build_operation_id: buildOperationId,
    app_name: identity.appName,
    slug: identity.slug,
    short_description: identity.shortDescription,
    category: identity.category,
    naming_confidence: identity.namingConfidence,
    naming_source: identity.namingSource,
    icon_svg: identity.iconSvg,
    icon_url: identity.iconUrl,
    icon_original_url: identity.logoAssets.iconOriginalUrl ?? null,
    icon_512_url: identity.logoAssets.icon512Url ?? null,
    icon_192_url: identity.logoAssets.icon192Url ?? null,
    favicon_url: identity.logoAssets.faviconUrl ?? null,
    logo_generation_status: identity.logoGenerationStatus,
    logo_generation_error: identity.logoGenerationError,
    logo_generated_at: identity.logoGenerationStatus === "generated" ? new Date().toISOString() : null,
    logo_generation_action_credit_cost: identity.logoGenerationActionCreditCost,
    logo_generation_operation_id: identity.logoGenerationOperationId,
  };

  const patch: Record<string, unknown> = {
    app_name: identity.appName,
    short_description: identity.shortDescription.slice(0, 240),
    category: identity.category.slice(0, 64),
    icon_svg: identity.iconSvg,
    metadata: {
      ...prevMeta,
      app_identity: identityMeta,
      app_name: identity.appName,
    } as Json,
  };

  if (shouldRename) {
    patch.name = identity.appName.slice(0, 80);
    patch.slug = identity.slug.slice(0, 48);
  }
  if (identity.iconUrl) {
    patch.icon_url = identity.iconUrl;
  }

  await writer.from("projects").update(patch as never).eq("id", projectId).eq("owner_id", userId);
}

export async function createAppIdentityForBuild(input: CreateAppIdentityInput): Promise<AppIdentityResult> {
  const existing = await ensureIdempotentIdentity(input.writer, input.projectId, input.buildOperationId);
  if (existing) return existing;

  const { data: projRow } = await input.writer
    .from("projects")
    .select("icon_url, metadata, name")
    .eq("id", input.projectId)
    .maybeSingle();
  const prevMeta = metaRecord(projRow?.metadata);
  const prevIdentity = prevMeta.app_identity;
  if (
    !input.skipLogo &&
    projRow?.icon_url &&
    prevIdentity &&
    typeof prevIdentity === "object" &&
    (prevIdentity as Record<string, unknown>).logo_generation_status === "generated"
  ) {
    const row = prevIdentity as Record<string, unknown>;
    const reused: AppIdentityResult = {
      appName: typeof row.app_name === "string" ? row.app_name : projRow.name ?? "Dream App",
      slug: typeof row.slug === "string" ? row.slug : "dream-app",
      shortDescription: typeof row.short_description === "string" ? row.short_description : "",
      category: typeof row.category === "string" ? row.category : "productivity",
      namingConfidence: 0.9,
      namingSource: "build_intent",
      iconSvg: typeof row.icon_svg === "string" ? row.icon_svg : buildFallbackIconSvg(projRow.name ?? "Dream App"),
      iconUrl: projRow.icon_url,
      logoAssets: {
        iconOriginalUrl: typeof row.icon_original_url === "string" ? row.icon_original_url : undefined,
        icon512Url: typeof row.icon_512_url === "string" ? row.icon_512_url : undefined,
        icon192Url: typeof row.icon_192_url === "string" ? row.icon_192_url : undefined,
        faviconUrl: typeof row.favicon_url === "string" ? row.favicon_url : undefined,
      },
      logoGenerationStatus: "generated",
      logoGenerationError: null,
      logoGenerationActionCreditCost: 0,
      logoGenerationOperationId: `${input.buildOperationId}:logo`,
      reused: true,
    };
    await persistAppIdentity(input.writer, input.projectId, input.userId, reused, input.buildOperationId);
    return reused;
  }

  input.onProgress?.("Naming your app");
  const named = await generateAppName({
    buildIntent: input.buildIntent,
    planSummary: input.planSummary,
    writer: input.writer,
    userId: input.userId,
    userEmail: input.userEmail,
    operationId: input.buildOperationId,
    projectId: input.projectId,
    userSelectedModelId: input.userSelectedModelId,
  });

  const category = input.categoryHint?.trim() || "productivity";
  const logoOperationId = `${input.buildOperationId}:logo`;
  let iconSvg = buildFallbackIconSvg(named.appName, category);
  let iconUrl: string | null = null;
  let logoAssets: Partial<LogoAssetUrls> = {};
  let logoGenerationStatus: AppIdentityResult["logoGenerationStatus"] = "skipped";
  let logoGenerationError: string | null = null;
  let logoGenerationActionCreditCost = 0;
  let userNotice: string | undefined;

  if (!input.skipLogo) {
    input.onProgress?.("Designing app icon");
    const mediaRoute = routeDreamOSMedia("logo");
    const providerDisabled = isDreamOSMediaProviderDisabled("logo");
    const aiAvailable = isAiLogoGenerationAvailable();

    if (providerDisabled) {
      logoGenerationStatus = "failed";
      logoGenerationError = "logo_provider_disabled";
      userNotice = "Logo generation is temporarily unavailable.";
    } else if (aiAvailable) {
      const afford = await assertActionCreditsAffordable({
        ownerUserId: input.userId,
        projectId: input.projectId,
        actionType: "app_logo_generation",
        providerCostUsd: mediaRoute.estimatedProviderCostUsd,
      });

      if (afford.ok) {
        const charge = await chargeActionCredit({
          ownerUserId: input.userId,
          projectId: input.projectId,
          actionType: "app_logo_generation",
          operationId: logoOperationId,
          provider: mediaRoute.internal.provider,
          providerCostUsd: mediaRoute.estimatedProviderCostUsd,
          metadata: {
            dreamos_label: mediaRoute.userLabel,
            project_id: input.projectId,
            build_operation_id: input.buildOperationId,
          },
        });

        if (charge.ok) {
          const logo = await generateAppLogo({
            projectId: input.projectId,
            operationId: logoOperationId,
            appName: named.appName,
            shortDescription: named.shortDescription,
            category,
          });

          if (logo.ok) {
            input.onProgress?.("Saving brand assets");
            logoGenerationActionCreditCost = charge.charged;
            iconUrl = logo.urls.iconUrl;
            logoAssets = logo.urls;
            logoGenerationStatus = "generated";
          } else {
            logoGenerationError = logo.error;
          }
        }
      }
    }

    if (!iconUrl && !providerDisabled) {
      const brand = await generateBrandIconFromSvg({
        projectId: input.projectId,
        operationId: logoOperationId,
        appName: named.appName,
        category,
      });
      if (brand.ok) {
        input.onProgress?.("Saving brand assets");
        iconUrl = brand.urls.iconUrl;
        logoAssets = brand.urls;
        logoGenerationStatus = "generated";
        logoGenerationError = null;
        userNotice = undefined;
      } else if (!logoGenerationError) {
        logoGenerationError = brand.error;
      }
    }
  }

  if (!iconUrl) {
    const useInlineFallback =
      logoGenerationStatus !== "generated" &&
      (logoGenerationStatus === "skipped" || logoGenerationStatus === "failed" || logoGenerationStatus === "insufficient_credits");
    if (useInlineFallback) {
      logoGenerationStatus = logoGenerationStatus === "skipped" ? "fallback" : "fallback";
      iconSvg = buildFallbackIconSvg(named.appName, category);
    }
  }

  const result: AppIdentityResult = {
    appName: named.appName,
    slug: named.slug,
    shortDescription: named.shortDescription,
    category,
    namingConfidence: named.namingConfidence,
    namingSource: named.source,
    iconSvg,
    iconUrl,
    logoAssets,
    logoGenerationStatus,
    logoGenerationError,
    logoGenerationActionCreditCost,
    logoGenerationOperationId: logoOperationId,
    reused: false,
    userNotice,
  };

  await persistAppIdentity(input.writer, input.projectId, input.userId, result, input.buildOperationId);
  return result;
}

export async function regenerateAppLogo(input: {
  writer: Writer;
  userId: string;
  projectId: string;
  operationId: string;
  appName: string;
  shortDescription: string;
  category?: string;
}): Promise<
  | { ok: true; identity: AppIdentityResult; charged: number }
  | { ok: false; error: string; code: "insufficient" | "generation" | "storage" }
> {
  const mediaRoute = routeDreamOSMedia("logo");
  const quote = quoteLogoRegenerationCredits(mediaRoute.estimatedProviderCostUsd);

  const afford = await assertActionCreditsAffordable({
    ownerUserId: input.userId,
    projectId: input.projectId,
    actionType: "app_logo_regeneration",
    providerCostUsd: mediaRoute.estimatedProviderCostUsd,
    dynamicFloor: quote.finalActionCredits,
  });
  if (!afford.ok) {
    return { ok: false, error: "Action Credits depleted.", code: "insufficient" };
  }

  const charge = await chargeActionCredit({
    ownerUserId: input.userId,
    projectId: input.projectId,
    actionType: "app_logo_regeneration",
    operationId: input.operationId,
    provider: mediaRoute.internal.provider,
    providerCostUsd: mediaRoute.estimatedProviderCostUsd,
    metadata: { dreamos_label: mediaRoute.userLabel, regenerate: true },
  });

  if (!charge.ok) {
    return {
      ok: false,
      error: charge.error,
      code: charge.code === "insufficient" ? "insufficient" : "generation",
    };
  }

  const logo = await generateAppLogo({
    projectId: input.projectId,
    operationId: input.operationId,
    appName: input.appName,
    shortDescription: input.shortDescription,
    category: input.category,
  });

  if (!logo.ok) {
    return { ok: false, error: logo.error, code: "generation" };
  }

  const identity: AppIdentityResult = {
    appName: input.appName,
    slug: input.appName.toLowerCase().replace(/\s+/g, "-"),
    shortDescription: input.shortDescription,
    category: input.category ?? "productivity",
    namingConfidence: 1,
    namingSource: "build_intent",
    iconSvg: buildFallbackIconSvg(input.appName, input.category),
    iconUrl: logo.urls.iconUrl,
    logoAssets: logo.urls,
    logoGenerationStatus: "generated",
    logoGenerationError: null,
    logoGenerationActionCreditCost: charge.charged,
    logoGenerationOperationId: input.operationId,
    reused: false,
  };

  await persistAppIdentity(input.writer, input.projectId, input.userId, identity, input.operationId);
  return { ok: true, identity, charged: charge.charged };
}
