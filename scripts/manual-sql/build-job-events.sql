-- Idempotent: create build_job_events for workflow timeline persistence.
-- Run in Supabase SQL Editor, then Settings → API → Reload schema (or wait ~60s).

create table if not exists public.build_job_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  job_id uuid not null references public.build_jobs (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  detail text,
  file_path text,
  progress_percent smallint check (progress_percent is null or (progress_percent >= 0 and progress_percent <= 100)),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists build_job_events_job_created_idx
  on public.build_job_events (job_id, created_at asc);

create index if not exists build_job_events_project_created_idx
  on public.build_job_events (project_id, created_at desc);

alter table public.build_job_events enable row level security;

drop policy if exists "build_job_events: project owner read" on public.build_job_events;
create policy "build_job_events: project owner read"
  on public.build_job_events for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = build_job_events.project_id
        and p.owner_id = auth.uid()
    )
  );

revoke insert, update, delete on public.build_job_events from anon;
revoke insert, update, delete on public.build_job_events from authenticated;
grant select on public.build_job_events to authenticated;
grant all on public.build_job_events to service_role;

notify pgrst, 'reload schema';
