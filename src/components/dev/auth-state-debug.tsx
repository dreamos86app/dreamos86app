"use client";

import * as React from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  hasActiveSession,
  isStalePersistedProfile,
  resolveAccountEmail,
} from "@/lib/auth/client-identity";
import { isSubmitDebugEnabled } from "@/lib/dev/submit-debug-enabled";

/** Hidden by default — enable with ?debug=submit or NEXT_PUBLIC_SUBMIT_DEBUG=true */
export function AuthStateDebug() {
  const { user, session, profile, loading } = useAuthStore();
  const [open, setOpen] = React.useState(false);

  if (!isSubmitDebugEnabled(null, profile?.email ?? user?.email ?? null)) return null;

  const email = resolveAccountEmail(user, profile);
  const dreamSpace = profile?.workspace_name?.trim() || "(none)";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-3 left-3 z-[9990] rounded-lg bg-foreground/90 px-2.5 py-1 text-[10px] font-mono font-medium text-background shadow-lg"
      >
        auth debug
      </button>
      {open ? (
        <div className="fixed bottom-10 left-3 z-[9990] max-w-[min(100vw-1.5rem,22rem)] rounded-lg border border-border bg-background/95 p-3 font-mono text-[10px] leading-relaxed text-foreground shadow-xl backdrop-blur-sm">
          <p className="mb-2 font-semibold text-accent">Auth state (dev)</p>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>loading: {String(loading)}</li>
            <li>session: {session?.user?.id ? "yes" : "no"}</li>
            <li>user id: {user?.id ? "present" : "missing"}</li>
            <li>auth email: {email || "missing"}</li>
            <li>profile row: {profile?.id ? "present" : "missing"}</li>
            <li>Dream Space: {dreamSpace}</li>
            <li>signed in: {String(hasActiveSession(session, user))}</li>
            <li>stale profile: {String(isStalePersistedProfile(session, profile))}</li>
          </ul>
        </div>
      ) : null}
    </>
  );
}
