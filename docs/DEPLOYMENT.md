# DreamOS86 — Production deployment

Production at **https://dreamos86.com** only updates when **code is committed, pushed, and Vercel builds successfully**. Database schema is updated **separately** in Supabase — Vercel never runs migrations.

---

## A. Code deploy (Vercel)

### 1. Check local state

```bash
git status
git log origin/main..HEAD --oneline
```

- Uncommitted changes → not on GitHub yet.
- Unpushed commits → push before expecting production to change.

### 2. Commit and push

```bash
git add .
git commit -m "describe your change"
git push origin main
```

### 3. Wait for Vercel

1. Open [Vercel](https://vercel.com) → **DreamOS86** project → **Deployments**.
2. Wait until the latest `main` deployment shows **Ready** (green).
3. Confirm it is **Production · Current** (not only a Preview).
4. Open the deployment → **Build Logs** if status is **Error** (an old good deploy stays live until a build succeeds).

### 4. Verify the live site

- Hard refresh: `Ctrl+Shift+R` (Windows) or use an incognito window.
- Check commit message on the deployment matches your push.
- Spot-check routes: `/`, `/terms`, `/privacy`, `/auth/login`.

### Automatic deploys

If the repo is connected to Vercel with **Production branch = `main`**, every push to `main` triggers a production deploy automatically. No manual “Redeploy” is required unless you changed **environment variables** (redeploy after saving env vars).

### GitHub Actions (optional CI)

This repo can run `npm run build` on push via `.github/workflows/ci.yml`. That does **not** deploy to Vercel — it only catches build failures early. Vercel still performs the production build.

---

## B. Database deploy (Supabase)

**Vercel does not run Supabase migrations.**

Canonical project ref: **`wciioegiczwqlmlroley`** (dashboard: **dreamos86app**). Runtime repair is already applied on this project.

**Re-run runtime repair** only if schema health regresses (billing RPCs, admin tables, `runtime_diagnostics` view):

1. Admin → **Copy SQL patch** (or open `scripts/dreamos-runtime-repair.sql` — **not** `runtime-repair-sql.ts`).
2. Paste the **entire** file into Supabase SQL Editor for the **same** project as `NEXT_PUBLIC_SUPABASE_URL`.
3. Run with zero errors, then:

```sql
NOTIFY pgrst, 'reload schema';
```

Or with CLI access token: `node scripts/apply-runtime-repair-remote.mjs --project-ref <your-ref>`

### Option 1 — SQL Editor (dashboard)

1. Supabase → **SQL Editor**.
2. Run migrations from `supabase/migrations/` in **filename order** (oldest first).
3. Important bootstrap files if `profiles` is missing:
   - `20260519130000_ensure_public_profiles_bootstrap.sql`
   - `20260523183000_production_blockers_schema.sql`
4. Reload PostgREST schema cache:

```sql
NOTIFY pgrst, 'reload schema';
```

### Option 2 — Supabase CLI

```bash
supabase link --project-ref wciioegiczwqlmlroley
supabase db push
```

Then in SQL Editor:

```sql
NOTIFY pgrst, 'reload schema';
```

### Auth URLs

Supabase → **Authentication** → **URL configuration**:

- Site URL: `https://dreamos86.com`
- Redirect URLs include: `https://dreamos86.com/auth/callback`

### Google OAuth (must match Supabase project)

`NEXT_PUBLIC_SUPABASE_URL`, anon key, and service role **must all be from the same project**.

Canonical production project: **`wciioegiczwqlmlroley`**

Google Cloud → OAuth client → **Authorized redirect URIs** (exactly one Supabase callback per project in use):

```text
https://wciioegiczwqlmlroley.supabase.co/auth/v1/callback
```

If production accidentally points at another project (e.g. `xycqutvqxtkbszytaxbe`), either:

1. **Fix Vercel env** back to `wciioegiczwqlmlroley` and matching keys (recommended), or
2. Add that project’s callback URL to Google and enable Google in that Supabase project’s Auth providers.

After deploy, verify (dev: open while logged out; production: owner session):

```text
GET /api/dev/auth-config
```

Confirm `supabaseProjectRef` equals `wciioegiczwqlmlroley` and `consistencyOk` is true.

---

## C. Environment variables (Vercel Production)

Set in **Vercel → Project → Settings → Environment Variables → Production**:

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wciioegiczwqlmlroley.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (or `SUPABASE_SECRET_KEY`) |
| `NEXT_PUBLIC_APP_URL` | **`https://dreamos86.com`** (not localhost) |
| `NEXT_PUBLIC_SITE_URL` | `https://dreamos86.com` |
| `OPENAI_API_KEY` | If using OpenAI |
| `ANTHROPIC_API_KEY` | If using Anthropic |
| `GOOGLE_GENERATIVE_AI_API_KEY` | If using Gemini (`GEMINI_API_KEY` also accepted) |
| `VERCEL_ACCESS_TOKEN` | Deployment Center / Vercel API (create at [Vercel tokens](https://vercel.com/account/settings/tokens)) — **server only**, not in Supabase |

### Paddle (DreamOS86 subscriptions)

DreamOS86 paid plans bill through **Paddle** (Starter, Pro, Infinity I–VII). Generated apps may use their own payment providers separately. See `.env.example` for the full list.

| Variable | Notes |
|----------|--------|
| `PADDLE_ENVIRONMENT` | `sandbox` locally; `production` on Vercel Production |
| `PADDLE_API_KEY` | Server only |
| `PADDLE_WEBHOOK_SECRET` | Server only |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Only public Paddle token (client checkout) |
| `PADDLE_CHECKOUT_URL` | Production: approved checkout domain (e.g. `https://dreamos86.com`) or leave empty for Paddle default payment link. Never localhost in live mode. |
| `PADDLE_*_MONTHLY_PRICE_ID` / `PADDLE_*_ANNUAL_PRICE_ID` | `pri_*` per plan tier (18 price IDs for 9 paid plans) |
| `PADDLE_*_PRODUCT_ID` | Optional `pro_*` for admin/debug |

**Owner setup (Products + Prices — not manual subscriptions)**

1. Paddle → **Catalog → Products** — create one product per paid plan (tax category: **SaaS**).
2. In each product, create **monthly** recurring price and **annual** recurring price (annual = 20% off 12× monthly).
3. Copy each **`pri_*` Price ID** into `.env.local` and Vercel Production (see `.env.example`).
4. Webhook URL: **`https://dreamos86.com/api/webhooks/paddle`** — include `transaction.completed`, `subscription.*`, past due / payment failed if available.
5. Checkout settings: saving payment methods **ON**; marketing consent **ON** (optional opt-in; see Privacy Policy); discounts optional for coupons.
6. **Do not** use Paddle’s manual **Create subscription** for self-serve users — that is for billing an existing customer manually. DreamOS86 checkout uses Products + Prices.
7. Redeploy after env changes; run sandbox checkout test.
8. Admin status: **`/admin/billing/paddle`** (no secrets shown).

Legacy: `PADDLE_INFINITY_MONTHLY_PRICE_ID` maps to **Infinity I** if `PADDLE_INFINITY_I_MONTHLY_PRICE_ID` is unset. Plan slug `infinity` in API maps to `infinity_i`.

Run: `npm run verify:paddle-integration` and `npm run typecheck`.

**Production go-live checklist**

1. Set Vercel Production: `PADDLE_ENVIRONMENT=production`, live `PADDLE_API_KEY` (`pdl_live…`), `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` (`live_…`), `PADDLE_WEBHOOK_SECRET`, `PADDLE_CHECKOUT_URL=https://dreamos86.com` (or omit for Paddle default link), all 18 `pri_*` price IDs, optional `pro_*` product IDs, `PADDLE_PUBLIC_CHECKOUT_ENABLED=false`.
2. Redeploy production.
3. Open `https://dreamos86.com/admin/billing/paddle` — env consistency green, all price IDs configured. Click **Verify via Paddle API**.
4. Paddle webhook destination: `https://dreamos86.com/api/webhooks/paddle` (Usage type: **Both**).
5. Run Notification Simulations (`transaction.paid`, `transaction.completed`, `subscription.activated`, `subscription.updated`, `transaction.payment_failed`) — confirm events appear in admin; simulations must **not** upgrade random users.
6. Owner live test: `/admin/billing/paddle/test-checkout` (real charge in production).
7. Confirm webhook updates plan + credits; replay event — no double grant.
8. Set `PADDLE_PUBLIC_CHECKOUT_ENABLED=true` and redeploy only after step 7 passes.

If `supabase db push` fails with migration history mismatch, apply `scripts/manual-sql/infinity-tier-plan-ids.sql` in SQL Editor (idempotent).

After changing any env var → **Redeploy** Production (Deployments → ⋯ → Redeploy).

---

## D. Troubleshooting

| Symptom | Likely cause | What to do |
|--------|----------------|------------|
| Site UI unchanged after local edits | Not pushed / Vercel build failed | `git push`, check Vercel **Ready** + **Current** |
| `/terms` or `/privacy` 404 | Old deploy still live | Push legal pages commit; wait for Ready |
| Build Error on Vercel | TypeScript/build failure | Read build logs; fix locally with `npm run build` |
| Site loads but auth/profile 500 | Missing `profiles` table / stale schema | Run migrations + `NOTIFY pgrst, 'reload schema';` |
| “Sign in” while UI looks logged in | Stale client profile | Hard refresh; sign out/in; check session |
| AI Chat/Create 503 | No LLM keys on server | Add provider keys in Vercel; redeploy |
| OAuth redirect wrong | `NEXT_PUBLIC_APP_URL` or Supabase URLs | Fix env + Supabase redirect URLs |
| After Google sign-in, browser opens `localhost:3000/?code=…` | Supabase **Site URL** still `http://localhost:3000`, or production callback not in **Redirect URLs** | Supabase → Auth → URL configuration: Site URL `https://dreamos86.com`; Redirect URLs include `https://dreamos86.com/auth/callback` (exact). Sign in from `https://dreamos86.com`, not localhost. Vercel Production: `NEXT_PUBLIC_APP_URL=https://dreamos86.com` |

### Vercel project settings checklist

- **Git** connected to correct repo
- **Production branch**: `main`
- **Root directory**: `.` (repo root — `package.json` at top level)
- **Build command**: `npm run build`
- **Install command**: `npm install`

### Owner admin: deployment status

Signed in as **dreamos86app@gmail.com** → **Admin** → **System** (auth health tab) includes a **Deployment status** panel (env names only, legal URL checks, migration reminders).

---

## E. Local development

```bash
npm run dev:fresh
```

Use **http://localhost:3000** only. Do not run `npm run clean` while `npm run dev` is running.

If Next warns about a parent `package-lock.json` on your Desktop, remove or move it — keep `dreamos-platform/package-lock.json`.

---

## Why dreamos86.com can stay stale

Local file changes do not affect production until they are **committed**, **pushed**, and **built by Vercel**. Supabase data/schema changes require a separate migration step.
