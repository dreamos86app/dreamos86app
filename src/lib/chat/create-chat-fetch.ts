"use client";

import { toast } from "@/lib/toast";

export type ChatFetchOptions = {
  label?: string;
  on402?: () => void;
  onSuccess?: () => void;
  onErrorMessage?: (message: string) => void;
  onFetchStart?: (url: string) => void;
  onFetchEnd?: (status: number) => void;
};

async function parseApiError(res: Response): Promise<string> {
  let msg = `Request failed (${res.status})`;
  try {
    const j = (await res.clone().json()) as { error?: string; hint?: string; code?: string };
    if (j.error && j.hint) msg = `${j.error} — ${j.hint}`;
    else if (j.error) msg = j.error;
    if (j.code === "llm_setup") {
      msg = `${j.error ?? "AI provider is not configured"}. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY on the server.`;
    }
  } catch {
    try {
      const text = await res.clone().text();
      if (text.trim()) msg = text.slice(0, 400);
    } catch {
      /* ignore */
    }
  }
  return msg;
}

/**
 * Fetch wrapper for /api/chat — throws on failure so useChat enters error state
 * (returning a non-ok Response without throwing leaves the UI stuck with no stream).
 */
export async function createChatFetch(
  reqInput: RequestInfo | URL,
  init: RequestInit | undefined,
  options: ChatFetchOptions = {},
): Promise<Response> {
  const label = options.label ?? "chat";
  const url =
    typeof reqInput === "string"
      ? reqInput
      : reqInput instanceof URL
        ? reqInput.toString()
        : reqInput instanceof Request
          ? reqInput.url
          : "/api/chat";

  options.onFetchStart?.(url);

  if (process.env.NODE_ENV !== "production") {
    console.info(`[${label}] fetch start:`, url);
  }

  const res = await globalThis.fetch(reqInput as RequestInfo, {
    ...init,
    credentials: "include",
  });

  options.onFetchEnd?.(res.status);

  if (process.env.NODE_ENV !== "production") {
    console.info(`[${label}] response status`, res.status, res.statusText);
  }

  if (res.status === 402) {
    options.on402?.();
    const msg = "Not enough credits for this request.";
    options.onErrorMessage?.(msg);
    toast.error(msg);
    throw new Error(msg);
  }

  if (!res.ok) {
    const msg = await parseApiError(res);
    if (process.env.NODE_ENV !== "production") {
      console.error(`[${label}] error`, msg);
    }
    options.onErrorMessage?.(msg);
    toast.error(msg);
    throw new Error(msg);
  }

  options.onSuccess?.();
  return res;
}
