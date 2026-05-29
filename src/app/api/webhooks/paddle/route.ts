/**
 * Paddle webhook endpoint
 *
 * Public URL:
 * https://dreamos86.com/api/webhooks/paddle
 *
 * This route intentionally declares `runtime` and `dynamic` directly.
 * Next.js route segment config cannot be re-exported from another route file.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { POST } from "@/app/api/billing/paddle/webhook/route";
