import { PlatformShell } from "@/components/layout/platform-shell";
import { getServerSessionUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerSessionUser();
  return <PlatformShell homeSessionFromServer={Boolean(user)}>{children}</PlatformShell>;
}
