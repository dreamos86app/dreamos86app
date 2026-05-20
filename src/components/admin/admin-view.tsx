"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Users,
  Shield,
  Lock,
  ShieldCheck,
  Mail,
  Activity,
  HardDriveUpload,
  CreditCard,
  Loader2,
} from "lucide-react";
import { variants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AuthHealthPanel } from "@/components/admin/auth-health-panel";
import { DeploymentStatusPanel } from "@/components/admin/deployment-status-panel";
import { ContactRequestsPanel } from "@/components/admin/contact-requests-panel";
import { AdminUsersPanel } from "@/components/admin/admin-users-panel";
import { AdminBillingPanel } from "@/components/admin/admin-billing-panel";
import { AdminAiUsagePanel } from "@/components/admin/admin-ai-usage-panel";

export type AdminTab =
  | "users"
  | "contacts"
  | "ai"
  | "storage"
  | "audit"
  | "auth"
  | "billing";

type Tab = AdminTab;

export function AdminView({ initialTab = "users" }: { initialTab?: AdminTab }) {
  const [activeTab, setActiveTab] = React.useState<Tab>(initialTab);
  const [aiEvents, setAiEvents] = React.useState<
    Array<{
      id: string;
      created_at: string;
      user_id: string;
      user_email: string;
      model_id: string;
      mode: string;
      tokens_charged: number;
      status: string;
      error_message: string | null;
    }>
  >([]);
  const [storageEvents, setStorageEvents] = React.useState<
    Array<{ id: string; created_at: string; user_id: string; properties: Record<string, unknown> }>
  >([]);
  const [auditLogs, setAuditLogs] = React.useState<
    Array<{
      id: string;
      created_at: string;
      action: string;
      admin_user_id: string;
      target_user_id: string | null;
      before_state: unknown;
      after_state: unknown;
    }>
  >([]);
  const [loading, setLoading] = React.useState(false);
  const [auditError, setAuditError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  React.useEffect(() => {
    if (activeTab !== "ai") return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/ai-usage")
      .then(async (res) => {
        const json = (await res.json()) as { events?: typeof aiEvents };
        if (!cancelled) {
          if (res.ok) setAiEvents(json.events ?? []);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  React.useEffect(() => {
    if (activeTab !== "storage") return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/storage-errors")
      .then(async (res) => {
        const json = (await res.json()) as { events?: typeof storageEvents };
        if (!cancelled) {
          if (res.ok) setStorageEvents(json.events ?? []);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  React.useEffect(() => {
    if (activeTab !== "audit") return;
    let cancelled = false;
    setLoading(true);
    setAuditError(null);
    fetch("/api/admin/audit-logs")
      .then(async (res) => {
        const json = (await res.json()) as { logs?: typeof auditLogs; error?: string };
        if (!cancelled) {
          if (res.ok) setAuditLogs(json.logs ?? []);
          else setAuditError(json.error ?? "Failed to load audit log");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "users", label: "Users", icon: Users },
    { id: "contacts", label: "Contacts", icon: Mail },
    { id: "ai", label: "AI usage", icon: Activity },
    { id: "storage", label: "Uploads", icon: HardDriveUpload },
    { id: "audit", label: "Audit log", icon: Shield },
    { id: "billing", label: "Billing", icon: CreditCard },
    { id: "auth", label: "System", icon: ShieldCheck },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <motion.div variants={variants.fadeUp} initial="hidden" animate="show">
        <div className="mb-1 flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-destructive/10 ring-1 ring-destructive/20">
            <Lock className="size-4 text-destructive" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold text-foreground">Admin Panel</h1>
            <p className="text-[12px] text-muted-foreground">
              Owner-only — server enforced for dreamos86app@gmail.com
            </p>
          </div>
        </div>
      </motion.div>

      <div className="flex w-full max-w-full flex-wrap gap-1 rounded-xl bg-surface p-1 ring-1 ring-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="size-3.5" strokeWidth={1.75} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "users" && <AdminUsersPanel />}
      {activeTab === "contacts" && <ContactRequestsPanel />}
      {activeTab === "billing" && <AdminBillingPanel />}

      {activeTab === "ai" && <AdminAiUsagePanel />}

      {activeTab === "storage" && (
        <div className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : storageEvents.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">No upload errors recorded</p>
          ) : (
            storageEvents.map((ev) => (
              <pre key={ev.id} className="rounded-lg bg-surface p-3 text-[11px] ring-1 ring-border overflow-auto">
                {JSON.stringify(ev.properties, null, 2)}
              </pre>
            ))
          )}
        </div>
      )}

      {activeTab === "audit" && (
        <div className="space-y-2">
          {auditError && <p className="text-[13px] text-destructive">{auditError}</p>}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : auditLogs.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">No admin audit events yet</p>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="rounded-lg bg-surface px-4 py-3 ring-1 ring-border">
                <p className="text-[12.5px] font-medium">{log.action}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()} · target {log.target_user_id?.slice(0, 8) ?? "—"}
                </p>
                {Boolean(log.before_state ?? log.after_state) && (
                  <pre className="mt-2 max-h-24 overflow-auto text-[10px] text-muted-foreground">
                    {JSON.stringify({ before: log.before_state, after: log.after_state })}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "auth" && (
        <div className="max-w-2xl space-y-6">
          <DeploymentStatusPanel />
          <AuthHealthPanel />
        </div>
      )}
    </div>
  );
}
