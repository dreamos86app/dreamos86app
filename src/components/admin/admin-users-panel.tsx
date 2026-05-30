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

  Mail,

} from "lucide-react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Avatar } from "@/components/ui/avatar";

import { Skeleton } from "@/components/ui/skeleton";

import { PlanBadge } from "@/components/billing/plan-badge";

import { toast } from "@/lib/toast";

import type { AdminUserListRow } from "@/lib/admin/list-users";

import { CopyIdButton } from "@/components/identity/copy-id-button";

import { truncateIdentityId } from "@/lib/identity/dreamos-identity";

import { logUiAction } from "@/lib/diagnostics/dreamos-logger";
import { parseCreditAmountInput } from "@/lib/credits/parse-credit-amount";
type PlanFilter = "all" | AdminUserListRow["plan_id"];

type StatusFilter = "all" | "active" | "suspended";



type PendingActionBody = Record<string, unknown> & {

  action: string;

  targetUserId: string;

  reason?: string;

  amount?: number;

  balance?: number;

  planId?: string;

};



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

  const [reason, setReason] = React.useState("");

  const [amount, setAmount] = React.useState("");

  const [balance, setBalance] = React.useState(String(user.tokens_remaining));

  const [actionAmount, setActionAmount] = React.useState("");

  const [actionBalance, setActionBalance] = React.useState(String(user.action_credits_remaining));

  const [planId, setPlanId] = React.useState(user.plan_id);

  const [acting, setActing] = React.useState(false);

  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const [otp, setOtp] = React.useState("");

  const [devOtpHint, setDevOtpHint] = React.useState<string | null>(null);
  const [otpDeliveryChannel, setOtpDeliveryChannel] = React.useState<
    "resend" | "dev_console" | "none" | null
  >(null);
  const [otpDeliveryMessage, setOtpDeliveryMessage] = React.useState<string | null>(null);



  React.useEffect(() => {

    setBalance(String(user.tokens_remaining));

    setActionBalance(String(user.action_credits_remaining));

    setPlanId(user.plan_id);

  }, [user.id, user.tokens_remaining, user.action_credits_remaining, user.plan_id]);



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



  async function requestConfirmation(body: PendingActionBody) {

    if (!reason.trim() && body.action !== "unsuspend") {

      toast.error("Reason is required.");

      logUiAction("validation_failed", "Admin action missing reason", { component: "AdminUsersPanel" });

      return;

    }

    logUiAction("click_started", `Request admin OTP: ${body.action}`, { component: "AdminUsersPanel" });

    setActing(true);

    setDevOtpHint(null);
    setOtpDeliveryChannel(null);
    setOtpDeliveryMessage(null);

    const res = await fetch("/api/admin/confirmations/request", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      credentials: "include",

      body: JSON.stringify({ ...body, reason: reason.trim() || body.reason }),

    });

    const json = (await res.json()) as {
      error?: string;
      pendingId?: string;
      devOtpHint?: string;
      message?: string;
      deliveryChannel?: "resend" | "dev_console" | "none";
      deliveredToInbox?: boolean;
      emailError?: string;
    };

    setActing(false);

    if (!res.ok) {

      logUiAction("api_failed", json.error ?? "OTP request failed", { component: "AdminUsersPanel" });

      toast.error(json.error ?? "Could not send confirmation code");

      return;

    }

    setPendingId(json.pendingId ?? null);
    setDevOtpHint(json.devOtpHint ?? null);
    setOtpDeliveryChannel(json.deliveryChannel ?? null);
    setOtpDeliveryMessage(json.message ?? null);

    logUiAction("api_ok", "Admin OTP requested", {
      component: "AdminUsersPanel",
      metadata: { pendingId: json.pendingId, channel: json.deliveryChannel },
    });

    if (json.deliveredToInbox) {
      toast.success(json.message ?? "Confirmation code sent to dreamos86app@gmail.com");
    } else if (json.deliveryChannel === "dev_console" && json.devOtpHint) {
      toast.info(json.message ?? "Use the dev confirmation code shown below.");
    } else {
      toast.error(json.message ?? json.emailError ?? "Confirmation email could not be sent.");
    }

  }



  async function verifyAndExecute() {

    if (!pendingId || !otp.trim()) {

      toast.error("Enter the confirmation code from your email.");

      return;

    }

    setActing(true);

    logUiAction("api_started", "Verify admin OTP", { component: "AdminUsersPanel" });

    const res = await fetch("/api/admin/confirmations/verify", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      credentials: "include",

      body: JSON.stringify({ pendingId, otp: otp.trim() }),

    });

    const json = (await res.json()) as { error?: string; user?: AdminUserListRow };

    setActing(false);

    if (!res.ok) {

      logUiAction("api_failed", json.error ?? "Verify failed", { component: "AdminUsersPanel" });

      toast.error(json.error ?? "Confirmation failed");

      return;

    }

    logUiAction("api_ok", "Admin action executed", { component: "AdminUsersPanel" });

    toast.success("Action confirmed and executed.");

    if (json.user) onUpdated(json.user);

    setPendingId(null);

    setOtp("");

    setDevOtpHint(null);

    setReason("");

    setAmount("");

    setActionAmount("");

  }



  const basePayload = { targetUserId: user.id };



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

              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">

                <span title={user.id}>{truncateIdentityId(user.id, 10, 6)}</span>

                <CopyIdButton value={user.id} />

              </div>

            </div>

          </div>

          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-surface" aria-label="Close">

            <X className="size-4" />

          </button>

        </div>



        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 py-2.5 text-[11px] text-muted-foreground">

            <p className="flex items-center gap-1.5 font-medium text-foreground">

              <Mail className="size-3.5" /> Email confirmation required

            </p>

            <p className="mt-1">

              {otpDeliveryChannel === "dev_console" ? (
                <>
                  Local dev mode: email is not configured. Each action shows a one-time code below
                  (also logged in the server terminal). Codes expire in 10 minutes.
                </>
              ) : otpDeliveryChannel === "none" ? (
                <>
                  Email delivery failed or is not configured. Set{" "}
                  <strong className="text-foreground">RESEND_API_KEY</strong> on the server, or use
                  the dev code if shown below.
                </>
              ) : (
                <>
                  Each action sends a one-time code to{" "}
                  <strong className="text-foreground">dreamos86app@gmail.com</strong>. Enter the
                  code below to execute. Codes expire in 10 minutes.
                </>
              )}

            </p>

          </div>



          {pendingId && (

            <div className="space-y-2 rounded-xl bg-accent/5 p-3 ring-1 ring-accent/20">

              <p className="text-[12px] font-medium text-foreground">Enter confirmation code</p>

              {otpDeliveryMessage && otpDeliveryChannel !== "resend" ? (
                <p className="text-[11px] text-muted-foreground">{otpDeliveryMessage}</p>
              ) : null}

              {devOtpHint ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-amber-700">
                    Dev confirmation code
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="font-mono text-lg font-semibold tracking-[0.2em] text-foreground">
                      {devOtpHint}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-[11px]"
                      onClick={() => {
                        void navigator.clipboard.writeText(devOtpHint).then(() => {
                          toast.success("Code copied");
                        });
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Also printed in the server terminal as{" "}
                    <code className="text-[10px]">[admin-otp]</code>.
                  </p>
                </div>
              ) : null}

              <Input

                placeholder="6-digit code"

                value={otp}

                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}

                className="font-mono tracking-widest"

              />

              <Button size="sm" variant="accent" disabled={acting || otp.length < 4} onClick={() => void verifyAndExecute()}>

                Confirm & execute

              </Button>

            </div>

          )}



          <div className="grid grid-cols-2 gap-2 text-[12px]">

            <div className="rounded-lg bg-surface p-3 ring-1 ring-border">

              <p className="text-muted-foreground">Plan</p>

              <PlanBadge planId={user.plan_id} size="sm" />

            </div>

            <div className="rounded-lg bg-surface p-3 ring-1 ring-border col-span-2">

              <p className="text-muted-foreground">Build Credits</p>

              <p className="font-semibold tabular-nums">{user.tokens_remaining.toLocaleString()} available</p>

              <p className="mt-1 text-[10px] text-muted-foreground">
                Plan allowance: {user.monthly_token_limit.toLocaleString()}
                {user.bonus_credits > 0 ? ` · Bonus +${user.bonus_credits.toLocaleString()}` : ""}
                {user.is_test_or_grant_account ? " · test/grant account" : ""}
              </p>

              <p className="text-[10px] text-muted-foreground">
                Used: {user.used_this_period.toLocaleString()} · Reserved: {user.reserved_credits.toLocaleString()}
              </p>

            </div>

            <div className="rounded-lg bg-surface p-3 ring-1 ring-border col-span-2">

              <p className="text-muted-foreground">Action Credits</p>

              <p className="font-semibold tabular-nums">{user.action_credits_remaining.toLocaleString()} available</p>

              <p className="mt-1 text-[10px] text-muted-foreground">
                Plan allowance: {user.action_credits_plan_allowance.toLocaleString()}/mo
                {user.action_credits_bonus > 0 ? ` · Bonus +${user.action_credits_bonus.toLocaleString()}` : ""}
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

          </div>



          <Input placeholder="Reason (required for most actions)" value={reason} onChange={(e) => setReason(e.target.value)} />



          <div className="space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border">

            <p className="text-[12px] font-semibold">Build Credit actions</p>

            <div className="flex flex-wrap gap-2">

              <Input

                type="number"
                step="0.1"
                min="0.1"
                placeholder="Add Build Credits"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-28"
              />

              <Button
                size="sm"
                variant="accent"
                disabled={acting || !amount}
                onClick={() => {
                  const parsed = parseCreditAmountInput(amount);
                  if (parsed == null) {
                    toast.error("Enter credits with at most one decimal (e.g. 7.2)");
                    return;
                  }
                  void requestConfirmation({
                    ...basePayload,
                    action: "add_tokens",
                    amount: parsed,
                  });
                }}
              >

                Send code to add

              </Button>

            </div>

            <div className="flex flex-wrap gap-2">

              <Input value={balance} onChange={(e) => setBalance(e.target.value)} className="w-28" step="0.1" min="0" />

              <Button
                size="sm"
                variant="secondary"
                disabled={acting}
                onClick={() => {
                  const parsed = parseCreditAmountInput(balance, { min: 0, allowZero: true });
                  if (parsed == null) {
                    toast.error("Enter balance with at most one decimal");
                    return;
                  }
                  void requestConfirmation({
                    ...basePayload,
                    action: "set_balance",
                    balance: parsed,
                  });
                }}
              >

                Send code to set balance

              </Button>

              <Button

                size="sm"

                variant="secondary"

                disabled={acting}

                onClick={() => void requestConfirmation({ ...basePayload, action: "reset_monthly" })}

              >

                <RefreshCw className="mr-1 size-3" /> Send code to reset monthly

              </Button>

            </div>

          </div>



          <div className="space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border">

            <p className="text-[12px] font-semibold">Action Credit actions</p>

            <div className="flex flex-wrap gap-2">

              <Input

                type="number"

                step="0.1"

                min="0.1"

                placeholder="Add Action Credits"

                value={actionAmount}

                onChange={(e) => setActionAmount(e.target.value)}

                className="w-36"

              />

              <Button

                size="sm"

                variant="accent"

                disabled={acting || !actionAmount}

                onClick={() => {
                  const parsed = parseCreditAmountInput(actionAmount);
                  if (parsed == null) {
                    toast.error("Enter credits with at most one decimal (e.g. 7.2)");
                    return;
                  }
                  void requestConfirmation({
                    ...basePayload,
                    action: "add_action_credits",
                    amount: parsed,
                  });
                }}

              >

                Send code to add

              </Button>

            </div>

            <div className="flex flex-wrap gap-2">

              <Input

                type="number"

                step="0.1"

                min="0"

                value={actionBalance}

                onChange={(e) => setActionBalance(e.target.value)}

                className="w-36"

              />

              <Button

                size="sm"

                variant="secondary"

                disabled={acting}

                onClick={() => {
                  const parsed = parseCreditAmountInput(actionBalance, { min: 0, allowZero: true });
                  if (parsed == null) {
                    toast.error("Enter balance with at most one decimal");
                    return;
                  }
                  void requestConfirmation({
                    ...basePayload,
                    action: "set_action_credits",
                    balance: parsed,
                  });
                }}

              >

                Send code to set balance

              </Button>

              <Button

                size="sm"

                variant="secondary"

                disabled={acting}

                onClick={() => void requestConfirmation({ ...basePayload, action: "reset_action_credits_monthly" })}

              >

                <RefreshCw className="mr-1 size-3" /> Send code to reset monthly

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

              disabled={acting}

              onClick={() => void requestConfirmation({ ...basePayload, action: "set_plan", planId })}

            >

              Send code to apply plan

            </Button>

          </div>



          <div className="flex gap-2">

            {user.suspended_at ? (

              <Button

                size="sm"

                variant="secondary"

                disabled={acting}

                onClick={() =>

                  void requestConfirmation({

                    ...basePayload,

                    action: "unsuspend",

                    reason: reason || "reinstated",

                  })

                }

              >

                Send code to unsuspend

              </Button>

            ) : (

              <Button

                size="sm"

                variant="destructive"

                disabled={acting || !reason}

                onClick={() => void requestConfirmation({ ...basePayload, action: "suspend" })}

              >

                <UserX className="mr-1 size-3" /> Send code to suspend

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

          </div>

        </motion.div>

      )}



      {loading ? (

        <div className="space-y-2">

          {Array.from({ length: 8 }).map((_, i) => (

            <Skeleton key={i} className="h-16 w-full rounded-xl" />

          ))}

        </div>

      ) : users.length === 0 && !error ? (

        <div className="rounded-xl border border-dashed border-border py-12 text-center text-[13px] text-muted-foreground">

          No users match your filters.

        </div>

      ) : (

        <div className="overflow-x-auto rounded-[var(--radius-xl)] bg-surface ring-1 ring-border">

          <table className="w-full min-w-[1020px] text-left text-[12px]">

            <thead>

              <tr className="border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">

                <th className="px-4 py-2.5">User</th>

                <th className="px-4 py-2.5">Account ID</th>

                <th className="px-4 py-2.5">Plan</th>

                <th className="px-4 py-2.5">Build credits</th>

                <th className="px-4 py-2.5">Action credits</th>

                <th className="px-4 py-2.5">Joined</th>

                <th className="px-4 py-2.5" />

              </tr>

            </thead>

            <tbody>

              {users.map((u) => (

                <tr key={u.id} className="border-b border-border/50 hover:bg-muted/20">

                  <td className="px-4 py-3">

                    <div className="flex items-center gap-2">

                      <Avatar name={u.full_name ?? u.email} src={u.avatar_url ?? undefined} size="sm" />

                      <div className="min-w-0">

                        <p className="truncate font-medium">{u.full_name ?? u.email}</p>

                        <p className="truncate text-[11px] text-muted-foreground">{u.email}</p>

                      </div>

                    </div>

                  </td>

                  <td className="px-4 py-3 font-mono text-[11px]">

                    <CopyIdButton value={u.id} />

                  </td>

                  <td className="px-4 py-3">
                    <PlanBadge planId={u.plan_id} size="xs" />
                  </td>

                  <td className="px-4 py-3 tabular-nums">
                    {u.tokens_remaining.toLocaleString()}
                    {u.bonus_credits > 0 ? (
                      <span className="ml-1 text-[10px] font-medium text-violet-500">+{u.bonus_credits} bonus</span>
                    ) : null}
                    <span className="block text-[10px] text-muted-foreground">/{u.monthly_token_limit} plan</span>
                  </td>

                  <td className="px-4 py-3 tabular-nums">
                    {u.action_credits_remaining.toLocaleString()}
                    {u.action_credits_bonus > 0 ? (
                      <span className="ml-1 text-[10px] font-medium text-violet-500">+{u.action_credits_bonus} bonus</span>
                    ) : null}
                    <span className="block text-[10px] text-muted-foreground">/{u.action_credits_plan_allowance} plan</span>
                  </td>

                  <td className="px-4 py-3 text-muted-foreground">

                    {new Date(u.created_at).toLocaleDateString()}

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

