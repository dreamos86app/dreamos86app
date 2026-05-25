-- DreamOS86 credit billing repair patch (idempotent — paste entire file in Supabase SQL Editor)

create extension if not exists "pgcrypto";

do $$
declare
  r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'charge_tokens',
        'charge_credits',
        'ensure_user_profile',
        'dreamos_debug_credit_rpc',
        'dreamos_reload_pgrst_schema',
        'grant_tokens',
        'grant_credits',
        'grant_credits_admin',
        'is_dreamos_owner',
        'complete_user_onboarding',
        'claim_referral_reward'
      )
  loop
    execute format(
      'drop function if exists %I.%I(%s) cascade',
      r.nspname,
      r.proname,
      r.args
    );
  end loop;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text default '',
  workspace_name text default 'My Workspace',
  plan_id text default 'free',
  plan_interval text default 'monthly',
  credits_remaining integer default 30,
  credits_limit integer default 30,
  credits_used integer default 0,
  onboarding_completed boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  operation_id text,
  amount integer default 0,
  balance_after integer,
  reason text,
  project_id uuid,
  conversation_id uuid,
  model_id text,
  provider text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.token_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  amount integer default 0,
  reason text,
  source text default 'ai_usage',
  idempotency_key text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  user_email text,
  project_id uuid,
  conversation_id uuid,
  message_id uuid,
  operation_id text,
  mode text,
  model_id text,
  provider text,
  route_reason text,
  tokens_input integer default 0,
  tokens_output integer default 0,
  tokens_charged integer default 0,
  credits_charged integer default 0,
  estimated_provider_cost numeric default 0,
  charged_after_success boolean default false,
  status text default 'pending',
  error_message text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text default '';
alter table public.profiles add column if not exists workspace_name text default 'My Workspace';
alter table public.profiles add column if not exists plan_id text default 'free';
alter table public.profiles add column if not exists plan_interval text default 'monthly';
alter table public.profiles add column if not exists credits_remaining integer default 30;
alter table public.profiles add column if not exists credits_limit integer default 30;
alter table public.profiles add column if not exists credits_used integer default 0;
alter table public.profiles add column if not exists onboarding_completed boolean default false;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

alter table public.credit_events add column if not exists user_id uuid;
alter table public.credit_events add column if not exists operation_id text;
alter table public.credit_events add column if not exists amount integer default 0;
alter table public.credit_events add column if not exists balance_after integer;
alter table public.credit_events add column if not exists reason text;
alter table public.credit_events add column if not exists project_id uuid;
alter table public.credit_events add column if not exists conversation_id uuid;
alter table public.credit_events add column if not exists model_id text;
alter table public.credit_events add column if not exists provider text;
alter table public.credit_events add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.credit_events add column if not exists created_at timestamptz default now();

alter table public.token_ledger add column if not exists user_id uuid;
alter table public.token_ledger add column if not exists amount integer default 0;
alter table public.token_ledger add column if not exists reason text;
alter table public.token_ledger add column if not exists source text default 'ai_usage';
alter table public.token_ledger add column if not exists idempotency_key text;
alter table public.token_ledger add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.token_ledger add column if not exists created_at timestamptz default now();

alter table public.ai_usage_logs add column if not exists user_email text;
alter table public.ai_usage_logs add column if not exists project_id uuid;
alter table public.ai_usage_logs add column if not exists conversation_id uuid;
alter table public.ai_usage_logs add column if not exists message_id uuid;
alter table public.ai_usage_logs add column if not exists operation_id text;
alter table public.ai_usage_logs add column if not exists mode text;
alter table public.ai_usage_logs add column if not exists model_id text;
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

create unique index if not exists credit_events_operation_id_unique
  on public.credit_events (operation_id)
  where operation_id is not null;

-- Admin + diagnostics (after profiles)
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

create table if not exists public.admin_pending_confirmations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  admin_id uuid not null references public.profiles (id) on delete cascade,
  admin_email text,
  target_id uuid references public.profiles (id) on delete set null,
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  otp_hash text not null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.dreamos_diagnostic_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  severity text not null check (severity in ('debug', 'info', 'warn', 'error')),
  source text not null,
  category text not null default 'general',
  route text,
  component text,
  action text,
  message text not null,
  user_id uuid references public.profiles (id) on delete set null,
  project_id uuid,
  conversation_id uuid,
  build_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

-- Legacy: runtime_diagnostics may exist as a TABLE; repair expects a VIEW over dreamos_diagnostic_logs.
-- DROP VIEW first fails with 42809 when the name is a table — drop table only here.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'runtime_diagnostics'
      and table_type = 'BASE TABLE'
  ) then
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'dreamos_diagnostic_logs'
    ) then
      begin
        insert into public.dreamos_diagnostic_logs
        select * from public.runtime_diagnostics
        on conflict (id) do nothing;
      exception when others then
        raise notice 'Skipped runtime_diagnostics data copy: %', sqlerrm;
      end;
    end if;
    execute 'drop table public.runtime_diagnostics cascade';
  end if;
end $$;

drop view if exists public.runtime_diagnostics;

create or replace view public.runtime_diagnostics as
  select * from public.dreamos_diagnostic_logs;

grant select on public.dreamos_diagnostic_logs to service_role, authenticated, anon;
grant insert on public.dreamos_diagnostic_logs to service_role;
grant select on public.runtime_diagnostics to service_role, authenticated, anon;

grant select on public.admin_audit_logs to service_role, authenticated, anon;
grant insert on public.admin_audit_logs to service_role;
grant select on public.admin_pending_confirmations to service_role, authenticated, anon;
grant insert, update on public.admin_pending_confirmations to service_role;

-- Onboarding (POST /api/onboarding)
create table if not exists public.onboarding (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed boolean default false,
  current_step integer default 1
);

alter table public.onboarding add column if not exists id uuid default gen_random_uuid();
alter table public.onboarding add column if not exists step integer default 1;
alter table public.onboarding add column if not exists onboarding_step integer default 1;
alter table public.onboarding add column if not exists answers jsonb default '{}'::jsonb;
alter table public.onboarding add column if not exists data jsonb default '{}'::jsonb;
alter table public.onboarding add column if not exists experience_level text;
alter table public.onboarding add column if not exists preferred_model text default 'automatic';
alter table public.onboarding add column if not exists default_model_id text default 'automatic';
alter table public.onboarding add column if not exists workspace_name text;
alter table public.onboarding add column if not exists use_case text;
alter table public.onboarding add column if not exists build_goal text;
alter table public.onboarding add column if not exists referral_source text;
alter table public.onboarding add column if not exists heard_about_us text;
alter table public.onboarding add column if not exists promo_code text;
alter table public.onboarding add column if not exists onboarding_completed boolean default false;
alter table public.onboarding add column if not exists completed_at timestamptz;
alter table public.onboarding add column if not exists onboarding_completed_at timestamptz;

alter table public.profiles add column if not exists onboarding_completed boolean default false;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists onboarding_step integer default 1;
alter table public.profiles add column if not exists onboarding_answers jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists use_case text;
alter table public.profiles add column if not exists signup_wizard_completed boolean default false;

grant select, insert, update on public.onboarding to authenticated, service_role;

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
    user_id, completed_at, onboarding_completed_at, completed, onboarding_completed,
    current_step, step, onboarding_step, referral_source, heard_about_us,
    use_case, build_goal, promo_code, answers, data, updated_at
  )
  values (
    p_user_id, v_now, v_now, true, true, 4, 4, 4, p_hear_about, p_hear_about,
    p_build_first, p_build_first, nullif(trim(p_promo_code), ''),
    coalesce(p_answers, '{}'::jsonb), coalesce(p_answers, '{}'::jsonb), v_now
  )
  on conflict (user_id) do update set
    completed_at = coalesce(public.onboarding.completed_at, excluded.completed_at),
    onboarding_completed_at = coalesce(public.onboarding.onboarding_completed_at, excluded.onboarding_completed_at),
    completed = public.onboarding.completed or excluded.completed,
    onboarding_completed = public.onboarding.onboarding_completed or excluded.onboarding_completed,
    referral_source = excluded.referral_source,
    heard_about_us = excluded.heard_about_us,
    use_case = excluded.use_case,
    build_goal = excluded.build_goal,
    answers = excluded.answers,
    data = excluded.data,
    updated_at = v_now;

  update public.profiles set
    onboarding_completed = true,
    onboarding_completed_at = coalesce(onboarding_completed_at, v_now),
    onboarding_step = 4,
    onboarding_answers = coalesce(p_answers, '{}'::jsonb),
    use_case = p_build_first,
    signup_wizard_completed = true
  where id = p_user_id;

  return jsonb_build_object('success', true, 'already_completed', false);
end;
$$;

revoke all on function public.complete_user_onboarding(uuid, text, text, text, jsonb, boolean) from public;
grant execute on function public.complete_user_onboarding(uuid, text, text, text, jsonb, boolean) to authenticated, service_role;

create or replace function public.ensure_user_profile(
  p_user_id uuid,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'user_id_required');
  end if;

  v_email := coalesce(nullif(trim(p_email), ''), '');

  insert into public.profiles (
    id, email, workspace_name, plan_id, plan_interval,
    credits_remaining, credits_limit, credits_used, onboarding_completed
  )
  values (
    p_user_id, v_email, 'My Workspace', 'free', 'monthly', 100, 100, 0, false
  )
  on conflict (id) do nothing;

  update public.profiles set
    email = case when (email is null or email = '') and v_email <> '' then v_email else email end,
    workspace_name = coalesce(nullif(workspace_name, ''), 'My Workspace'),
    plan_id = coalesce(plan_id, 'free'),
    plan_interval = coalesce(plan_interval, 'monthly'),
    credits_remaining = coalesce(credits_remaining, 100),
    credits_limit = coalesce(credits_limit, 100),
    credits_used = coalesce(credits_used, 0),
    onboarding_completed = coalesce(onboarding_completed, false),
    updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('ok', true, 'user_id', p_user_id);
end;
$$;

create or replace function public.charge_tokens(
  p_user_id uuid,
  p_amount numeric,
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
  v_remaining numeric;
  v_op text;
  v_balance_after numeric;
  v_provider_usd numeric;
  v_model text;
begin
  v_op := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_provider_usd := coalesce((p_metadata->>'provider_cost_usd')::numeric, 0);
  v_model := coalesce(nullif(trim(p_metadata->>'model_id'), ''), 'unknown');

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

  if p_amount is null or p_amount <= 0 then
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

  v_balance_after := round(v_remaining - p_amount, 1);

  update public.profiles
    set credits_remaining = v_balance_after,
        credits_used = round(coalesce(credits_used, 0) + p_amount, 1),
        updated_at = now()
    where id = p_user_id;

  insert into public.credit_events (
    user_id, operation_id, amount, balance_after, reason, project_id, conversation_id, metadata,
    model_id, credits_consumed, event_type, provider_cost_usd, status
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
    v_model,
    p_amount,
    'generation',
    v_provider_usd,
    'finalized'
  );

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'charged', true,
    'balance_after', v_balance_after,
    'remaining', v_balance_after,
    'operation_id', v_op,
    'idempotent', false
  );
end;
$$;

revoke execute on function public.ensure_user_profile(uuid, text) from public, anon;
grant execute on function public.ensure_user_profile(uuid, text) to authenticated, service_role;

revoke execute on function public.charge_tokens(uuid, numeric, text, text, jsonb, uuid, uuid) from public, anon;
grant execute on function public.charge_tokens(uuid, numeric, text, text, jsonb, uuid, uuid) to authenticated, service_role;

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
begin
  return public.charge_tokens(
    p_user_id,
    p_amount::numeric,
    p_reason,
    p_idempotency_key,
    p_metadata,
    nullif(p_metadata->>'project_id', '')::uuid,
    nullif(p_metadata->>'conversation_id', '')::uuid
  );
end;
$$;

revoke execute on function public.charge_credits(uuid, integer, text, text, jsonb) from public, anon;
grant execute on function public.charge_credits(uuid, integer, text, text, jsonb) to authenticated, service_role;

create or replace function public.dreamos_reload_pgrst_schema()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_notify('pgrst', 'reload schema');
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.dreamos_reload_pgrst_schema() from public, anon;
grant execute on function public.dreamos_reload_pgrst_schema() to service_role;

create or replace function public.dreamos_debug_credit_rpc()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  return jsonb_build_object(
    'profiles_exists', exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'profiles'
    ),
    'credit_events_exists', exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'credit_events'
    ),
    'token_ledger_exists', exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'token_ledger'
    ),
    'ai_usage_logs_exists', exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'ai_usage_logs'
    ),
    'charge_tokens_signatures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'args', pg_get_function_identity_arguments(p.oid),
        'returns', pg_get_function_result(p.oid),
        'arg_names', to_jsonb(p.proargnames)
      ) order by pg_get_function_identity_arguments(p.oid))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'charge_tokens'
    ), '[]'::jsonb),
    'ensure_user_profile_signatures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'args', pg_get_function_identity_arguments(p.oid),
        'returns', pg_get_function_result(p.oid),
        'arg_names', to_jsonb(p.proargnames)
      ) order by pg_get_function_identity_arguments(p.oid))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ensure_user_profile'
    ), '[]'::jsonb),
    'grant_tokens_signatures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'args', pg_get_function_identity_arguments(p.oid),
        'returns', pg_get_function_result(p.oid)
      ) order by pg_get_function_identity_arguments(p.oid))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'grant_tokens'
    ), '[]'::jsonb),
    'grant_credits_signatures', coalesce((
      select jsonb_agg(jsonb_build_object(
        'args', pg_get_function_identity_arguments(p.oid),
        'returns', pg_get_function_result(p.oid)
      ) order by pg_get_function_identity_arguments(p.oid))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('grant_credits', 'grant_credits_admin')
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.dreamos_debug_credit_rpc() from public, anon;
grant execute on function public.dreamos_debug_credit_rpc() to authenticated, service_role;

-- Grant credits RPCs (admin panel + verify charge_tokens restore)
create or replace function public.is_dreamos_owner(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user_id
      and lower(trim(u.email::text)) = 'dreamos86app@gmail.com'
  );
$$;

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
  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_id_required');
  end if;
  if p_amount < 1 then
    return jsonb_build_object('success', false, 'error', 'invalid_amount');
  end if;

  v_op := nullif(trim(coalesce(p_idempotency_key, '')), '');
  perform public.ensure_user_profile(p_user_id, null);

  if v_op is not null and exists (
    select 1 from public.credit_events where operation_id = v_op
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
  set credits_remaining = v_remaining + p_amount,
      credits_used = greatest(coalesce(credits_used, 0) - p_amount, 0),
      updated_at = now()
  where id = p_user_id;

  insert into public.credit_events (
    user_id, operation_id, amount, balance_after, reason, metadata, event_type
  )
  values (
    p_user_id, v_op, p_amount, v_remaining + p_amount,
    coalesce(p_reason, 'Token grant'), coalesce(p_metadata, '{}'::jsonb), 'grant'
  )
  on conflict do nothing;

  insert into public.token_ledger (
    user_id, amount, reason, source, metadata, idempotency_key
  )
  values (
    p_user_id, -p_amount, coalesce(p_reason, 'Token grant'),
    coalesce(p_source, 'adjustment'), coalesce(p_metadata, '{}'::jsonb), v_op
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
  if p_admin_id is null or p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_id_required');
  end if;

  select coalesce(p.is_admin, false) into v_is_admin
  from public.profiles p where p.id = p_admin_id;

  if not coalesce(v_is_admin, false) and not public.is_dreamos_owner(p_admin_id) then
    return jsonb_build_object('success', false, 'error', 'not_admin');
  end if;

  if p_amount < 1 then
    return jsonb_build_object('success', false, 'error', 'invalid_amount');
  end if;

  perform public.ensure_user_profile(p_user_id, null);

  v_op := 'admin_grant:' || p_admin_id::text || ':' || p_user_id::text || ':' || gen_random_uuid()::text;

  select credits_remaining into v_remaining
  from public.profiles where id = p_user_id for update;

  if v_remaining is null then
    return jsonb_build_object('success', false, 'error', 'user_not_found');
  end if;

  update public.profiles
  set credits_remaining = v_remaining + p_amount,
      credits_used = greatest(coalesce(credits_used, 0) - p_amount, 0),
      updated_at = now()
  where id = p_user_id;

  insert into public.credit_events (
    user_id, operation_id, amount, balance_after, reason, metadata, event_type, model_id
  )
  values (
    p_user_id, v_op, p_amount, v_remaining + p_amount,
    coalesce(p_reason, 'Admin credit grant'),
    jsonb_build_object('admin_id', p_admin_id),
    'grant', 'admin'
  )
  on conflict do nothing;

  insert into public.token_ledger (
    user_id, amount, reason, source, metadata, idempotency_key
  )
  values (
    p_user_id, -p_amount, coalesce(p_reason, 'Admin credit grant'), 'admin_grant',
    jsonb_build_object('admin_id', p_admin_id, 'amount', p_amount), v_op
  )
  on conflict do nothing;

  return jsonb_build_object('success', true, 'remaining', v_remaining + p_amount);
end;
$$;

create or replace function public.grant_credits(
  p_admin_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.grant_credits_admin(p_admin_id, p_user_id, p_amount, p_reason);
end;
$$;

revoke execute on function public.is_dreamos_owner(uuid) from public, anon;
grant execute on function public.is_dreamos_owner(uuid) to service_role;

revoke execute on function public.grant_tokens(uuid, integer, text, text, jsonb, text) from public, anon;
grant execute on function public.grant_tokens(uuid, integer, text, text, jsonb, text) to authenticated, service_role;

revoke execute on function public.grant_credits_admin(uuid, uuid, integer, text) from public, anon;
grant execute on function public.grant_credits_admin(uuid, uuid, integer, text) to service_role;

revoke execute on function public.grant_credits(uuid, uuid, integer, text) from public, anon;
grant execute on function public.grant_credits(uuid, uuid, integer, text) to authenticated, service_role;

-- app_files import metadata (ZIP import / builder — must match PostgREST cache)
alter table public.app_files add column if not exists mime_type text default 'text/plain';
alter table public.app_files add column if not exists size_bytes bigint default 0;
alter table public.app_files add column if not exists source text default 'generated';
alter table public.app_files add column if not exists file_type text default 'file';
alter table public.app_files add column if not exists language text;
alter table public.app_files add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.app_files add column if not exists import_id uuid;
alter table public.app_files add column if not exists storage_path text;
alter table public.app_files add column if not exists encoding text;
alter table public.app_files add column if not exists content_hash text;
alter table public.app_files add column if not exists owner_id uuid references auth.users (id) on delete set null;

update public.app_files
set mime_type = coalesce(nullif(trim(mime_type), ''), 'text/plain')
where mime_type is null;

update public.app_files
set size_bytes = coalesce(octet_length(content), 0)
where size_bytes is null or size_bytes = 0;

update public.app_files
set source = coalesce(nullif(trim(source), ''), 'generated')
where source is null;

alter table public.profiles alter column credits_remaining set default 30;
alter table public.profiles alter column credits_limit set default 30;

update public.profiles p
set credits_remaining = 30, credits_limit = 30, monthly_token_limit = coalesce(p.monthly_token_limit, 30), updated_at = now()
where coalesce(p.plan_id, 'free') = 'free'
  and p.credits_remaining = 100
  and coalesce(p.credits_limit, 100) = 100
  and not exists (
    select 1 from public.credit_events ce
    where ce.user_id = p.id and coalesce(ce.event_type, '') in ('grant', 'purchase', 'admin_grant')
  );

create or replace function public.claim_referral_reward(p_referred_id uuid, p_credits integer default 5)
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

  v_key_referrer := 'referral:referrer:' || v_referral.referrer_id::text || ':' || p_referred_id::text;
  v_key_referred := 'referral:referred:' || p_referred_id::text;

  perform public.grant_tokens(v_referral.referrer_id, p_credits, 'Referral reward', v_key_referrer, '{}'::jsonb, 'referral');
  perform public.grant_tokens(p_referred_id, p_credits, 'Referral signup bonus', v_key_referred, '{}'::jsonb, 'referral');

  update public.referrals set status = 'rewarded', rewarded_at = now() where id = v_referral.id;

  return jsonb_build_object('success', true, 'credits', p_credits);
exception when others then
  return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

revoke execute on function public.claim_referral_reward(uuid, integer) from public, anon;
grant execute on function public.claim_referral_reward(uuid, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('charge_tokens', 'ensure_user_profile')
order by p.proname, args;
