-- DreamOS86 — Runtime profile, credits, publish compat (idempotent)
-- Runnable copy: scripts/runtime-profile-credit-publish-compat.sql

create extension if not exists "uuid-ossp";

-- ── profiles columns ─────────────────────────────────────────────────────────
alter table public.profiles add column if not exists plan_interval text default 'monthly';
alter table public.profiles add column if not exists plan_id text default 'free';
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists company_name text;
alter table public.profiles add column if not exists onboarding_step integer default 0;
alter table public.profiles add column if not exists onboarding_completed boolean default false;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists signup_wizard_completed boolean default false;
alter table public.profiles add column if not exists experience_level text default 'beginner';
alter table public.profiles add column if not exists preferred_model text;
alter table public.profiles add column if not exists default_model_id text;
alter table public.profiles add column if not exists onboarding_answers jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists workspace_name text;
alter table public.profiles add column if not exists credits_remaining integer default 100;
alter table public.profiles add column if not exists credits_limit integer default 100;
alter table public.profiles add column if not exists credits_used integer default 0;
alter table public.profiles add column if not exists credits_period_start timestamptz default now();
alter table public.profiles add column if not exists credits_period_end timestamptz default (now() + interval '1 month');
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid;
alter table public.profiles add column if not exists referral_applied_at timestamptz;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

-- credit_events compat columns
alter table public.credit_events add column if not exists amount integer;
alter table public.credit_events add column if not exists balance_after integer;
alter table public.credit_events add column if not exists reason text;
alter table public.credit_events add column if not exists project_id uuid;
alter table public.credit_events add column if not exists conversation_id uuid;
alter table public.credit_events add column if not exists metadata jsonb default '{}'::jsonb;

create unique index if not exists credit_events_operation_id_unique
  on public.credit_events (operation_id)
  where operation_id is not null;

-- ── projects ─────────────────────────────────────────────────────────────────
alter table public.projects add column if not exists owner_id uuid;
alter table public.projects add column if not exists name text;
alter table public.projects add column if not exists app_name text;
alter table public.projects add column if not exists app_slug text;
alter table public.projects add column if not exists description text;
alter table public.projects add column if not exists category text;
alter table public.projects add column if not exists icon_svg text;
alter table public.projects add column if not exists icon_url text;
alter table public.projects add column if not exists status text default 'draft';
alter table public.projects add column if not exists build_status text default 'idle';
alter table public.projects add column if not exists last_build_id uuid;
alter table public.projects add column if not exists last_build_at timestamptz;
alter table public.projects add column if not exists preview_url text;
alter table public.projects add column if not exists public_url text;
alter table public.projects add column if not exists custom_domain text;
alter table public.projects add column if not exists file_count integer default 0;
alter table public.projects add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.projects add column if not exists created_at timestamptz default now();
alter table public.projects add column if not exists updated_at timestamptz default now();

-- ── conversations / messages / build_jobs / app_files ───────────────────────
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  project_id uuid,
  title text,
  mode text,
  status text default 'active',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.conversations add column if not exists owner_id uuid;
alter table public.conversations add column if not exists project_id uuid;
alter table public.conversations add column if not exists title text;
alter table public.conversations add column if not exists mode text;
alter table public.conversations add column if not exists status text default 'active';
alter table public.conversations add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.conversations add column if not exists created_at timestamptz default now();
alter table public.conversations add column if not exists updated_at timestamptz default now();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid,
  project_id uuid,
  owner_id uuid,
  role text not null,
  content text,
  mode text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.messages add column if not exists conversation_id uuid;
alter table public.messages add column if not exists project_id uuid;
alter table public.messages add column if not exists owner_id uuid;
alter table public.messages add column if not exists role text;
alter table public.messages add column if not exists content text;
alter table public.messages add column if not exists mode text;
alter table public.messages add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.messages add column if not exists created_at timestamptz default now();

create table if not exists public.build_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  owner_id uuid,
  conversation_id uuid,
  status text default 'queued',
  current_step text,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  credits_charged integer default 0,
  error_message text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.build_jobs add column if not exists project_id uuid;
alter table public.build_jobs add column if not exists owner_id uuid;
alter table public.build_jobs add column if not exists conversation_id uuid;
alter table public.build_jobs add column if not exists status text default 'queued';
alter table public.build_jobs add column if not exists current_step text;
alter table public.build_jobs add column if not exists started_at timestamptz;
alter table public.build_jobs add column if not exists completed_at timestamptz;
alter table public.build_jobs add column if not exists failed_at timestamptz;
alter table public.build_jobs add column if not exists credits_charged integer default 0;
alter table public.build_jobs add column if not exists error_message text;
alter table public.build_jobs add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.build_jobs add column if not exists created_at timestamptz default now();
alter table public.build_jobs add column if not exists updated_at timestamptz default now();

create table if not exists public.app_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  owner_id uuid not null,
  path text not null,
  content text,
  language text,
  file_type text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.app_files add column if not exists owner_id uuid;
alter table public.app_files add column if not exists path text;
alter table public.app_files add column if not exists content text;
alter table public.app_files add column if not exists language text;
alter table public.app_files add column if not exists file_type text;
alter table public.app_files add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.app_files add column if not exists created_at timestamptz default now();
alter table public.app_files add column if not exists updated_at timestamptz default now();

create unique index if not exists app_files_project_path_unique
  on public.app_files (project_id, path);

-- ai_usage_logs observability columns
alter table public.ai_usage_logs add column if not exists user_email text;
alter table public.ai_usage_logs add column if not exists project_id uuid;
alter table public.ai_usage_logs add column if not exists conversation_id uuid;
alter table public.ai_usage_logs add column if not exists message_id uuid;
alter table public.ai_usage_logs add column if not exists operation_id text;
alter table public.ai_usage_logs add column if not exists provider text;
alter table public.ai_usage_logs add column if not exists route_reason text;
alter table public.ai_usage_logs add column if not exists tokens_input integer default 0;
alter table public.ai_usage_logs add column if not exists tokens_output integer default 0;
alter table public.ai_usage_logs add column if not exists tokens_charged integer default 0;
alter table public.ai_usage_logs add column if not exists credits_charged integer default 0;
alter table public.ai_usage_logs add column if not exists estimated_provider_cost numeric default 0;
alter table public.ai_usage_logs add column if not exists charged_after_success boolean default false;
alter table public.ai_usage_logs add column if not exists status text default 'pending';
alter table public.ai_usage_logs add column if not exists error_message text;
alter table public.ai_usage_logs add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.ai_usage_logs add column if not exists created_at timestamptz default now();

-- ── ensure_user_profile ───────────────────────────────────────────────────────
create or replace function public.ensure_user_profile(
  p_user_id uuid,
  p_email text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  v_email := coalesce(nullif(trim(p_email), ''), '');
  insert into public.profiles (id, email, plan_id, plan_interval, credits_remaining, credits_limit, credits_used, onboarding_completed, experience_level)
  values (p_user_id, v_email, 'free', 'monthly', 100, 100, 0, false, 'beginner')
  on conflict (id) do nothing;

  update public.profiles set
    email = case when (email is null or email = '') and v_email <> '' then v_email else email end,
    plan_id = coalesce(plan_id, 'free'),
    plan_interval = coalesce(plan_interval, 'monthly'),
    credits_remaining = coalesce(credits_remaining, 100),
    credits_limit = coalesce(credits_limit, 100),
    credits_used = coalesce(credits_used, 0),
    onboarding_completed = coalesce(onboarding_completed, false),
    onboarding_step = coalesce(onboarding_step, 0),
    experience_level = coalesce(experience_level, 'beginner'),
    onboarding_answers = coalesce(onboarding_answers, '{}'::jsonb),
    credits_period_start = coalesce(credits_period_start, now()),
    credits_period_end = coalesce(credits_period_end, now() + interval '1 month'),
    updated_at = now()
  where id = p_user_id;
end;
$$;

revoke execute on function public.ensure_user_profile(uuid, text) from public, anon;
grant execute on function public.ensure_user_profile(uuid, text) to service_role;

-- ── charge_tokens (idempotent via credit_events.operation_id) ─────────────────
drop function if exists public.charge_tokens(uuid, integer, text, text, jsonb);

create or replace function public.charge_tokens(
  p_user_id uuid,
  p_amount integer,
  p_reason text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_project_id uuid default null,
  p_conversation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
  v_op text;
  v_balance_after integer;
begin
  v_op := nullif(trim(coalesce(p_idempotency_key, '')), '');

  perform public.ensure_user_profile(p_user_id, null);

  if v_op is not null and exists (
    select 1 from public.credit_events where operation_id = v_op
  ) then
    select credits_remaining into v_remaining from public.profiles where id = p_user_id;
    return jsonb_build_object(
      'ok', true,
      'success', true,
      'charged', false,
      'balance_after', coalesce(v_remaining, 0),
      'remaining', coalesce(v_remaining, 0),
      'operation_id', v_op,
      'idempotent', true
    );
  end if;

  if p_amount < 1 then
    select credits_remaining into v_remaining from public.profiles where id = p_user_id;
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'invalid_amount',
      'balance_after', coalesce(v_remaining, 0),
      'remaining', coalesce(v_remaining, 0)
    );
  end if;

  select credits_remaining into v_remaining
    from public.profiles
    where id = p_user_id
    for update;

  if v_remaining is null then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'profile_missing', 'remaining', 0);
  end if;

  if v_remaining < p_amount then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'insufficient_credits',
      'remaining', v_remaining,
      'balance_after', v_remaining
    );
  end if;

  v_balance_after := v_remaining - p_amount;

  update public.profiles
    set credits_remaining = v_balance_after,
        credits_used = coalesce(credits_used, 0) + p_amount,
        updated_at = now()
    where id = p_user_id;

  insert into public.credit_events (
    user_id, operation_id, amount, balance_after, reason, project_id, conversation_id, metadata,
    model_id, credits_consumed, event_type
  )
  values (
    p_user_id,
    v_op,
    p_amount,
    v_balance_after,
    coalesce(p_reason, 'AI usage'),
    p_project_id,
    p_conversation_id,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_metadata->>'model_id', null),
    p_amount,
    'generation'
  );

  insert into public.token_ledger (
    user_id, amount, reason, source, metadata, idempotency_key
  )
  values (
    p_user_id,
    p_amount,
    coalesce(p_reason, 'Token charge'),
    'ai_usage',
    coalesce(p_metadata, '{}'::jsonb),
    v_op
  )
  on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'charged', true,
    'balance_after', v_balance_after,
    'remaining', v_balance_after,
    'operation_id', v_op
  );
exception
  when unique_violation then
    select credits_remaining into v_remaining from public.profiles where id = p_user_id;
    return jsonb_build_object(
      'ok', true,
      'success', true,
      'charged', false,
      'balance_after', coalesce(v_remaining, 0),
      'remaining', coalesce(v_remaining, 0),
      'idempotent', true
    );
end;
$$;

revoke execute on function public.charge_tokens(uuid, integer, text, text, jsonb, uuid, uuid) from public, anon;
grant execute on function public.charge_tokens(uuid, integer, text, text, jsonb, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
