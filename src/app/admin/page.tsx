import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminView } from "@/components/admin/admin-view";

const OWNER_EMAIL = "dreamos86app@gmail.com";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Backend-enforced: must be the owner email OR have is_admin flag
  if (user.email !== OWNER_EMAIL) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin) redirect("/");
  }

  return <AdminView />;
}
