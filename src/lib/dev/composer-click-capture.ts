"use client";

import * as React from "react";
import { isSubmitPipelineVisible, pushSubmitTrace } from "@/lib/dev/submit-pipeline-trace";

/** Log clicks inside composer root (capture phase) — on-screen + console. */
export function useComposerClickCapture(
  channel: "create" | "chat",
  rootRef: React.RefObject<HTMLElement | null>,
) {
  React.useEffect(() => {
    if (!isSubmitPipelineVisible()) return;

    const onClick = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root?.contains(e.target as Node)) return;
      const t = e.target as HTMLElement;
      const btn = t.closest("button");
      const detail = JSON.stringify({
        tagName: t.tagName,
        textContent: (t.textContent ?? "").trim().slice(0, 48),
        disabled: btn ? (btn as HTMLButtonElement).disabled : undefined,
        ariaDisabled: btn?.getAttribute("aria-disabled") ?? t.getAttribute("aria-disabled"),
        className: (t.className && typeof t.className === "string" ? t.className : "").slice(0, 96),
      });
      pushSubmitTrace(channel, `[${channel}-capture] click target`, {
        clicked: true,
        detail,
      });
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [channel, rootRef]);
}
