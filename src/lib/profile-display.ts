import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/supabase/types";

/**
 * Shared display-name resolution for menus, onboarding, and settings.
 * Order: profile.full_name → OAuth/metadata name → email local-part → "User"
 */
export function resolveDisplayName(
  profile: Profile | null | undefined,
  user: User | null | undefined,
): string {
  const fromProfile = profile?.full_name?.trim();
  if (fromProfile) return fromProfile;

  const meta = user?.user_metadata ?? {};
  const metaFull =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    "";
  if (metaFull) return metaFull;

  const email = (profile?.email || user?.email || "").trim();
  if (email) {
    const prefix = email.split("@")[0]?.trim();
    if (prefix) return prefix;
  }

  return "User";
}
