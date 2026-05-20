/** Owner-only in-app runtime event log (sessionStorage, max 50). */

export type RuntimeDiagnosticEvent =
  | "prompt_submit_started"
  | "prompt_submit_skipped_duplicate"
  | "prompt_submit_consumed_once"
  | "conversation_created"
  | "build_job_created"
  | "build_step_started"
  | "build_step_completed"
  | "files_saved"
  | "preview_generated"
  | "charge_started"
  | "charge_success"
  | "charge_failed"
  | "schema_warning"
  | "publish_readiness"
  | "error_boundary";

export type RuntimeDiagnosticEntry = {
  event: RuntimeDiagnosticEvent;
  at: string;
  detail?: Record<string, unknown>;
};

const STORAGE_KEY = "dreamos86.runtimeDiagnostics";
const MAX = 50;

export function pushRuntimeDiagnostic(
  event: RuntimeDiagnosticEvent,
  detail?: Record<string, unknown>,
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const prev: RuntimeDiagnosticEntry[] = raw ? (JSON.parse(raw) as RuntimeDiagnosticEntry[]) : [];
    const next: RuntimeDiagnosticEntry[] = [
      { event, at: new Date().toISOString(), detail },
      ...prev,
    ].slice(0, MAX);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

export function readRuntimeDiagnostics(): RuntimeDiagnosticEntry[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RuntimeDiagnosticEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearRuntimeDiagnostics(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
