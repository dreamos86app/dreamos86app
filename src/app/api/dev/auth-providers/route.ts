import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_PROJECT_REF = "xycqutvqxtkbszytaxbe";

/**
 * Dev-only Supabase OAuth diagnostics (no secrets in response).
 * Enable in production only with DREAMOS_DEV_DIAGNOSTICS=1.
 */
export async function GET() {
  const allow =
    process.env.NODE_ENV !== "production" ||
    process.env.DREAMOS_DEV_DIAGNOSTICS === "1";
  if (!allow) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  const urlOk = url.includes(EXPECTED_PROJECT_REF);
  const authorizeBase = url ? `${url.replace(/\/$/, "")}/auth/v1/authorize` : "";

  let settingsStatus: number | null = null;
  let externalKeys: string[] = [];
  let settingsError: string | null = null;

  if (url && anon) {
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/settings`, {
        headers: {
          apikey: anon,
          Authorization: `Bearer ${anon}`,
        },
        cache: "no-store",
      });
      settingsStatus = res.status;
      if (res.ok) {
        const body = (await res.json()) as {
          external?: Record<string, unknown>;
        };
        externalKeys = Object.keys(body.external ?? {});
      } else {
        const t = await res.text().catch(() => "");
        settingsError = t.slice(0, 280) || `HTTP ${res.status}`;
      }
    } catch (e) {
      settingsError = e instanceof Error ? e.message : "fetch_failed";
    }
  }

  const googleEnabled = externalKeys.some((k) => k.toLowerCase() === "google");
  const githubEnabled = externalKeys.some((k) => k.toLowerCase() === "github");

  return NextResponse.json({
    next_public_supabase_url_ok: urlOk,
    expected_project_ref: EXPECTED_PROJECT_REF,
    url_host: url ? new URL(url).host : null,
    oauth_authorize_url_uses_expected_project: authorizeBase.includes(EXPECTED_PROJECT_REF),
    sample_google_authorize: authorizeBase ? `${authorizeBase}?provider=google` : null,
    sample_github_authorize: authorizeBase ? `${authorizeBase}?provider=github` : null,
    auth_v1_settings_status: settingsStatus,
    external_provider_keys: externalKeys,
    google_provider_config_present: googleEnabled,
    github_provider_config_present: githubEnabled,
    settings_fetch_error: settingsError,
    unsupported_provider_likely_causes: [
      "NEXT_PUBLIC_SUPABASE_URL or keys point at the wrong Supabase project.",
      "Google/GitHub provider is not enabled in that project’s Supabase Auth settings.",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY does not belong to the same project as the URL.",
      "Dev server was not restarted after changing environment variables.",
      "Redirect URL is missing from Supabase Auth URL configuration for this app.",
    ],
  });
}
