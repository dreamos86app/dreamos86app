import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isDreamosOwnerEmail } from "@/lib/admin-owner";
import { buildPaddleAdminConfigStatus } from "@/lib/billing/paddle-config-status";
import { paddleOwnerTestCheckoutEnabled } from "@/lib/billing/paddle-public-checkout";
import { getAppUrl } from "@/lib/app-url";
import { AdminPaddleTestCheckout } from "@/components/admin/admin-paddle-test-checkout";

export const dynamic = "force-dynamic";

export default async function AdminPaddleTestCheckoutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <GateShell title="Sign in required">
        <p className="text-[13px] text-muted-foreground">
          Sign in with the platform owner account to use owner test checkout.
        </p>
        <Link
          href="/auth/login?next=/admin/billing/paddle/test-checkout"
          className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white"
        >
          Sign in
        </Link>
      </GateShell>
    );
  }

  if (!isDreamosOwnerEmail(user.email)) {
    return (
      <GateShell title="Access denied">
        <p className="text-[13px] text-muted-foreground">
          Owner test checkout is restricted to the DreamOS86 platform owner account.
        </p>
        <Link href="/admin/billing/paddle" className="mt-4 text-[13px] text-accent hover:underline">
          ← Back to Paddle billing
        </Link>
      </GateShell>
    );
  }

  const ownerTestEnabled = paddleOwnerTestCheckoutEnabled();
  if (!ownerTestEnabled) {
    return (
      <GateShell title="Owner test checkout disabled">
        <p className="text-[13px] text-muted-foreground">
          Owner test checkout is disabled. Set{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[12px]">PADDLE_OWNER_TEST_CHECKOUT_ENABLED=true</code>{" "}
          and restart or redeploy.
        </p>
        <Link href="/admin/billing/paddle" className="mt-4 text-[13px] text-accent hover:underline">
          ← Back to Paddle billing
        </Link>
      </GateShell>
    );
  }

  const config = buildPaddleAdminConfigStatus(getAppUrl());

  return (
    <div className="dashboard-shell mx-auto max-w-2xl space-y-6 py-8">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">Owner live checkout test</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Production Paddle checkout — verifies pri_* price IDs, custom_data, and webhook entitlements.
        </p>
      </div>
      <AdminPaddleTestCheckout
        userId={user.id}
        userEmail={user.email ?? ""}
        config={config}
      />
    </div>
  );
}

function GateShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="dashboard-shell mx-auto max-w-lg space-y-4 py-12">
      <h1 className="text-[20px] font-bold tracking-tight">{title}</h1>
      <div className="rounded-xl border border-border bg-surface/40 px-4 py-4">{children}</div>
    </div>
  );
}
