import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Auth gate for all /admin routes. Owner-only areas use admin/(owner)/layout.tsx. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login?next=/admin");

  return <>{children}</>;
}
