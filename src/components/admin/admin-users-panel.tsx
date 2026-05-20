"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Loader2,
  Zap,
  AlertCircle,
  X,
  UserX,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { AdminUserListRow } from "@/lib/admin/list-users";

type PlanFilter = "all" | AdminUserListRow["plan_id"];
type StatusFilter = "all" | "active" | "suspended";

function OwnerConfirmCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-[11.5px] text-muted-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>
        Confirm as <strong className="text-foreground">dreamos86app@gmail.com</strong>
      </span>
    </label>
  );
}

function UserDetailDrawer({
  user,
  onClose,
  onUpdated,
}: {
  user: AdminUserListRow;
  onClose: () => void;
  onUpdated: (u: AdminUserListRow) => void;
}) {
  const [detail, setDetail] = React.useState<{
    usage: unknown[];
    buildJobs: unknown[];
    tokenLedger: unknown[];
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [confirmOwner, setConfirmOwner] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [balance, setBalance] = React.useState(String(user.tokens_remaining));
  const [planId, setPlanId] = React.useState(user.plan_id);
  const [acting, setActing] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/users/${user.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          setDetail({
            usage: json.usage ?? [],
            buildJobs: json.buildJobs ?? [],
            tokenLedger: json.tokenLedger ?? [],
          });
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  async function runAction(body: Record<string, unknown>) {
    if (!confirmOwner) {
      toast.error("Confirm as dreamos86app@gmail.com first.");
      return;
    }
    setActing(true);
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, confirmOwner: true }),
    });
    const json = (await res.json()) as { error?: string; user?: AdminUserListRow };
    setActing(false);
    if (!res.ok) {
      toast.error(json.error ?? "Action failed");
      return;
    }
    toast.success("User updated.");
    if (json.user) onUpdated(json.user);
    setReason("");
    setAmount("");
  }

  return (
    <div className="fixed inset-0 z-[10050] flex justify-end bg-foreground/30 backdrop-blur-sm">
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        className="flex h-full w-full max-w-lg flex-col border-l border-border bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={user.full_name ?? user.email} src={user.avatar_url ?? undefined} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{user.full_name ?? user.email}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-surface" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <div className="rounded-lg bg-surface p-3 ring-1 ring-border">
              <p className="text-muted-foreground">Plan</p>
              <p className="font-semibold capitalize">{user.plan_id}</p>
            </div>
            <div className="rounded-lg bg-surface p-3 ring-1 ring-border">
              <p className="text-muted-foreground">Credits</p>
              <p className="font-semibold tabular-nums">
                {user.tokens_remaining.toLocaleString()} / {user.monthly_token_limit.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg bg-surface p-3 ring-1 ring-border">
              <p className="text-muted-foreground">Projects</p>
              <p className="font-semibold">{user.projects_count}</p>
            </div>
            <div className="rounded-lg bg-surface p-3 ring-1 ring-border">
              <p className="text-muted-foreground">Chats</p>
              <p className="font-semibold">{user.conversations_count}</p>
            </div>
            <div className="col-span-2 rounded-lg bg-surface p-3 ring-1 ring-border font-mono text-[10px] text-muted-foreground break-all">
              {user.id}
            </div>
          </div>

          <div className="space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border">
            <p className="text-[12px] font-semibold">Credit actions</p>
            <Input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <OwnerConfirmCheckbox checked={confirmOwner} onChange={setConfirmOwner} />
            <div className="flex flex-wrap gap-2">
              <Input
                type="number"
                placeholder="Add credits"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-28"
              />
              <Button
                size="sm"
                variant="accent"
                disabled={acting || !amount || !reason}
                onClick={() =>
                  void runAction({ action: "add_tokens", amount: parseInt(amount, 10), reason })
                }
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input value={balance} onChange={(e) => setBalance(e.target.value)} className="w-28" />
              <Button
                size="sm"
                variant="secondary"
                disabled={acting || !reason}
                onClick={() =>
                  void runAction({ action: "set_balance", balance: parseInt(balance, 10), reason })
                }
              >
                Set balance
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={acting || !reason}
                onClick={() => void runAction({ action: "reset_monthly", reason })}
              >
                <RefreshCw className="mr-1 size-3" /> Reset monthly
              </Button>
            </div>
          </div>

          <div className="space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border">
            <p className="text-[12px] font-semibold">Plan override (support)</p>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value as AdminUserListRow["plan_id"])}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px]"
            >
              {["free", "starter", "pro", "infinity"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={acting || !reason}
              onClick={() => void runAction({ action: "set_plan", planId, reason })}
            >
              Apply plan
            </Button>
          </div>

          <div className="flex gap-2">
            {user.suspended_at ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={acting || !confirmOwner}
                onClick={() => void runAction({ action: "unsuspend", reason: reason || "reinstated" })}
              >
                Unsuspend
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                disabled={acting || !reason || !confirmOwner}
                onClick={() => void runAction({ action: "suspend", reason })}
              >
                <UserX className="mr-1 size-3" /> Suspend
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2 text-[11px] text-muted-foreground">
              <p>Recent AI usage: {(detail?.usage ?? []).length} rows</p>
              <p>Build jobs: {(detail?.buildJobs ?? []).length} rows</p>
              <p>Credit ledger: {(detail?.tokenLedger ?? []).length} rows</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export function AdminUsersPanel() {
  const [users, setUsers] = React.useState<AdminUserListRow[]>([]);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [planFilter, setPlanFilter] = React.useState<PlanFilter>("all");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<AdminUserListRow | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadUsers = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (planFilter !== "all") params.set("plan", planFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    const qs = params.toString() ? `?${params}` : "";
    const res = await fetch(`/api/admin/users${qs}`);
    const json = (await res.json()) as {
      users?: AdminUserListRow[];
      error?: string;
      warning?: string;
      hint?: string;
      total?: number;
    };
    if (!res.ok) {
      const msg = [json.error, json.hint].filter(Boolean).join(" — ");
      setError(msg || `Failed (${res.status})`);
      setUsers([]);
    } else {
      setUsers(json.users ?? []);
      setError(json.warning ?? null);
    }
    setLoading(false);
  }, [debouncedSearch, planFilter, statusFilter]);

  React.useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search email, name, or user id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="size-3.5 text-muted-foreground" />
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-[12px]"
          >
            <option value="all">All plans</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="infinity">Infinity</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-[12px]"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <Button variant="ghost" size="sm" onClick={() => void loadUsers()}>
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      {error && (
        <motion.div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Could not load users</p>
            <p className="mt-0.5 opacity-90">{error}</p>
            {error.includes("not configured") && (
              <p className="mt-1 text-[12px]">Set SUPABASE_SERVICE_ROLE_KEY on the server.</p>
            )}
          </div>
        </motion.div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-[13px] text-muted-foreground">
          No users match your filters. Accounts in Supabase Auth without profiles are auto-backfilled on load.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-xl)] bg-surface ring-1 ring-border">
          <table className="w-full min-w-[900px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5">User</th>
                <th className="px-4 py-2.5">Plan</th>
                <th className="px-4 py-2.5">Subscription</th>
                <th className="px-4 py-2.5">Credits</th>
                <th className="px-4 py-2.5">Joined</th>
                <th className="px-4 py-2.5">Last active</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <motion.div className="flex items-center gap-2">
                      <Avatar name={u.full_name ?? u.email} src={u.avatar_url ?? undefined} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{u.full_name ?? u.display_name ?? "—"}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>
                      </div>
                    </motion.div>
                  </td>
                  <td className="px-4 py-3 capitalize">{u.plan_id}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        u.suspended_at
                          ? "bg-destructive/15 text-destructive"
                          : "bg-positive/15 text-positive",
                      )}
                    >
                      {u.suspended_at ? "suspended" : u.subscription_status ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {u.tokens_remaining.toLocaleString()}
                    <span className="text-muted-foreground"> / {u.monthly_token_limit.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.last_active_at ? new Date(u.last_active_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" onClick={() => setSelected(u)}>
                      <Zap className="size-3.5 text-accent" /> Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-muted-foreground">{users.length} user(s) shown</p>
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <UserDetailDrawer
            user={selected}
            onClose={() => setSelected(null)}
            onUpdated={(u) => {
              setUsers((prev) => prev.map((row) => (row.id === u.id ? u : row)));
              setSelected(u);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
