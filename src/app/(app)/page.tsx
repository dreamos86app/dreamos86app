import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { OsHome } from "@/components/os-home/os-home";
import { PublicLanding } from "@/components/marketing/public-landing";
import { getServerSessionUser } from "@/lib/auth/session";
import { buildAuthCallbackRedirectFromSearchParams } from "@/lib/auth/oauth-redirect";

export const metadata: Metadata = {
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
 * Submitting a prompt from the home quick bar navigates to /create (workspace).
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

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data: recentProjects } = await supabase
    .from("projects")
    .select("id, name, gradient, status, updated_at, preview_url, icon_url")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(8);

  return (
    <Suspense fallback={<OsHomeFallback />}>
      <OsHome recentProjects={recentProjects ?? []} />
    </Suspense>
  );
}
