-- DreamOS86 — Builder runtime quality, publish columns, credits (idempotent)
-- Manual fallback: scripts/builder-runtime-quality-and-credits.sql

-- ── projects: publish + build metadata ─────────────────────────────────────
alter table public.projects add column if not exists app_icon_url text;
alter table public.projects add column if not exists published_url text;
alter table public.projects add column if not exists published_at timestamptz;
alter table public.projects add column if not exists publish_status text default 'draft';
alter table public.projects add column if not exists build_status text default 'idle';

comment on column public.projects.publish_status is 'draft | ready | published | failed';
comment on column public.projects.build_status is 'idle | building | ready | failed';

-- ── app_files (builder output) ─────────────────────────────────────────────
create table if not exists public.app_files (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  project_id uuid not null references public.projects (id) on delete cascade,
  path text not null,
  content text not null default '',
  mime_type text not null default 'text/plain',
  size_bytes integer not null default 0,
  unique (project_id, path)
);

create index if not exists app_files_project_idx on public.app_files (project_id);

drop trigger if exists app_files_updated_at on public.app_files;
create trigger app_files_updated_at
  before update on public.app_files
  for each row execute function public.set_updated_at();

alter table public.app_files enable row level security;

drop policy if exists "app_files: project owner" on public.app_files;
create policy "app_files: project owner"
  on public.app_files for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

-- ── build_jobs ─────────────────────────────────────────────────────────────
create table if not exists public.build_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  conversation_id uuid,
  status text not null default 'queued',
  prompt text,
  result_summary text,
  error_message text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists build_jobs_project_idx on public.build_jobs (project_id, created_at desc);

alter table public.build_jobs enable row level security;

drop policy if exists "build_jobs: owner" on public.build_jobs;
create policy "build_jobs: owner"
  on public.build_jobs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── publish_jobs (optional queue) ────────────────────────────────────────────
create table if not exists public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  status text not null default 'queued',
  target text not null default 'web',
  error_message text,
  meta jsonb not null default '{}'::jsonb
);

alter table public.publish_jobs enable row level security;

drop policy if exists "publish_jobs: owner" on public.publish_jobs;
create policy "publish_jobs: owner"
  on public.publish_jobs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── credit_events idempotency ────────────────────────────────────────────────
alter table public.credit_events add column if not exists operation_id text;

create unique index if not exists credit_events_operation_id_unique
  on public.credit_events (user_id, operation_id)
  where operation_id is not null;

-- ── ai_usage_logs operation_id ───────────────────────────────────────────────
alter table public.ai_usage_logs add column if not exists operation_id text;

create index if not exists ai_usage_logs_operation_idx
  on public.ai_usage_logs (operation_id)
  where operation_id is not null;

notify pgrst, 'reload schema';
