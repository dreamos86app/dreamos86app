import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OsHome } from "@/components/os-home/os-home";

export const metadata: Metadata = {
  title: "DreamOS86 — Home",
  description: "The AI-native operating system for building software.",
};

/**
 * `/` — The DreamOS86 OS home.
 *
 * Always shows the OS dashboard: greeting, create bar, recent apps,
 * templates, and community highlights.
 *
 * Submitting a prompt from this page navigates to /create (workspace).
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: recentProjects } = await supabase
    .from("projects")
    .select("id, name, gradient, status, updated_at, preview_url")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(8);

  return <OsHome recentProjects={recentProjects ?? []} />;
}
