-- ============================================================
-- DreamOS86 — Complete public.profiles repair (production)
-- Project: xycqutvqxtkbszytaxbe
--
-- Idempotent. Adds every column the app, admin panel, billing,
-- uploads, and profile bootstrap expect. Safe on partial/manual schemas.
-- ============================================================

-- Minimal table shell (empty or broken projects)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text not null default ''
);

-- plan_id enum (optional — production may use text plan_id instead)
do $$
begin
  create type public.plan_id as enum ('free', 'pro', 'business', 'enterprise');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter type public.plan_id add value if not exists 'starter';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.plan_id add value if not exists 'infinity';
exception when duplicate_object then null;
end $$;

-- ── Core identity ───────────────────────────────────────────────────────────
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists avatar_url text;

-- ── Workspace (settings / uploads) ────────────────────────────────────────────
alter table public.profiles add column if not exists workspace_icon_url text;
alter table public.profiles add column if not exists workspace_name text default 'My Workspace';
alter table public.profiles add column if not exists workspace_description text;

-- ── Plan & billing (tokens stored as credits_remaining in DB) ───────────────
-- plan_id: add as text if missing; leave existing enum column unchanged
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
alter table public.profiles add column if not exists tokens_used_this_period integer default 0;
alter table public.profiles add column if not exists credits_reset_at timestamptz;
alter table public.profiles add column if not exists tokens_reset_at timestamptz;

alter table public.profiles add column if not exists billing_period_start timestamptz;
alter table public.profiles add column if not exists billing_period_end timestamptz;
alter table public.profiles add column if not exists current_period_start timestamptz;
alter table public.profiles add column if not exists current_period_end timestamptz;
alter table public.profiles add column if not exists cancel_at_period_end boolean default false;

-- ── Account state ─────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspended_reason text;
alter table public.profiles add column if not exists suspension_reason text;
alter table public.profiles add column if not exists last_active_at timestamptz;

-- ── Stripe ────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists stripe_price_id text;

-- ── Onboarding & preferences ──────────────────────────────────────────────────
alter table public.profiles add column if not exists onboarding_completed boolean default false;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists onboarding_answers jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists default_model_id text default 'claude-3-5-sonnet';
alter table public.profiles add column if not exists use_case text;
alter table public.profiles add column if not exists experience_level text;

-- ── Auth / legal / admin flags ────────────────────────────────────────────────
alter table public.profiles add column if not exists email_verified boolean default false;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add column if not exists terms_accepted_ip text;
alter table public.profiles add column if not exists is_admin boolean default false;

-- ── Referrals ─────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by uuid;
alter table public.profiles add column if not exists total_referrals integer default 0;

-- ── Signup wizard (later migrations) ──────────────────────────────────────────
alter table public.profiles add column if not exists signup_wizard_completed boolean default false;
alter table public.profiles add column if not exists signup_heard_about text;
alter table public.profiles add column if not exists signup_referral_code text;

-- Legacy foundational column rename
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

-- Sync suspension_reason ↔ suspended_reason
update public.profiles
set suspension_reason = suspended_reason
where suspension_reason is null and suspended_reason is not null;

update public.profiles
set suspended_reason = suspension_reason
where suspended_reason is null and suspension_reason is not null;

-- Display name backfill
update public.profiles
set display_name = coalesce(nullif(trim(display_name), ''), full_name, split_part(coalesce(email, ''), '@', 1))
where display_name is null or trim(display_name) = '';

-- Token / billing defaults
update public.profiles
set
  credits_remaining = coalesce(credits_remaining, 100),
  monthly_token_limit = coalesce(monthly_token_limit, 100),
  credits_reset_at = coalesce(credits_reset_at, tokens_reset_at, created_at + interval '30 days'),
  tokens_reset_at = coalesce(tokens_reset_at, credits_reset_at, created_at + interval '30 days'),
  plan_id = coalesce(nullif(trim(plan_id::text), ''), 'free'),
  subscription_status = coalesce(nullif(trim(subscription_status), ''), 'free'),
  account_status = coalesce(nullif(trim(account_status), ''), case when suspended_at is not null then 'suspended' else 'active' end),
  email = coalesce(nullif(trim(email), ''), '')
where true;

-- plan_id check for text column (skip if enum — check_violation ignored)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'plan_id'
      and udt_name in ('text', 'varchar')
  )
  and not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'profiles' and c.conname = 'profiles_plan_id_check'
  ) then
    alter table public.profiles
      add constraint profiles_plan_id_check
      check (
        plan_id in ('free', 'starter', 'pro', 'business', 'infinity', 'enterprise')
      );
  end if;
exception
  when check_violation then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'profiles' and c.conname = 'profiles_plan_interval_check'
  ) then
    alter table public.profiles
      add constraint profiles_plan_interval_check
      check (plan_interval is null or plan_interval in ('monthly', 'yearly'));
  end if;
exception
  when check_violation then null;
end $$;

-- Uniques (ignore conflicts)
do $$ begin
  alter table public.profiles add constraint profiles_username_key unique (username);
exception when duplicate_object then null; when unique_violation then null;
end $$;

do $$ begin
  alter table public.profiles add constraint profiles_referral_code_key unique (referral_code);
exception when duplicate_object then null; when unique_violation then null;
end $$;

do $$ begin
  alter table public.profiles add constraint profiles_stripe_customer_id_key unique (stripe_customer_id);
exception when duplicate_object then null; when unique_violation then null;
end $$;

do $$ begin
  alter table public.profiles add constraint profiles_stripe_subscription_id_key unique (stripe_subscription_id);
exception when duplicate_object then null; when unique_violation then null;
end $$;

-- updated_at trigger
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- RLS baseline
alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

comment on column public.profiles.credits_remaining is 'User token balance (UI: tokens)';
comment on column public.profiles.monthly_token_limit is 'Monthly token quota for current plan';

notify pgrst, 'reload schema';
