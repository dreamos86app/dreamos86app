-- Per-project integration connections (GitHub, Supabase, etc.)
-- Secrets stay in project_secrets (encrypted); this table holds status + non-secret metadata.

create table if not exists public.project_integrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'needs_config', 'connected', 'error')),
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_tested_at timestamptz,
  unique (project_id, provider)
);

create index if not exists project_integrations_project_id_idx
  on public.project_integrations (project_id);

create index if not exists project_integrations_owner_id_idx
  on public.project_integrations (owner_id);

comment on table public.project_integrations is 'Per-app integration connection state (no secret values).';

-- Audit trail for connect / test / disconnect
create table if not exists public.project_connection_audit (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  action text not null,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists project_connection_audit_project_id_idx
  on public.project_connection_audit (project_id, created_at desc);

-- Extend project_secrets for provider-scoped keys + masked display
alter table public.project_secrets
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

alter table public.project_secrets
  add column if not exists provider text;

alter table public.project_secrets
  add column if not exists masked_value text;

-- Backfill owner_id from projects where missing
update public.project_secrets ps
set owner_id = p.owner_id
from public.projects p
where ps.project_id = p.id and ps.owner_id is null;

create trigger set_project_integrations_updated_at
  before update on public.project_integrations
  for each row
  execute function public.handle_updated_at();

alter table public.project_integrations enable row level security;

create policy project_integrations_select_own
  on public.project_integrations
  for select
  to authenticated
  using (owner_id = auth.uid());

-- No insert/update/delete for users — API uses service role after owner check

alter table public.project_connection_audit enable row level security;

create policy project_connection_audit_select_own
  on public.project_connection_audit
  for select
  to authenticated
  using (owner_id = auth.uid());

notify pgrst, 'reload schema';
