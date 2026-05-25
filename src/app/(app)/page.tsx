import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { PublicLanding } from "@/components/marketing/public-landing";
import { getServerSessionUser } from "@/lib/auth/session";
import { buildAuthCallbackRedirectFromSearchParams } from "@/lib/auth/oauth-redirect";
import { createClient } from "@/lib/supabase/server";
import { readBannerSvg, buildBannerForProject } from "@/lib/projects/backfill-project-media";
import { ensureProjectIconSvg } from "@/lib/projects/ensure-project-icon";
import { isUserVisibleProject } from "@/lib/projects/user-visible-projects";

const OsHome = dynamic(() => import("@/components/os-home/os-home").then((m) => m.OsHome), {
  loading: () => <OsHomeFallback />,
});

export const metadata = {
  title: "Home",
  description: "The AI-native operating system for building software.",
};

function OsHomeFallback() {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center text-[13px] text-muted-foreground">
      Loading…
    </div>
  );
}
/**
 * `/` — Logged-in OS home, or public marketing landing when anonymous.
 *
 * Submitting a prompt from the home quick bar creates a project via /api/projects/start-from-home, then opens the builder.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") qs.set(key, value);
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const requestBase = `${proto}://${host}`;
  const oauthRedirect = buildAuthCallbackRedirectFromSearchParams(qs, requestBase);
  if (oauthRedirect) {
    redirect(oauthRedirect);
  }

  const user = await getServerSessionUser();

  if (!user) {
    return <PublicLanding />;
  }

  type RecentProject = {
    id: string;
    name: string;
    gradient: string;
    status: string;
    framework: string | null;
    updated_at: string;
    preview_url: string | null;
    icon_url: string | null;
    icon_svg: string | null;
    banner_svg: string | null;
    build_status: string | null;
    metadata: Record<string, unknown> | null;
    published_subdomain: string | null;
    is_favorite: boolean | null;
  };

  let recentProjects: RecentProject[] = [];

  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("projects")
      .select(
        "id, name, app_name, gradient, status, framework, updated_at, preview_url, icon_url, icon_svg, metadata, published_subdomain, build_status, is_favorite",
      )
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(24);

    const rows = data ?? [];
    for (const row of rows) {
      const meta =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      const displayName =
        (typeof row.app_name === "string" && row.app_name.trim()) || row.name;
      const icon_svg = ensureProjectIconSvg(displayName, row.icon_svg);
      const banner_svg = readBannerSvg(row.metadata) ?? buildBannerForProject(row);

      recentProjects.push({
        id: row.id,
        name: displayName,
        gradient: row.gradient,
        status: row.status,
        framework: row.framework,
        updated_at: row.updated_at,
        preview_url: row.preview_url,
        icon_url: row.icon_url,
        icon_svg,
        banner_svg,
        build_status: row.build_status,
        published_subdomain: row.published_subdomain,
        metadata: meta,
        is_favorite: row.is_favorite ?? false,
      });
    }
    recentProjects = recentProjects
      .filter(isUserVisibleProject)
      .sort((a, b) => {
        const favDiff = Number(Boolean(b.is_favorite)) - Number(Boolean(a.is_favorite));
        if (favDiff !== 0) return favDiff;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      })
      .slice(0, 12);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[home] recent projects load failed:", err);
    }
  }

  return (
    <Suspense fallback={<OsHomeFallback />}>
      <OsHome recentProjects={recentProjects} />
    </Suspense>
  );
}
