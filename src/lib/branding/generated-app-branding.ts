/**
 * "Built with DreamOS86" inside generated apps (preview, scaffold, publish).
 * Not the platform shell — this is end-user app branding.
 */

export type GeneratedAppBrandingOptions = {
  /** When true, hide badge (paid plan + user disabled branding). */
  hideBadge?: boolean;
  /** App display name for login screens. */
  appName?: string;
};

const BADGE_HTML = `<a href="https://dreamos86.com" target="_blank" rel="noopener noreferrer" data-dreamos-branding="badge" style="position:fixed;bottom:12px;right:12px;z-index:9999;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(15,23,42,0.88);color:#f8fafc;font-size:11px;font-weight:600;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,0.18);backdrop-filter:blur(8px);">Built with DreamOS86</a>`;

export function shouldShowDreamOSAppBranding(opts: GeneratedAppBrandingOptions): boolean {
  return !opts.hideBadge;
}

export function dreamOSBrandingBadgeHtml(): string {
  return BADGE_HTML;
}

export function injectDreamOSBrandingIntoPreviewHtml(
  html: string,
  opts: GeneratedAppBrandingOptions = {},
): string {
  if (!shouldShowDreamOSAppBranding(opts)) return html;
  const badge = dreamOSBrandingBadgeHtml();
  if (html.includes("data-dreamos-branding")) return html;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${badge}\n</body>`);
  }
  return `${html}\n${badge}`;
}

/** Snippet injected into generated app/layout.tsx before </body>. */
export function dreamOSBrandingLayoutFooterJsx(): string {
  return `
        <footer data-dreamos-branding="footer" className="border-t border-slate-200 bg-white/80 py-3 text-center text-[11px] text-slate-500">
          <a href="https://dreamos86.com" target="_blank" rel="noopener noreferrer" className="font-medium text-violet-600 hover:text-violet-700">
            Built with DreamOS86
          </a>
        </footer>`;
}

/** Minimal login page scaffold with DreamOS86 co-branding. */
export function dreamOSLoginPageScaffold(appName: string): string {
  const name = appName.replace(/"/g, '\\"');
  return `"use client";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-center text-xs font-semibold uppercase tracking-wide text-violet-600">Welcome</p>
        <h1 className="mt-2 text-center text-xl font-bold text-slate-900">${name}</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Sign in to continue</p>
        <form className="mt-6 space-y-3" onSubmit={(e) => e.preventDefault()}>
          <input type="email" placeholder="Email" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input type="password" placeholder="Password" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <button type="submit" className="w-full rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white">Sign in</button>
        </form>
        <p className="mt-4 text-center text-[10px] text-slate-400">
          Powered by{" "}
          <a href="https://dreamos86.com" className="font-medium text-violet-600" target="_blank" rel="noopener noreferrer">
            DreamOS86
          </a>
        </p>
      </div>
    </div>
  );
}
`;
}
