import { pushSubmitTrace, isSubmitPipelineVisible } from "@/lib/dev/submit-pipeline-trace";

/** Structured logs + on-screen pipeline (never logs secrets). */
export function submitDebug(
  channel: "chat" | "create",
  step: string,
  detail?: Record<string, unknown>,
) {
  if (!isSubmitPipelineVisible()) return;
  const detailStr = detail && Object.keys(detail).length > 0 ? JSON.stringify(detail) : undefined;
  const isError = step.startsWith("blocked:") || step.includes("error");
  pushSubmitTrace(channel, step, {
    level: isError ? "error" : "info",
    detail: detailStr,
    blocked: isError ? step.replace(/^blocked:/, "") : undefined,
    error: isError ? step : null,
  });
  if (typeof console !== "undefined") {
    if (detail && Object.keys(detail).length > 0) {
      console.info(`[${channel}] ${step}`, detail);
    } else {
      console.info(`[${channel}] ${step}`);
    }
  }
}

/** Console + on-screen pipeline line with exact tag (e.g. create-ui, chat-ui). */
export function uiSubmitLog(tag: string, message: string, detail?: Record<string, unknown>) {
  const channel = tag.startsWith("chat") ? "chat" : "create";
  const detailStr = detail && Object.keys(detail).length > 0 ? JSON.stringify(detail) : undefined;
  const clicked =
    message.includes("pointer down") || message.includes("click") || message.includes("click target");
  const submitted = message.includes("form submit") || message.includes("handleSubmit");
  const preflight =
    message.includes("preflight") && message.includes("start")
      ? "pending"
      : message.includes("preflight status")
        ? message.includes("ok")
          ? "ok"
          : "error"
        : undefined;
  const chatFetch =
    message.includes("chat fetch start")
      ? "pending"
      : message.includes("chat status")
        ? message.includes("ok")
          ? "ok"
          : "error"
        : undefined;

  pushSubmitTrace(channel, `[${tag}] ${message}`, {
    level: message.includes("error") ? "error" : "info",
    detail: detailStr,
    clicked: clicked || undefined,
    submitted: submitted || undefined,
    preflight,
    chat: chatFetch,
  });

  if (typeof console !== "undefined") {
    if (detail && Object.keys(detail).length > 0) {
      console.info(`[${tag}] ${message}`, detail);
    } else {
      console.info(`[${tag}] ${message}`);
    }
  }
}
