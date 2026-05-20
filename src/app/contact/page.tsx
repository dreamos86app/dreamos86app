import type { Metadata } from "next";
import { ContactPageContent } from "@/components/marketing/contact-page-content";
import { PublicMarketingShell } from "@/components/marketing/public-marketing-shell";
import { PlatformShell } from "@/components/layout/platform-shell";
import { getServerSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact DreamOS86 — sales, support, billing, and product feedback.",
};

/**
 * Logged-in users keep PlatformShell so session/UI stay consistent (no public-only header).
 * Guests see the public marketing shell.
 */
export default async function ContactPage() {
  const user = await getServerSessionUser();

  if (user) {
    return (
      <PlatformShell homeSessionFromServer>
        <ContactPageContent embedded />
      </PlatformShell>
    );
  }

  return (
    <PublicMarketingShell>
      <ContactPageContent />
    </PublicMarketingShell>
  );
}
