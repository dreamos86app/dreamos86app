"use client";

import * as React from "react";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

function safeErrorCode(err: unknown): string {
  if (err instanceof Error && err.name) return err.name;
  return "unknown_error";
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message?.trim()) {
    return err.message.slice(0, 240);
  }
  return "An unexpected error occurred.";
}

export default function AiChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ai-chat] route error", {
      route: "/ai-chat",
      code: safeErrorCode(error),
      message: safeErrorMessage(error),
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-lg font-semibold text-foreground">AI Chat could not load</h1>
      <p className="text-[13px] text-muted-foreground">
        {safeErrorMessage(error)}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" variant="accent" size="md" onClick={() => reset()}>
          Try again
        </Button>
        <Button type="button" variant="secondary" size="md" asChild>
          <Link href="/chat">Open /chat</Link>
        </Button>
      </div>
    </div>
  );
}
