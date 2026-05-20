import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

/**
 * Server-side session — Supabase auth cookies are the source of truth.
 * Use in Server Components, route handlers, and server actions.
 */
export async function getServerSessionUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error && process.env.NODE_ENV !== "production") {
    console.warn("[auth/session] getServerSessionUser:", error.message);
  }
  return user ?? null;
}

/** Redirects to login when no server session. */
export async function requireServerUser(nextPath?: string): Promise<User> {
  const user = await getServerSessionUser();
  if (!user) {
    const q = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/auth/login${q}`);
  }
  return user;
}

/**
 * Client-side session — always validates JWT via getUser(), never trusts
 * persisted Zustand profile alone.
 */
export async function getClientSessionUser(): Promise<User | null> {
  const supabase = createBrowserClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error && process.env.NODE_ENV !== "production") {
    console.warn("[auth/session] getClientSessionUser:", error.message);
  }
  return user ?? null;
}
