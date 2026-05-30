import type { BuildFile } from "@/lib/build/generated-file-utils";
import { normalizeBuildFilePath } from "@/lib/build/generated-file-utils";
import type { AppArchetypeId } from "@/lib/build/app-archetype-classifier";
import {
  dreamOSBrandingLayoutFooterJsx,
  dreamOSLoginPageScaffold,
} from "@/lib/branding/generated-app-branding";

/** Minimum usable SaaS / CRM / dashboard scaffold when model output is weak. */
export function genericSaaSScaffoldFiles(archetypeId: AppArchetypeId, appName: string): BuildFile[] {
  const name = appName.trim() || "Dream App";
  const hero =
    archetypeId === "crm"
      ? "Manage contacts, deals, and follow-ups in one place."
      : archetypeId === "booking"
        ? "Book appointments and manage your calendar with ease."
        : archetypeId === "finance_tracker"
          ? "Track spending, budgets, and goals at a glance."
          : archetypeId === "marketplace"
            ? "Browse listings, vendors, and orders in one dashboard."
            : "Your metrics, workflows, and team tools — all in one app.";

  const files: BuildFile[] = [
    {
      path: "app/layout.tsx",
      content: `import "./globals.css";
import Link from "next/link";

export const metadata = { title: "${name.replace(/"/g, '\\"')}" };

const nav = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/records", label: "Records" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">${name.replace(/"/g, '\\"')}</Link>
            <nav className="flex flex-wrap gap-2 text-sm">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>${dreamOSBrandingLayoutFooterJsx()}
      </body>
    </html>
  );
}
`,
    },
    {
      path: "app/login/page.tsx",
      content: dreamOSLoginPageScaffold(name),
    },
    {
      path: "app/globals.css",
      content: `@tailwind base;
@tailwind components;
@tailwind utilities;
body { font-feature-settings: "ss01"; }
.card { @apply rounded-xl border border-slate-200 bg-white p-4 shadow-sm; }
`,
    },
    {
      path: "app/page.tsx",
      content: `import Link from "next/link";
import { metrics, recentItems } from "@/lib/mock-data";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-700 px-6 py-10 text-white shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/80">Welcome</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">${name.replace(/"/g, '\\"')}</h1>
        <p className="mt-3 max-w-xl text-sm text-white/90">${hero.replace(/"/g, '\\"')}</p>
        <Link href="/dashboard" className="mt-6 inline-flex rounded-lg bg-white px-4 py-2 text-sm font-semibold text-violet-700">
          Open dashboard
        </Link>
      </section>
      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((m) => (
          <div key={m.label} className="card">
            <p className="text-xs text-slate-500">{m.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/dashboard/page.tsx",
      content: `import { metrics, recentItems } from "@/lib/mock-data";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="card">
            <p className="text-xs text-slate-500">{m.label}</p>
            <p className="mt-1 text-xl font-bold">{m.value}</p>
          </div>
        ))}
      </div>
      <div className="card overflow-hidden p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Updated</th></tr>
          </thead>
          <tbody>
            {recentItems.map((row) => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium">{row.title}</td>
                <td className="px-4 py-3 text-slate-600">{row.status}</td>
                <td className="px-4 py-3 text-slate-500">{row.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`,
    },
    {
      path: "app/records/page.tsx",
      content: `import { recentItems } from "@/lib/mock-data";

export default function RecordsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Records</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {recentItems.map((item) => (
          <li key={item.id} className="card">
            <p className="font-semibold">{item.title}</p>
            <p className="mt-1 text-sm text-slate-600">{item.status}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
`,
    },
    {
      path: "app/settings/page.tsx",
      content: `export default function SettingsPage() {
  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="card space-y-3">
        <label className="block text-sm font-medium">Workspace name</label>
        <input className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" defaultValue="${name.replace(/"/g, '\\"')}" />
        <button type="button" className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white">Save changes</button>
      </div>
    </div>
  );
}
`,
    },
    {
      path: "lib/mock-data.ts",
      content: `export const metrics = [
  { label: "Active users", value: "1,248" },
  { label: "Revenue", value: "$42.6k" },
  { label: "Conversion", value: "3.8%" },
  { label: "Open tasks", value: "27" },
];

export const recentItems = [
  { id: "1", title: "Northwind account", status: "In progress", updated: "Today" },
  { id: "2", title: "Q2 investor update", status: "Scheduled", updated: "Yesterday" },
  { id: "3", title: "Support backlog", status: "Review", updated: "2d ago" },
  { id: "4", title: "Mobile launch", status: "Planning", updated: "This week" },
];
`,
    },
    {
      path: "components/MetricCard.tsx",
      content: `export function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
`,
    },
    {
      path: "components/PageHeader.tsx",
      content: `export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {description ? <p className="text-sm text-slate-600">{description}</p> : null}
    </header>
  );
}
`,
    },
    {
      path: "components/EmptyState.tsx",
      content: `export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="card text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
    </div>
  );
}
`,
    },
  ];

  return files.map((f) => ({ ...f, path: normalizeBuildFilePath(f.path) }));
}

export function mergeGenericSaaSScaffold(
  archetypeId: AppArchetypeId,
  files: BuildFile[],
  appName: string,
): BuildFile[] {
  const scaffold = genericSaaSScaffoldFiles(archetypeId, appName);
  const byPath = new Map<string, BuildFile>();
  for (const f of scaffold) byPath.set(f.path, f);
  for (const f of files) {
    const path = normalizeBuildFilePath(f.path);
    if (path && f.content?.trim()) byPath.set(path, { path, content: f.content });
  }
  return [...byPath.values()];
}
