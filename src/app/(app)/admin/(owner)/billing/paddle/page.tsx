import { AdminPaddleConfigPanel } from "@/components/admin/admin-paddle-config-panel";

export default function AdminPaddleBillingPage() {
  return (
    <div className="dashboard-shell mx-auto max-w-4xl space-y-6 py-8">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">Paddle billing</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          DreamOS86 subscription catalog — credentials and price ID mapping (no secrets shown).
        </p>
      </div>
      <AdminPaddleConfigPanel />
    </div>
  );
}
