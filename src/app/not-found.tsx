import Link from "next/link";
import { Home, LayoutGrid, Sparkles } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/40 ring-1 ring-border/60">
        <Sparkles className="size-7 text-accent/80" strokeWidth={1.5} />
      </div>
      <div className="max-w-md space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent/90">
          DreamOS86
        </p>
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="text-[14px] text-muted-foreground">
          This link may be outdated or the page moved. Head home or open your apps to keep building.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90"
        >
          <Home className="size-4" strokeWidth={1.75} />
          Home
        </Link>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-4 py-2.5 text-[13px] font-medium text-foreground transition hover:bg-muted/40"
        >
          <LayoutGrid className="size-4" strokeWidth={1.75} />
          Your Apps
        </Link>
        <Link
          href="/create"
          className="inline-flex items-center gap-2 rounded-xl border border-border/70 px-4 py-2.5 text-[13px] font-medium text-foreground transition hover:bg-muted/40"
        >
          Create workspace
        </Link>
      </div>
    </div>
  );
}
