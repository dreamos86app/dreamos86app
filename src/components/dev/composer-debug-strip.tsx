"use client";

/** Dev-only status line under chat/create composers — hidden in production. */
export function ComposerDebugStrip({
  channel,
  inputLen,
  mode,
  disabledReason,
  creditsStatus,
  lastSubmitAt,
  clicked,
  submitted,
  preflightState,
  chatState,
  blocked,
}: {
  channel: "chat" | "create";
  inputLen: number;
  mode?: string;
  disabledReason: string | null;
  creditsStatus: string;
  lastSubmitAt: number | null;
  clicked: boolean;
  submitted: boolean;
  preflightState: string;
  chatState: string;
  blocked: string;
}) {
  if (process.env.NODE_ENV === "production") return null;

  const submitTs = lastSubmitAt ? new Date(lastSubmitAt).toISOString().slice(11, 19) : "—";

  return (
    <p
      className="mt-1 font-mono text-[9px] leading-relaxed text-muted-foreground/80"
      data-composer-debug={channel}
    >
      clicked={clicked ? "yes" : "no"} · submit={submitted ? "yes" : "no"} · preflight={preflightState} · chat=
      {chatState} · blocked={blocked} · len={inputLen}
      {mode ? ` · mode=${mode}` : ""} · credits={creditsStatus} · submit@{submitTs}
    </p>
  );
}
