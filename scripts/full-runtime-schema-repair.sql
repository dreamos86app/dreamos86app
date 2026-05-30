-- DreamOS86 — Full runtime schema repair (idempotent, production-safe)
-- Consolidates tables, columns, RLS, and RPCs required by the Next.js app.
-- Manual fallback: scripts/full-runtime-schema-repair.sql

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── Timestamps (foundational: set_updated_at; profiles repair: handle_updated_at)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── plan_id enum (optional — profiles may use text plan_id) ───────────────────
do $$
begin
  create type public.plan_id as enum ('free', 'pro', 'business', 'enterprise');
exception
  when duplicate_object then null;
end $$;

do $$ begin alter type public.plan_id add value if not exists 'starter'; exception when duplicate_object then null; end $$;
do $$ begin alter type public.plan_id add value if not exists 'infinity'; exception when duplicate_object then null; end $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- profiles
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text not null default ''
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists role text default 'user';
alter table public.profiles add column if not exists workspace_icon_url text;
alter table public.profiles add column if not exists workspace_name text default 'My Workspace';
alter table public.profiles add column if not exists workspace_description text;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'plan_id'
  ) then
    alter table public.profiles add column plan_id text not null default 'free';
  end if;
end $$;

alter table public.profiles add column if not exists plan_interval text default 'monthly';
alter table public.profiles add column if not exists subscription_status text default 'free';
alter table public.profiles add column if not exists account_status text default 'active';
alter table public.profiles add column if not exists credits_remaining integer default 100;
alter table public.profiles add column if not exists monthly_token_limit integer default 100;
alter table public.profiles add column if not exists monthly_credit_limit integer;
alter table public.profiles add column if not exists tokens_used_this_period integer default 0;
alter table public.profiles add column if not exists credits_reset_at timestamptz;
alter table public.profiles add column if not exists tokens_reset_at timestamptz;
alter table public.profiles add column if not exists billing_period_start timestamptz;
alter table public.profiles add column if not exists billing_period_end timestamptz;
alter table public.profiles add column if not exists current_period_start timestamptz;
alter table public.profiles add column if not exists current_period_end timestamptz;
alter table public.profiles add column if not exists cancel_at_period_end boolean default false;
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspended_reason text;
alter table public.profiles add column if not exists suspension_reason text;
alter table public.profiles add column if not exists last_active_at timestamptz;
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists stripe_price_id text;
alter table public.profiles add column if not exists onboarding_completed boolean default false;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists onboarding_step integer default 1;
alter table public.profiles add column if not exists onboarding_answers jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists default_model_id text default 'automatic';
alter table public.profiles add column if not exists preferred_model text default 'automatic';
alter table public.profiles add column if not exists use_case text;
alter table public.profiles add column if not exists experience_level text default 'beginner';
alter table public.profiles add column if not exists email_verified boolean default false;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add column if not exists terms_accepted_ip text;
alter table public.profiles add column if not exists is_admin boolean default false;
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by text;
alter table public.profiles add column if not exists referral_applied_at timestamptz;
alter table public.profiles add column if not exists total_referrals integer default 0;
alter table public.profiles add column if not exists signup_wizard_completed boolean default false;
alter table public.profiles add column if not exists signup_heard_about text;
alter table public.profiles add column if not exists signup_referral_code text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarding_complete'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarding_completed'
  ) then
    alter table public.profiles rename column onboarding_complete to onboarding_completed;
  end if;
end $$;

update public.profiles
set monthly_credit_limit = coalesce(monthly_credit_limit, monthly_token_limit, 100)
where monthly_credit_limit is null;

update public.profiles
set display_name = coalesce(nullif(trim(display_name), ''), full_name, split_part(coalesce(email, ''), '@', 1))
where display_name is null or trim(display_name) = '';

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- onboarding
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.onboarding (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.onboarding'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) like '%user_id%'
  ) then
    alter table public.onboarding add column if not exists id uuid;
    update public.onboarding set id = gen_random_uuid() where id is null;
    alter table public.onboarding alter column id set default gen_random_uuid();
    begin
      alter table public.onboarding drop constraint onboarding_pkey;
    exception when undefined_object then null;
    end;
    begin
      alter table public.onboarding add primary key (id);
    exception when duplicate_table or invalid_table_definition then null;
    end;
    create unique index if not exists onboarding_user_id_key on public.onboarding (user_id);
  end if;
exception when others then
  raise notice 'onboarding PK migration skipped: %', sqlerrm;
end $$;

alter table public.onboarding add column if not exists current_step integer default 1;
alter table public.onboarding add column if not exists step integer default 1;
alter table public.onboarding add column if not exists onboarding_step integer default 1;
alter table public.onboarding add column if not exists full_name text;
alter table public.onboarding add column if not exists display_name text;
alter table public.onboarding add column if not exists email text;
alter table public.onboarding add column if not exists role text;
alter table public.onboarding add column if not exists job_title text;
alter table public.onboarding add column if not exists company_name text;
alter table public.onboarding add column if not exists company_size text;
alter table public.onboarding add column if not exists workspace_name text;
alter table public.onboarding add column if not exists dream_space_name text;
alter table public.onboarding add column if not exists workspace_description text;
alter table public.onboarding add column if not exists workspace_icon_url text;
alter table public.onboarding add column if not exists experience_level text default 'beginner';
alter table public.onboarding add column if not exists preferred_language text default 'en';
alter table public.onboarding add column if not exists timezone text;
alter table public.onboarding add column if not exists use_case text;
alter table public.onboarding add column if not exists primary_goal text;
alter table public.onboarding add column if not exists build_goal text;
alter table public.onboarding add column if not exists app_goal text;
alter table public.onboarding add column if not exists app_idea text;
alter table public.onboarding add column if not exists app_name text;
alter table public.onboarding add column if not exists project_type text;
alter table public.onboarding add column if not exists building_for text;
alter table public.onboarding add column if not exists team_size text;
alter table public.onboarding add column if not exists goals jsonb default '[]'::jsonb;
alter table public.onboarding add column if not exists answers jsonb default '{}'::jsonb;
alter table public.onboarding add column if not exists settings jsonb default '{}'::jsonb;
alter table public.onboarding add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.onboarding add column if not exists data jsonb default '{}'::jsonb;
alter table public.onboarding add column if not exists preferred_model text default 'automatic';
alter table public.onboarding add column if not exists model_preference text default 'automatic';
alter table public.onboarding add column if not exists preferred_provider text;
alter table public.onboarding add column if not exists default_model_id text default 'automatic';
alter table public.onboarding add column if not exists referral_code text;
alter table public.onboarding add column if not exists referral_source text;
alter table public.onboarding add column if not exists marketing_source text;
alter table public.onboarding add column if not exists heard_from text;
alter table public.onboarding add column if not exists heard_about_us text;
alter table public.onboarding add column if not exists signup_source text;
alter table public.onboarding add column if not exists promo_code text;
alter table public.onboarding add column if not exists referral_locked boolean default false;
alter table public.onboarding add column if not exists referred_by uuid references auth.users (id) on delete set null;
alter table public.onboarding add column if not exists referral_applied_at timestamptz;
alter table public.onboarding add column if not exists completed boolean default false;
alter table public.onboarding add column if not exists onboarding_completed boolean default false;
alter table public.onboarding add column if not exists completed_at timestamptz;
alter table public.onboarding add column if not exists onboarding_completed_at timestamptz;
alter table public.onboarding add column if not exists completed_by uuid references auth.users (id) on delete set null;

create unique index if not exists onboarding_user_id_key on public.onboarding (user_id);

drop trigger if exists onboarding_updated_at on public.onboarding;
create trigger onboarding_updated_at
  before update on public.onboarding
  for each row execute function public.set_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- projects
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'New app',
  slug text not null default 'new-app'
);

alter table public.projects add column if not exists workspace_id uuid;
alter table public.projects add column if not exists description text;
alter table public.projects add column if not exists status text default 'draft';
alter table public.projects add column if not exists framework text default 'nextjs';
alter table public.projects add column if not exists template_id uuid;
alter table public.projects add column if not exists gradient text default 'from-blue-500/20 via-indigo-500/10 to-violet-500/15';
alter table public.projects add column if not exists icon_url text;
alter table public.projects add column if not exists app_icon_url text;
alter table public.projects add column if not exists preview_url text;
alter table public.projects add column if not exists published_subdomain text;
alter table public.projects add column if not exists custom_domain text;
alter table public.projects add column if not exists published_url text;
alter table public.projects add column if not exists published_at timestamptz;
alter table public.projects add column if not exists publish_status text default 'draft';
alter table public.projects add column if not exists build_status text default 'idle';
alter table public.projects add column if not exists is_public boolean default false;
alter table public.projects add column if not exists is_favorite boolean default false;
alter table public.projects add column if not exists category text;
alter table public.projects add column if not exists remix_of uuid references public.projects (id) on delete set null;
alter table public.projects add column if not exists remix_count integer default 0;
alter table public.projects add column if not exists launch_count integer default 0;
alter table public.projects add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.projects add column if not exists generated_metadata jsonb default '{}'::jsonb;
alter table public.projects add column if not exists prompt text;
alter table public.projects add column if not exists visibility text default 'private';

create unique index if not exists projects_owner_slug_unique on public.projects (owner_id, slug);
create unique index if not exists projects_published_subdomain_unique
  on public.projects (published_subdomain)
  where published_subdomain is not null and length(trim(published_subdomain)) > 0;

drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- conversations + messages
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New conversation',
  model_id text not null default 'automatic',
  mode text not null default 'discuss',
  pinned boolean not null default false,
  archived boolean not null default false,
  message_count integer not null default 0,
  last_message_at timestamptz,
  project_id uuid references public.projects (id) on delete set null
);

alter table public.conversations add column if not exists mode text default 'discuss';
alter table public.conversations add column if not exists project_id uuid references public.projects (id) on delete set null;

create index if not exists conversations_user_id_idx on public.conversations (user_id, updated_at desc);

drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  model_id text,
  credits_used integer not null default 0,
  finish_reason text,
  tokens_input integer,
  tokens_output integer,
  attachments jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists messages_conversation_id_idx on public.messages (conversation_id, created_at);

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
  set message_count = message_count + 1,
      last_message_at = new.created_at,
      updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- ══════════════════════════════════════════════════════════════════════════════
-- message_attachments
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  message_id uuid,
  bucket_id text not null default 'chat-media',
  storage_path text not null,
  public_url text not null,
  file_url text,
  mime_type text not null,
  size_bytes bigint not null default 0,
  file_name text
);

alter table public.message_attachments add column if not exists file_name text;
alter table public.message_attachments add column if not exists file_url text;

update public.message_attachments
set file_url = coalesce(file_url, public_url)
where file_url is null;

create index if not exists message_attachments_user_idx
  on public.message_attachments (user_id, created_at desc);

-- ══════════════════════════════════════════════════════════════════════════════
-- app_files, build_jobs, publish_jobs, wrap_jobs
-- ══════════════════════════════════════════════════════════════════════════════
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

create table if not exists public.build_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  status text not null default 'queued',
  prompt text,
  result_summary text,
  error_message text,
  error text,
  platform text,
  artifact_url text,
  artifact_urls jsonb default '[]'::jsonb,
  readiness jsonb default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb
);

alter table public.build_jobs add column if not exists owner_id uuid references auth.users (id) on delete cascade;
alter table public.build_jobs add column if not exists error text;
alter table public.build_jobs add column if not exists platform text;
alter table public.build_jobs add column if not exists artifact_url text;
alter table public.build_jobs add column if not exists artifact_urls jsonb default '[]'::jsonb;
alter table public.build_jobs add column if not exists readiness jsonb default '{}'::jsonb;

update public.build_jobs set owner_id = user_id where owner_id is null;

create index if not exists build_jobs_project_idx on public.build_jobs (project_id, created_at desc);

drop trigger if exists build_jobs_updated_at on public.build_jobs;
create trigger build_jobs_updated_at
  before update on public.build_jobs
  for each row execute function public.set_updated_at();

-- build_job_events (workflow timeline persistence)
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

create table if not exists public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  status text not null default 'queued',
  target text not null default 'web',
  error_message text,
  error text,
  platform text,
  artifact_url text,
  artifact_urls jsonb default '[]'::jsonb,
  readiness jsonb default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb
);

alter table public.publish_jobs add column if not exists owner_id uuid references auth.users (id) on delete cascade;
alter table public.publish_jobs add column if not exists error text;
alter table public.publish_jobs add column if not exists platform text;
alter table public.publish_jobs add column if not exists artifact_url text;
alter table public.publish_jobs add column if not exists artifact_urls jsonb default '[]'::jsonb;
alter table public.publish_jobs add column if not exists readiness jsonb default '{}'::jsonb;

update public.publish_jobs set owner_id = user_id where owner_id is null;

drop trigger if exists publish_jobs_updated_at on public.publish_jobs;
create trigger publish_jobs_updated_at
  before update on public.publish_jobs
  for each row execute function public.set_updated_at();

create table if not exists public.wrap_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  owner_id uuid references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null default 'web_zip',
  status text not null default 'queued',
  error_message text,
  error text,
  platform text,
  artifact_url text,
  artifact_urls jsonb default '[]'::jsonb,
  readiness jsonb default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb
);

alter table public.wrap_jobs add column if not exists owner_id uuid references auth.users (id) on delete cascade;
alter table public.wrap_jobs add column if not exists error text;
alter table public.wrap_jobs add column if not exists platform text;
alter table public.wrap_jobs add column if not exists artifact_urls jsonb default '[]'::jsonb;
alter table public.wrap_jobs add column if not exists readiness jsonb default '{}'::jsonb;

update public.wrap_jobs set owner_id = user_id where owner_id is null;

create index if not exists wrap_jobs_project_idx on public.wrap_jobs (project_id, created_at desc);

drop trigger if exists wrap_jobs_updated_at on public.wrap_jobs;
create trigger wrap_jobs_updated_at
  before update on public.wrap_jobs
  for each row execute function public.set_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- credit_events, token_ledger, ai_usage_logs
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.credit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  build_job_id uuid references public.build_jobs (id) on delete set null,
  operation_id text,
  model_id text not null default 'system',
  credits_consumed integer not null default 0,
  internal_cost_usd numeric(10, 6) default 0,
  event_type text not null default 'generation',
  metadata jsonb not null default '{}'::jsonb
);

alter table public.credit_events add column if not exists operation_id text;
alter table public.credit_events add column if not exists project_id uuid references public.projects (id) on delete set null;
alter table public.credit_events add column if not exists conversation_id uuid references public.conversations (id) on delete set null;
alter table public.credit_events add column if not exists message_id uuid references public.messages (id) on delete set null;
alter table public.credit_events add column if not exists build_job_id uuid references public.build_jobs (id) on delete set null;
alter table public.credit_events add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.credit_events add column if not exists internal_cost_usd numeric(10, 6) default 0;

do $$
begin
  alter table public.credit_events drop constraint if exists credit_events_operation_id_key;
exception when others then null;
end $$;

drop index if exists credit_events_operation_id_unique;
create unique index if not exists credit_events_user_operation_unique
  on public.credit_events (user_id, operation_id)
  where operation_id is not null;

alter table public.credit_events drop constraint if exists credit_events_event_type_check;
alter table public.credit_events add constraint credit_events_event_type_check check (
  event_type in (
    'generation', 'upload', 'deploy', 'grant', 'reset', 'refund', 'adjustment', 'admin_set'
  )
);

create index if not exists credit_events_user_idx on public.credit_events (user_id, created_at desc);

create table if not exists public.token_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount int not null,
  reason text,
  source text not null,
  admin_user_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text
);

alter table public.token_ledger add column if not exists idempotency_key text;
alter table public.token_ledger add column if not exists admin_user_id uuid references public.profiles (id) on delete set null;
alter table public.token_ledger add column if not exists metadata jsonb default '{}'::jsonb;

create unique index if not exists token_ledger_user_idempotency_unique
  on public.token_ledger (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists token_ledger_user_created_idx
  on public.token_ledger (user_id, created_at desc);

alter table public.token_ledger drop constraint if exists token_ledger_source_check;
alter table public.token_ledger add constraint token_ledger_source_check check (
  source in (
    'admin_grant',
    'monthly_reset',
    'purchase',
    'ai_usage',
    'refund',
    'adjustment',
    'subscription_renewal',
    'referral'
  )
);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  user_email text not null default '',
  model_id text not null,
  mode text not null default 'discuss',
  tokens_charged integer not null default 0,
  tokens_input integer,
  tokens_output integer,
  status text not null default 'success',
  error_message text,
  conversation_id uuid references public.conversations (id) on delete set null,
  operation_id text,
  project_id uuid references public.projects (id) on delete set null,
  build_job_id uuid references public.build_jobs (id) on delete set null,
  provider text,
  model_name text,
  credits_charged integer default 0,
  cost_usd numeric(10, 6),
  prompt_hash text,
  metadata jsonb default '{}'::jsonb
);

alter table public.ai_usage_logs add column if not exists operation_id text;
alter table public.ai_usage_logs add column if not exists project_id uuid references public.projects (id) on delete set null;
alter table public.ai_usage_logs add column if not exists build_job_id uuid references public.build_jobs (id) on delete set null;
alter table public.ai_usage_logs add column if not exists provider text;
alter table public.ai_usage_logs add column if not exists model_name text;
alter table public.ai_usage_logs add column if not exists credits_charged integer default 0;
alter table public.ai_usage_logs add column if not exists cost_usd numeric(10, 6);
alter table public.ai_usage_logs add column if not exists prompt_hash text;
alter table public.ai_usage_logs add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.ai_usage_logs add column if not exists user_email text default '';
alter table public.ai_usage_logs add column if not exists error_message text;
alter table public.ai_usage_logs add column if not exists credits_consumed integer;

alter table public.credit_events add column if not exists amount integer;
alter table public.credit_events add column if not exists credits_delta integer;
alter table public.credit_events add column if not exists credits_charged integer;

alter table public.admin_actions add column if not exists admin_email text;
alter table public.admin_actions add column if not exists credits_delta integer;
alter table public.admin_actions add column if not exists operation_id text;

grant select on public.subscriptions to service_role;
grant all on public.subscriptions to service_role;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'ai_usage_logs' and c.conname = 'ai_usage_logs_status_check'
  ) then
    alter table public.ai_usage_logs add constraint ai_usage_logs_status_check
      check (status in ('success', 'error'));
  end if;
exception when others then null;
end $$;

create index if not exists ai_usage_logs_user_created_idx
  on public.ai_usage_logs (user_id, created_at desc);

create index if not exists ai_usage_logs_operation_idx
  on public.ai_usage_logs (operation_id)
  where operation_id is not null;

-- ══════════════════════════════════════════════════════════════════════════════
-- admin_actions, admin_audit_logs
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  action_type text not null,
  amount int,
  reason text,
  otp_verified boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  target_user_id uuid references public.profiles (id) on delete set null,
  before_state jsonb,
  after_state jsonb,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs (created_at desc);

-- ══════════════════════════════════════════════════════════════════════════════
-- subscriptions
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  stripe_subscription_id text,
  stripe_customer_id text,
  stripe_price_id text,
  plan_id text not null default 'free',
  plan_interval text default 'monthly',
  credits_per_period integer default 100,
  status text not null default 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  canceled_at timestamptz,
  trial_end timestamptz,
  pending_downgrade_plan text,
  metadata jsonb default '{}'::jsonb
);

alter table public.subscriptions add column if not exists pending_downgrade_plan text;
alter table public.subscriptions add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.subscriptions add column if not exists credits_per_period integer default 100;

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.handle_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- contact_requests
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  kind text,
  name text not null,
  email text not null,
  company text,
  team_size text,
  expected_usage text,
  current_plan text,
  message text,
  reason text,
  plan_interest text,
  status text not null default 'new',
  source text not null default 'contact_page',
  metadata jsonb not null default '{}'::jsonb
);

alter table public.contact_requests add column if not exists reason text;
alter table public.contact_requests add column if not exists plan_interest text;
alter table public.contact_requests add column if not exists status text default 'new';
alter table public.contact_requests add column if not exists source text default 'contact_page';
alter table public.contact_requests add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.contact_requests add column if not exists user_id uuid references auth.users (id) on delete set null;

alter table public.contact_requests alter column kind drop not null;

create index if not exists contact_requests_status_idx
  on public.contact_requests (status, created_at desc);

-- ══════════════════════════════════════════════════════════════════════════════
-- referrals
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.referral_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  referrer_id uuid not null references auth.users (id) on delete cascade,
  referred_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  status text not null default 'pending',
  rewarded_at timestamptz,
  reward_kind text,
  reward_amount integer,
  attribution jsonb not null default '{}'::jsonb,
  unique (referred_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_id, created_at desc);

create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid references public.referrals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('referrer', 'referred')),
  credits integer not null check (credits > 0),
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists referral_rewards_user_idx on public.referral_rewards (user_id, created_at desc);

-- ══════════════════════════════════════════════════════════════════════════════
-- project integrations / secrets / audit
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.project_integrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected',
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_tested_at timestamptz,
  unique (project_id, provider)
);

alter table public.project_integrations add column if not exists provider_key text;
alter table public.project_integrations add column if not exists description text;
alter table public.project_integrations add column if not exists icon_url text;
alter table public.project_integrations add column if not exists icon text;
alter table public.project_integrations add column if not exists connected_at timestamptz;
alter table public.project_integrations add column if not exists last_error text;
alter table public.project_integrations add column if not exists config jsonb default '{}'::jsonb;
alter table public.project_integrations add column if not exists required_env_vars jsonb default '[]'::jsonb;

alter table public.project_secrets add column if not exists encrypted_value text;

alter table public.projects add column if not exists app_name text;
alter table public.projects add column if not exists icon_svg text;
alter table public.projects add column if not exists short_description text;
alter table public.projects add column if not exists category text;
alter table public.projects add column if not exists build_status text;
alter table public.projects add column if not exists last_build_id uuid;
alter table public.projects add column if not exists last_build_at timestamptz;

alter table public.build_jobs add column if not exists completed_at timestamptz;
alter table public.build_jobs add column if not exists credits_charged integer default 0;

create index if not exists project_integrations_project_id_idx on public.project_integrations (project_id);

drop trigger if exists set_project_integrations_updated_at on public.project_integrations;
create trigger set_project_integrations_updated_at
  before update on public.project_integrations
  for each row execute function public.handle_updated_at();

create table if not exists public.project_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  key_name text not null,
  key text,
  ciphertext text not null default '',
  owner_id uuid references auth.users (id) on delete cascade,
  provider text,
  masked_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, key_name)
);

alter table public.project_secrets add column if not exists owner_id uuid references auth.users (id) on delete cascade;
alter table public.project_secrets add column if not exists provider text;
alter table public.project_secrets add column if not exists masked_value text;
alter table public.project_secrets add column if not exists key text;

update public.project_secrets ps
set key = coalesce(ps.key, ps.key_name)
where ps.key is null;

update public.project_secrets ps
set owner_id = p.owner_id
from public.projects p
where ps.project_id = p.id and ps.owner_id is null;

drop trigger if exists set_project_secrets_updated_at on public.project_secrets;
create trigger set_project_secrets_updated_at
  before update on public.project_secrets
  for each row execute function public.handle_updated_at();

create table if not exists public.project_connection_audit (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  action text not null,
  status text not null,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists project_connection_audit_project_id_idx
  on public.project_connection_audit (project_id, created_at desc);

-- ══════════════════════════════════════════════════════════════════════════════
-- storage_errors (optional diagnostics)
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.storage_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  bucket_id text,
  storage_path text,
  operation text,
  error_message text not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists storage_errors_created_idx
  on public.storage_errors (created_at desc);

-- ══════════════════════════════════════════════════════════════════════════════
-- RLS
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.profiles enable row level security;
alter table public.onboarding enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.app_files enable row level security;
alter table public.build_jobs enable row level security;
alter table public.publish_jobs enable row level security;
alter table public.wrap_jobs enable row level security;
alter table public.credit_events enable row level security;
alter table public.token_ledger enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.admin_actions enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.subscriptions enable row level security;
alter table public.contact_requests enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.project_integrations enable row level security;
alter table public.project_secrets enable row level security;
alter table public.project_connection_audit enable row level security;
alter table public.storage_errors enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "onboarding_select_own" on public.onboarding;
drop policy if exists "onboarding_insert_own" on public.onboarding;
drop policy if exists "onboarding_update_own" on public.onboarding;
drop policy if exists "Users access own onboarding" on public.onboarding;

create policy "onboarding_select_own"
  on public.onboarding for select using (auth.uid() = user_id);
create policy "onboarding_insert_own"
  on public.onboarding for insert with check (auth.uid() = user_id);
create policy "onboarding_update_own"
  on public.onboarding for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Owners full access to projects" on public.projects;
create policy "Owners full access to projects"
  on public.projects for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "Public projects are readable" on public.projects;
create policy "Public projects are readable"
  on public.projects for select using (coalesce(is_public, false) = true);

drop policy if exists "Users access own conversations" on public.conversations;
create policy "Users access own conversations"
  on public.conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users access own messages" on public.messages;
create policy "Users access own messages"
  on public.messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users read own attachments" on public.message_attachments;
create policy "Users read own attachments"
  on public.message_attachments for select using (auth.uid() = user_id);

drop policy if exists "Users insert own attachments" on public.message_attachments;
create policy "Users insert own attachments"
  on public.message_attachments for insert with check (auth.uid() = user_id);

drop policy if exists "Users update own attachments" on public.message_attachments;
create policy "Users update own attachments"
  on public.message_attachments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "app_files: project owner" on public.app_files;
create policy "app_files: project owner"
  on public.app_files for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

drop policy if exists "build_jobs: owner" on public.build_jobs;
create policy "build_jobs: owner"
  on public.build_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "publish_jobs: owner" on public.publish_jobs;
create policy "publish_jobs: owner"
  on public.publish_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "wrap_jobs: own" on public.wrap_jobs;
create policy "wrap_jobs: own"
  on public.wrap_jobs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users read own credit events" on public.credit_events;
create policy "Users read own credit events"
  on public.credit_events for select using (auth.uid() = user_id);

drop policy if exists "token_ledger: own read" on public.token_ledger;
create policy "token_ledger: own read"
  on public.token_ledger for select using (user_id = auth.uid());

drop policy if exists "Users read own ai_usage_logs" on public.ai_usage_logs;
create policy "Users read own ai_usage_logs"
  on public.ai_usage_logs for select using (auth.uid() = user_id);

drop policy if exists "Users insert own ai_usage_logs" on public.ai_usage_logs;
create policy "Users insert own ai_usage_logs"
  on public.ai_usage_logs for insert with check (auth.uid() = user_id);

drop policy if exists "subscriptions: own only" on public.subscriptions;
create policy "subscriptions: own only"
  on public.subscriptions for all using (user_id = auth.uid());

drop policy if exists "Users read own referral code" on public.referral_codes;
create policy "Users read own referral code"
  on public.referral_codes for select using (auth.uid() = user_id);

drop policy if exists "Users insert own referral code" on public.referral_codes;
create policy "Users insert own referral code"
  on public.referral_codes for insert with check (auth.uid() = user_id);

drop policy if exists "Users read own referrals" on public.referrals;
create policy "Users read own referrals"
  on public.referrals for select using (auth.uid() = referrer_id or auth.uid() = referred_id);

drop policy if exists "referral_rewards: own read" on public.referral_rewards;
create policy "referral_rewards: own read"
  on public.referral_rewards for select using (auth.uid() = user_id);

drop policy if exists project_integrations_select_own on public.project_integrations;
create policy project_integrations_select_own
  on public.project_integrations for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists project_connection_audit_select_own on public.project_connection_audit;
create policy project_connection_audit_select_own
  on public.project_connection_audit for select to authenticated
  using (owner_id = auth.uid());

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update on public.onboarding to authenticated;
grant all on public.onboarding to service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC: is_dreamos_owner (admin helpers)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.is_dreamos_owner(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (
      select lower(trim(u.email::text)) = 'dreamos86app@gmail.com'
      from auth.users u
      where u.id = p_user_id
    ),
    false
  );
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC: charge_credits (idempotent debit + ledger + credit_events)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.charge_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
  v_op text;
  v_model text;
begin
  if p_amount < 1 then
    return jsonb_build_object('success', false, 'error', 'invalid_amount', 'remaining', 0);
  end if;

  if auth.uid() is not null and auth.uid() <> p_user_id then
    return jsonb_build_object('success', false, 'error', 'forbidden', 'remaining', 0);
  end if;

  v_op := nullif(trim(p_idempotency_key), '');
  if v_op is null then
    v_op := 'charge_' || gen_random_uuid()::text;
  end if;

  if exists (
    select 1 from public.credit_events
    where user_id = p_user_id and operation_id = v_op
  ) then
    select credits_remaining into v_remaining from public.profiles where id = p_user_id;
    return jsonb_build_object(
      'success', true,
      'remaining', coalesce(v_remaining, 0),
      'idempotent', true
    );
  end if;

  if exists (
    select 1 from public.token_ledger
    where user_id = p_user_id and idempotency_key = v_op
  ) then
    select credits_remaining into v_remaining from public.profiles where id = p_user_id;
    return jsonb_build_object(
      'success', true,
      'remaining', coalesce(v_remaining, 0),
      'idempotent', true
    );
  end if;

  select credits_remaining into v_remaining
  from public.profiles
  where id = p_user_id
  for update;

  if v_remaining is null then
    return jsonb_build_object('success', false, 'error', 'profile_missing', 'remaining', 0);
  end if;

  if v_remaining < p_amount then
    return jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'remaining', v_remaining
    );
  end if;

  update public.profiles
  set credits_remaining = v_remaining - p_amount
  where id = p_user_id;

  v_model := coalesce(p_metadata->>'model_id', 'system');

  insert into public.credit_events (
    user_id, operation_id, model_id, credits_consumed, event_type, metadata,
    conversation_id, project_id, build_job_id
  )
  values (
    p_user_id,
    v_op,
    v_model,
    p_amount,
    'generation',
    coalesce(p_metadata, '{}'::jsonb),
    nullif(p_metadata->>'conversation_id', '')::uuid,
    nullif(p_metadata->>'project_id', '')::uuid,
    nullif(p_metadata->>'build_job_id', '')::uuid
  )
  on conflict do nothing;

  insert into public.token_ledger (
    user_id, amount, reason, source, metadata, idempotency_key
  )
  values (
    p_user_id,
    p_amount,
    coalesce(p_reason, 'Credit charge'),
    'ai_usage',
    coalesce(p_metadata, '{}'::jsonb),
    v_op
  )
  on conflict do nothing;

  return jsonb_build_object('success', true, 'remaining', v_remaining - p_amount, 'idempotent', false);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC: charge_tokens (alias used by /api/chat — keep in sync)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.charge_tokens(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.charge_credits(p_user_id, p_amount, p_reason, p_idempotency_key, p_metadata);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC: grant_tokens / grant_credits_admin
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.grant_tokens(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_idempotency_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_source text default 'adjustment'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
  v_op text;
begin
  if p_amount < 1 then
    return jsonb_build_object('success', false, 'error', 'invalid_amount');
  end if;

  v_op := nullif(trim(p_idempotency_key), '');
  if v_op is not null and exists (
    select 1 from public.token_ledger
    where user_id = p_user_id and idempotency_key = v_op
  ) then
    select credits_remaining into v_remaining from public.profiles where id = p_user_id;
    return jsonb_build_object('success', true, 'remaining', coalesce(v_remaining, 0), 'idempotent', true);
  end if;

  select credits_remaining into v_remaining
  from public.profiles where id = p_user_id for update;

  if v_remaining is null then
    return jsonb_build_object('success', false, 'error', 'profile_missing');
  end if;

  update public.profiles
  set credits_remaining = v_remaining + p_amount
  where id = p_user_id;

  insert into public.token_ledger (
    user_id, amount, reason, source, metadata, idempotency_key
  )
  values (
    p_user_id,
    -p_amount,
    coalesce(p_reason, 'Token grant'),
    coalesce(p_source, 'adjustment'),
    coalesce(p_metadata, '{}'::jsonb),
    v_op
  )
  on conflict do nothing;

  return jsonb_build_object('success', true, 'remaining', v_remaining + p_amount);
end;
$$;

create or replace function public.grant_credits_admin(
  p_admin_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_admin boolean;
  v_op text;
  v_remaining integer;
begin
  select coalesce(p.is_admin, false) into v_is_admin
  from public.profiles p where p.id = p_admin_id;

  if not coalesce(v_is_admin, false) and not public.is_dreamos_owner(p_admin_id) then
    return jsonb_build_object('success', false, 'error', 'not_admin');
  end if;

  if p_amount < 1 then
    return jsonb_build_object('success', false, 'error', 'invalid_amount');
  end if;

  v_op := 'admin_grant:' || p_admin_id::text || ':' || p_user_id::text || ':' || gen_random_uuid()::text;

  select credits_remaining into v_remaining
  from public.profiles where id = p_user_id for update;

  if v_remaining is null then
    return jsonb_build_object('success', false, 'error', 'user_not_found');
  end if;

  update public.profiles
  set credits_remaining = v_remaining + p_amount
  where id = p_user_id;

  insert into public.admin_actions (admin_id, target_id, action_type, amount, reason, metadata)
  values (
    p_admin_id,
    p_user_id,
    'credit_grant',
    p_amount,
    p_reason,
    jsonb_build_object('via', 'grant_credits_admin')
  );

  insert into public.credit_events (
    user_id, operation_id, model_id, credits_consumed, event_type, metadata
  )
  values (
    p_user_id,
    v_op,
    'admin',
    -p_amount,
    'grant',
    jsonb_build_object('admin_id', p_admin_id, 'reason', p_reason)
  )
  on conflict do nothing;

  insert into public.token_ledger (
    user_id, amount, reason, source, admin_user_id, metadata, idempotency_key
  )
  values (
    p_user_id,
    -p_amount,
    coalesce(p_reason, 'Admin credit grant'),
    'admin_grant',
    p_admin_id,
    jsonb_build_object('amount', p_amount),
    v_op
  )
  on conflict do nothing;

  return jsonb_build_object('success', true, 'remaining', v_remaining + p_amount);
end;
$$;

-- grant_credits — backward compatible admin grant
create or replace function public.grant_credits(
  p_admin_id uuid,
  p_user_id uuid,
  p_amount int,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public.grant_credits_admin(p_admin_id, p_user_id, p_amount, p_reason);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC: complete_user_onboarding (never resets credits/plan/stripe)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.complete_user_onboarding(
  p_user_id uuid,
  p_hear_about text,
  p_build_first text,
  p_promo_code text default null,
  p_answers jsonb default '{}'::jsonb,
  p_replay boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_existing record;
  v_profile_done boolean;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select onboarding_completed into v_profile_done
  from public.profiles where id = p_user_id;

  select * into v_existing from public.onboarding where user_id = p_user_id;

  if (v_profile_done = true or coalesce(v_existing.completed, false) = true
      or v_existing.completed_at is not null)
     and not p_replay then
    return jsonb_build_object('success', true, 'already_completed', true);
  end if;

  insert into public.onboarding (
    user_id,
    completed_at,
    onboarding_completed_at,
    completed,
    onboarding_completed,
    current_step,
    step,
    onboarding_step,
    referral_source,
    heard_about_us,
    use_case,
    build_goal,
    promo_code,
    answers,
    data,
    updated_at
  )
  values (
    p_user_id,
    v_now,
    v_now,
    true,
    true,
    4,
    4,
    4,
    p_hear_about,
    p_hear_about,
    p_build_first,
    p_build_first,
    nullif(trim(p_promo_code), ''),
    coalesce(p_answers, '{}'::jsonb),
    coalesce(p_answers, '{}'::jsonb),
    v_now
  )
  on conflict (user_id) do update set
    completed_at = coalesce(public.onboarding.completed_at, excluded.completed_at),
    onboarding_completed_at = coalesce(public.onboarding.onboarding_completed_at, excluded.onboarding_completed_at),
    completed = public.onboarding.completed or excluded.completed,
    onboarding_completed = public.onboarding.onboarding_completed or excluded.onboarding_completed,
    current_step = greatest(coalesce(public.onboarding.current_step, 1), excluded.current_step),
    step = greatest(coalesce(public.onboarding.step, 1), excluded.step),
    onboarding_step = greatest(coalesce(public.onboarding.onboarding_step, 1), excluded.onboarding_step),
    referral_source = excluded.referral_source,
    heard_about_us = excluded.heard_about_us,
    use_case = excluded.use_case,
    build_goal = excluded.build_goal,
    promo_code = coalesce(excluded.promo_code, public.onboarding.promo_code),
    answers = excluded.answers,
    data = excluded.data,
    updated_at = v_now;

  update public.profiles
  set
    onboarding_completed = true,
    onboarding_completed_at = coalesce(onboarding_completed_at, v_now),
    onboarding_step = 4,
    onboarding_answers = coalesce(p_answers, '{}'::jsonb),
    use_case = p_build_first,
    signup_wizard_completed = true,
    preferred_model = coalesce(preferred_model, 'automatic'),
    default_model_id = coalesce(default_model_id, 'automatic')
  where id = p_user_id;

  return jsonb_build_object('success', true, 'already_completed', false);
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- RPC: claim_referral_reward (+20 each, no self-referral, idempotent)
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.claim_referral_reward(p_referred_id uuid, p_credits integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referral record;
  v_key_referrer text;
  v_key_referred text;
begin
  if auth.uid() is not null and auth.uid() <> p_referred_id then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select * into v_referral from public.referrals
  where referred_id = p_referred_id
  order by created_at desc
  limit 1
  for update;

  if v_referral is null then
    return jsonb_build_object('success', false, 'error', 'no_pending_referral');
  end if;

  if v_referral.status = 'rewarded' then
    return jsonb_build_object('success', true, 'already_rewarded', true);
  end if;

  if v_referral.referrer_id = p_referred_id then
    return jsonb_build_object('success', false, 'error', 'self_referral');
  end if;

  v_key_referrer := 'referral:' || v_referral.referrer_id::text || ':' || p_referred_id::text || ':referrer';
  v_key_referred := 'referral:' || v_referral.referrer_id::text || ':' || p_referred_id::text || ':referred';

  update public.referrals
  set status = 'rewarded',
      rewarded_at = now(),
      reward_kind = 'credits',
      reward_amount = p_credits
  where id = v_referral.id and status <> 'rewarded';

  update public.profiles
  set credits_remaining = credits_remaining + p_credits
  where id in (v_referral.referrer_id, p_referred_id);

  insert into public.token_ledger (user_id, amount, reason, source, idempotency_key, metadata)
  values
    (v_referral.referrer_id, -p_credits, 'Referral reward (inviter)', 'referral', v_key_referrer,
      jsonb_build_object('referral_id', v_referral.id, 'role', 'referrer')),
    (p_referred_id, -p_credits, 'Referral welcome bonus', 'referral', v_key_referred,
      jsonb_build_object('referral_id', v_referral.id, 'role', 'referred'))
  on conflict do nothing;

  insert into public.credit_events (user_id, operation_id, model_id, credits_consumed, event_type, metadata)
  values
    (v_referral.referrer_id, v_key_referrer, 'system', -p_credits, 'grant',
      jsonb_build_object('referral_id', v_referral.id)),
    (p_referred_id, v_key_referred, 'system', -p_credits, 'grant',
      jsonb_build_object('referral_id', v_referral.id))
  on conflict do nothing;

  insert into public.referral_rewards (referral_id, user_id, role, credits, idempotency_key)
  values
    (v_referral.id, v_referral.referrer_id, 'referrer', p_credits, v_key_referrer),
    (v_referral.id, p_referred_id, 'referred', p_credits, v_key_referred)
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object('success', true, 'credits_granted', p_credits);
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

revoke all on function public.complete_user_onboarding(uuid, text, text, text, jsonb, boolean) from public;
grant execute on function public.complete_user_onboarding(uuid, text, text, text, jsonb, boolean) to authenticated, service_role;
grant execute on function public.claim_referral_reward(uuid, integer) to authenticated, service_role;
grant execute on function public.charge_credits(uuid, integer, text, text, jsonb) to service_role;
grant execute on function public.charge_tokens(uuid, integer, text, text, jsonb) to service_role;
grant execute on function public.grant_tokens(uuid, integer, text, text, jsonb, text) to service_role;
grant execute on function public.grant_credits_admin(uuid, uuid, integer, text) to service_role;
grant execute on function public.grant_credits(uuid, uuid, int, text) to authenticated, service_role;

NOTIFY pgrst, 'reload schema';
