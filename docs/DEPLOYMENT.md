# DreamOS86 — Production deployment

## Why dreamos86.com can stay stale

Production only updates when **Git is pushed** and **Vercel builds** that commit. Local file changes do not affect dreamos86.com until they are committed, pushed, and deployed.

Check:

```bash
git status
git log origin/main..HEAD --oneline
```

If there are unpushed commits or uncommitted changes, production will not show them.

## Vercel project

1. Vercel dashboard → import/connect repo: `dreamos86app/dreamos86app` (or your fork).
2. **Production branch**: `main` (must match the branch you push).
3. **Root directory**: repository root (`.`). For `dreamos86app/dreamos86app`, `package.json` is at the repo root — do **not** set `dreamos-platform` unless that folder exists in the connected repo.
4. **Build command**: `npm run build`
5. **Install command**: `npm install`

## Production environment variables (names only)

Set in Vercel → Project → Settings → Environment Variables → **Production**:

| Variable | Example / notes |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xycqutvqxtkbszytaxbe.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only) |
| `SUPABASE_SECRET_KEY` | Alternative name supported by code |
| `NEXT_PUBLIC_APP_URL` | `https://dreamos86.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://dreamos86.com` |
| `OPENAI_API_KEY` | If using OpenAI |
| `ANTHROPIC_API_KEY` | If using Anthropic |
| `GOOGLE_GENERATIVE_AI_API_KEY` | If using Gemini (`GEMINI_API_KEY` also accepted in code) |

Do **not** set `NEXT_PUBLIC_APP_URL` to localhost in Production.

## Supabase schema

If logs show `Could not find the table 'public.profiles' in the schema cache`:

1. Supabase dashboard → SQL Editor → run the contents of:
   - `supabase/migrations/20260519130000_ensure_public_profiles_bootstrap.sql`
   - Then run remaining migrations in `supabase/migrations/` in filename order (or use Supabase CLI `supabase db push` after `supabase link --project-ref xycqutvqxtkbszytaxbe`).
2. Reload PostgREST cache:

```sql
NOTIFY pgrst, 'reload schema';
```

3. Supabase → Authentication → URL configuration → add:
   - `https://dreamos86.com/auth/callback`

## Parent lockfile warning (local dev)

If Next warns about `C:\Users\XenoD\Desktop\package-lock.json`, that file is **outside** this app. Remove or move it unless you have another Node project on the Desktop. Keep `dreamos-platform/package-lock.json`.

## Local dev

```bash
npm run dev:fresh
```

Use only http://localhost:3000. Do not run `npm run clean` while `npm run dev` is running.
