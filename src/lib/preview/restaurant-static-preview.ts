/** Deterministic restaurant inventory preview HTML (no TSX runtime). */

export function isRestaurantInventoryPreview(
  files: Array<{ path: string; content: string }>,
  archetypeId?: string | null,
): boolean {
  if (archetypeId && archetypeId !== "restaurant_inventory") return false;
  if (archetypeId === "restaurant_inventory") return true;
  const paths = files.map((f) => f.path.replace(/\\/g, "/").toLowerCase());
  if (paths.length < 8) return false;
  const hasInventoryPage = paths.some(
    (p) => p.includes("/inventory/") && (p.endsWith("page.tsx") || p.endsWith("page.jsx")),
  );
  const hasInventoryComponent = paths.some((p) =>
    /components\/[^/]*inventory[^/]*\.(tsx|jsx)$/i.test(p),
  );
  const hasDashboardPage = paths.some(
    (p) => p === "app/page.tsx" || p === "app/dashboard/page.tsx",
  );
  return hasInventoryPage && hasInventoryComponent && hasDashboardPage;
}

export function buildRestaurantInventoryPreviewBody(): string {
  return `
    <div class="flex min-h-screen bg-stone-50 text-stone-900">
      <aside class="hidden w-56 shrink-0 border-r border-stone-200 bg-white md:block">
        <div class="border-b border-stone-200 px-4 py-5">
          <p class="text-xs font-semibold uppercase tracking-wide text-orange-600">Pantry Pro</p>
          <p class="text-sm font-semibold text-stone-900">Restaurant Inventory</p>
        </div>
        <nav class="flex flex-col gap-1 p-3 text-sm">
          <span class="rounded-lg bg-orange-50 px-3 py-2 font-medium text-orange-700">Dashboard</span>
          <span class="rounded-lg px-3 py-2 text-stone-600">Inventory</span>
          <span class="rounded-lg px-3 py-2 text-stone-600">Suppliers</span>
          <span class="rounded-lg px-3 py-2 text-stone-600">Alerts</span>
        </nav>
      </aside>
      <main class="min-w-0 flex-1 p-6" data-testid="restaurant-dashboard">
        <header class="mb-6">
          <h1 class="text-2xl font-semibold tracking-tight text-stone-900">Inventory dashboard</h1>
          <p class="mt-1 text-sm text-stone-600">Track ingredients, suppliers, expiry, and costs in one place.</p>
        </header>
        <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium uppercase text-stone-500">SKUs tracked</p>
            <p class="mt-2 text-2xl font-semibold">5</p>
          </div>
          <div class="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium uppercase text-stone-500">Low stock</p>
            <p class="mt-2 text-2xl font-semibold text-orange-600">2</p>
          </div>
          <div class="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium uppercase text-stone-500">Open alerts</p>
            <p class="mt-2 text-2xl font-semibold">3</p>
          </div>
          <div class="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-medium uppercase text-stone-500">Weekly spend</p>
            <p class="mt-2 text-2xl font-semibold">$4,280</p>
          </div>
        </div>
        <div class="grid gap-4 lg:grid-cols-3">
          <div class="lg:col-span-2 rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden" data-testid="inventory-table">
            <div class="border-b border-stone-200 px-4 py-3">
              <h2 class="text-sm font-semibold">Stock on hand</h2>
            </div>
            <table class="w-full text-left text-sm">
              <thead class="bg-stone-50 text-xs uppercase text-stone-500">
                <tr><th class="px-4 py-2">Item</th><th class="px-4 py-2">Qty</th><th class="px-4 py-2">Supplier</th></tr>
              </thead>
              <tbody>
                <tr class="border-t border-stone-100"><td class="px-4 py-2 font-medium">Atlantic Salmon</td><td class="px-4 py-2">12 kg</td><td class="px-4 py-2">Harbor Fish Co.</td></tr>
                <tr class="border-t border-stone-100"><td class="px-4 py-2 font-medium">Heavy Cream</td><td class="px-4 py-2">4 L <span class="rounded bg-orange-100 px-1 text-[10px] font-semibold text-orange-700">Low</span></td><td class="px-4 py-2">Dairy Fresh</td></tr>
              </tbody>
            </table>
          </div>
          <div class="space-y-4" data-testid="low-stock-alerts">
            <div class="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <h2 class="text-sm font-semibold">Low stock &amp; expiry alerts</h2>
              <ul class="mt-3 space-y-2 text-sm">
                <li class="rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">Heavy Cream below par — reorder today</li>
                <li class="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">Heirloom Tomatoes expiring in 2 days</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  `.trim();
}
