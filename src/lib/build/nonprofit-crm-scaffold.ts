import type { BuildFile } from "@/lib/build/generated-file-utils";
import { normalizeBuildFilePath } from "@/lib/build/generated-file-utils";

/** Deterministic nonprofit donor CRM scaffold for weak first-pass model output. */
export function nonprofitCrmScaffoldFiles(appName: string): BuildFile[] {
  const name = appName.trim() || "Donor CRM";
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const files: BuildFile[] = [
    {
      path: "components/AppShell.tsx",
      content: `import Link from "next/link";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/donors", label: "Donors" },
  { href: "/donations", label: "Donations" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/recurring-gifts", label: "Recurring gifts" },
  { href: "/automations", label: "Thank-you emails" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="flex min-h-dvh bg-slate-50 text-slate-900">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white md:block">
        <div className="border-b border-slate-200 px-4 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Nonprofit CRM</p>
          <p className="text-sm font-semibold">${esc(name)}</p>
        </div>
        <nav className="flex flex-col gap-1 p-3 text-sm">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-slate-600 hover:bg-violet-50 hover:text-violet-800">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
`,
    },
    {
      path: "components/MetricCard.tsx",
      content: `export function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
`,
    },
    {
      path: "components/DataTable.tsx",
      content: `export function DataTable({ rows }: { rows: { name: string; detail: string; status: string }[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Detail</th><th className="px-4 py-3">Status</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t border-slate-100">
              <td className="px-4 py-3 font-medium">{row.name}</td>
              <td className="px-4 py-3 text-slate-600">{row.detail}</td>
              <td className="px-4 py-3">{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`,
    },
    {
      path: "lib/mock-data.ts",
      content: `export const donorMetrics = [
  { label: "Active donors", value: "1,842", hint: "Campaign tracking" },
  { label: "Donations YTD", value: "$428k", hint: "Donation history" },
  { label: "Recurring gifts", value: "312", hint: "Monthly sustainers" },
  { label: "Thank-you sent", value: "96%", hint: "Email automation" },
];

export const donors = [
  { name: "Ava Chen", detail: "Major donor · Annual gala", status: "Active" },
  { name: "James Ortiz", detail: "Recurring $50/mo", status: "Active" },
  { name: "Northside Foundation", detail: "Grant · Education fund", status: "Pledged" },
];

export const campaigns = [
  { name: "Spring gala 2026", detail: "Goal $120k", status: "Live" },
  { name: "Back-to-school drive", detail: "Goal $45k", status: "Planning" },
];
`,
    },
    {
      path: "app/page.tsx",
      content: `import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { DataTable } from "@/components/DataTable";
import { donorMetrics, donors } from "@/lib/mock-data";

export default function DonorDashboardPage() {
  return (
    <AppShell title="Donor dashboard">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Donor CRM dashboard</h1>
        <p className="text-sm text-slate-600">Campaign tracking, donation history, recurring gifts, and thank-you email automation.</p>
      </header>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {donorMetrics.map((m) => (
          <MetricCard key={m.label} label={m.label} value={m.value} hint={m.hint} />
        ))}
      </div>
      <DataTable rows={donors} />
    </AppShell>
  );
}
`,
    },
    {
      path: "app/donors/page.tsx",
      content: `import { AppShell } from "@/components/AppShell";
import { DataTable } from "@/components/DataTable";
import { donors } from "@/lib/mock-data";

export default function DonorsPage() {
  return (
    <AppShell title="Donors">
      <h1 className="mb-4 text-2xl font-bold">Donors</h1>
      <p className="mb-4 text-sm text-slate-600">Manage donor profiles, segments, and engagement history.</p>
      <DataTable rows={donors} />
    </AppShell>
  );
}
`,
    },
    {
      path: "app/donations/page.tsx",
      content: `import { AppShell } from "@/components/AppShell";
import { DataTable } from "@/components/DataTable";

const donations = [
  { name: "Online gift", detail: "$250 · Spring gala", status: "Completed" },
  { name: "Recurring gift", detail: "$50/mo · James Ortiz", status: "Active" },
];

export default function DonationsPage() {
  return (
    <AppShell title="Donations">
      <h1 className="mb-4 text-2xl font-bold">Donation history</h1>
      <p className="mb-4 text-sm text-slate-600">Track one-time and pledged gifts across campaigns.</p>
      <DataTable rows={donations} />
    </AppShell>
  );
}
`,
    },
    {
      path: "app/campaigns/page.tsx",
      content: `import { AppShell } from "@/components/AppShell";
import { DataTable } from "@/components/DataTable";
import { campaigns } from "@/lib/mock-data";

export default function CampaignsPage() {
  return (
    <AppShell title="Campaigns">
      <h1 className="mb-4 text-2xl font-bold">Campaign tracking</h1>
      <p className="mb-4 text-sm text-slate-600">Monitor goals, channels, and conversion for each campaign.</p>
      <DataTable rows={campaigns} />
    </AppShell>
  );
}
`,
    },
    {
      path: "app/recurring-gifts/page.tsx",
      content: `import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";

export default function RecurringGiftsPage() {
  return (
    <AppShell title="Recurring gifts">
      <h1 className="mb-4 text-2xl font-bold">Recurring gifts</h1>
      <p className="mb-4 text-sm text-slate-600">Monthly sustainers and automated retry workflows.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Active recurring" value="312" />
        <MetricCard label="MRR" value="$18.4k" />
        <MetricCard label="At risk" value="14" hint="Failed payment retry" />
      </div>
    </AppShell>
  );
}
`,
    },
    {
      path: "app/automations/page.tsx",
      content: `import { AppShell } from "@/components/AppShell";

export default function AutomationsPage() {
  return (
    <AppShell title="Thank-you emails">
      <h1 className="mb-4 text-2xl font-bold">Thank-you email automation</h1>
      <p className="mb-4 text-sm text-slate-600">Send personalized thank-you messages after donations and recurring gifts.</p>
      <ul className="space-y-2 text-sm">
        <li className="rounded-lg border border-slate-200 bg-white px-4 py-3">First gift thank-you — active</li>
        <li className="rounded-lg border border-slate-200 bg-white px-4 py-3">Recurring receipt — active</li>
        <li className="rounded-lg border border-slate-200 bg-white px-4 py-3">Campaign milestone — draft</li>
      </ul>
    </AppShell>
  );
}
`,
    },
    {
      path: "app/settings/page.tsx",
      content: `import { AppShell } from "@/components/AppShell";

export default function SettingsPage() {
  return (
    <AppShell title="Settings">
      <h1 className="mb-4 text-2xl font-bold">Settings</h1>
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm font-medium">Organization name</label>
        <input className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" defaultValue="${esc(name)}" />
      </div>
    </AppShell>
  );
}
`,
    },
  ];

  return files.map((f) => ({ ...f, path: normalizeBuildFilePath(f.path) }));
}

export function mergeNonprofitCrmScaffold(files: BuildFile[], appName: string): BuildFile[] {
  const scaffold = nonprofitCrmScaffoldFiles(appName);
  const byPath = new Map<string, BuildFile>();
  for (const f of scaffold) byPath.set(f.path, f);
  for (const f of files) {
    const path = normalizeBuildFilePath(f.path);
    if (path && f.content?.trim()) byPath.set(path, { path, content: f.content });
  }
  return [...byPath.values()];
}
