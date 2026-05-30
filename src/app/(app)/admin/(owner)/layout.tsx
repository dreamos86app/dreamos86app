import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDreamosOwnerEmail } from "@/lib/admin-owner";

export default async function AdminOwnerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login?next=/admin");

  if (!isDreamosOwnerEmail(user.email)) {
    redirect("/?admin=forbidden");
  }

  return <>{children}</>;
}
