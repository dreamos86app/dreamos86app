-- DreamOS86 — complete onboarding schema (idempotent, production-safe)
-- Aligns public.onboarding + profiles with app payload from POST /api/onboarding

-- ── Ensure onboarding table exists ───────────────────────────────────────────
create table if not exists public.onboarding (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- Legacy installs: user_id was the sole primary key — add id + unique(user_id) when safe
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
    exception when undefined_object then
      null;
    end;
    begin
      alter table public.onboarding add primary key (id);
    exception when duplicate_table or invalid_table_definition then
      null;
    end;
    create unique index if not exists onboarding_user_id_key on public.onboarding (user_id);
  end if;
exception when others then
  raise notice 'onboarding PK migration skipped: %', sqlerrm;
end $$;

-- ── Step / identity columns ───────────────────────────────────────────────────
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

-- ── Answers / goals ───────────────────────────────────────────────────────────
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

-- ── Model preferences ─────────────────────────────────────────────────────────
alter table public.onboarding add column if not exists preferred_model text default 'automatic';
alter table public.onboarding add column if not exists model_preference text default 'automatic';
alter table public.onboarding add column if not exists preferred_provider text;
alter table public.onboarding add column if not exists default_model_id text default 'automatic';

-- ── Referral / source ───────────────────────────────────────────────────────────
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

-- ── Completion ──────────────────────────────────────────────────────────────────
alter table public.onboarding add column if not exists completed boolean default false;
alter table public.onboarding add column if not exists onboarding_completed boolean default false;
alter table public.onboarding add column if not exists completed_at timestamptz;
alter table public.onboarding add column if not exists onboarding_completed_at timestamptz;
alter table public.onboarding add column if not exists completed_by uuid references auth.users (id) on delete set null;

create unique index if not exists onboarding_user_id_key on public.onboarding (user_id);

-- ── Profiles: onboarding + referral fields (never touch credits/plan here) ─────
alter table public.profiles add column if not exists onboarding_completed boolean default false;
alter table public.profiles add column if not exists onboarding_completed_at timestamptz;
alter table public.profiles add column if not exists onboarding_step integer default 1;
alter table public.profiles add column if not exists onboarding_answers jsonb default '{}'::jsonb;
alter table public.profiles add column if not exists referral_code text;
alter table public.profiles add column if not exists referred_by text;
alter table public.profiles add column if not exists referral_applied_at timestamptz;
alter table public.profiles add column if not exists experience_level text default 'beginner';
alter table public.profiles add column if not exists preferred_model text default 'automatic';
alter table public.profiles add column if not exists default_model_id text default 'automatic';
alter table public.profiles add column if not exists workspace_name text;
alter table public.profiles add column if not exists use_case text;
alter table public.profiles add column if not exists signup_wizard_completed boolean default false;

-- ── Referral rewards audit (idempotent grants) ──────────────────────────────────
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

alter table public.referral_rewards enable row level security;

drop policy if exists "referral_rewards: own read" on public.referral_rewards;
create policy "referral_rewards: own read"
  on public.referral_rewards for select
  using (auth.uid() = user_id);

-- ── updated_at trigger ──────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists onboarding_updated_at on public.onboarding;
create trigger onboarding_updated_at
  before update on public.onboarding
  for each row execute function public.set_updated_at();

-- ── RLS: onboarding ─────────────────────────────────────────────────────────────
alter table public.onboarding enable row level security;

drop policy if exists "onboarding: own only" on public.onboarding;
drop policy if exists "Users access own onboarding" on public.onboarding;
drop policy if exists "onboarding_select_own" on public.onboarding;
drop policy if exists "onboarding_insert_own" on public.onboarding;
drop policy if exists "onboarding_update_own" on public.onboarding;

create policy "onboarding_select_own"
  on public.onboarding for select
  using (auth.uid() = user_id);

create policy "onboarding_insert_own"
  on public.onboarding for insert
  with check (auth.uid() = user_id);

create policy "onboarding_update_own"
  on public.onboarding for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update on public.onboarding to authenticated;
grant all on public.onboarding to service_role;

-- ── Atomic onboarding completion (upsert by user_id, never reset completion) ───
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
    workspace_name,
    experience_level,
    preferred_model,
    default_model_id,
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
    null,
    null,
    'automatic',
    'automatic',
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
    experience_level = coalesce(experience_level, null),
    preferred_model = coalesce(preferred_model, 'automatic'),
    default_model_id = coalesce(default_model_id, 'automatic')
  where id = p_user_id;

  return jsonb_build_object('success', true, 'already_completed', false);
end;
$$;

revoke all on function public.complete_user_onboarding(uuid, text, text, text, jsonb, boolean) from public;
grant execute on function public.complete_user_onboarding(uuid, text, text, text, jsonb, boolean) to authenticated, service_role;

-- ── Referral claim: +20 credits each, idempotent ledger keys ───────────────────
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
  v_has_ledger boolean;
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

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'token_ledger'
  ) into v_has_ledger;

  update public.referrals
  set status = 'rewarded',
      rewarded_at = now(),
      reward_kind = 'credits',
      reward_amount = p_credits
  where id = v_referral.id and status <> 'rewarded';

  update public.profiles
  set credits_remaining = credits_remaining + p_credits
  where id in (v_referral.referrer_id, p_referred_id);

  if v_has_ledger then
    insert into public.token_ledger (user_id, amount, reason, source, idempotency_key, metadata)
    values
      (v_referral.referrer_id, -p_credits, 'Referral reward (inviter)', 'referral',
        v_key_referrer, jsonb_build_object('referral_id', v_referral.id, 'role', 'referrer')),
      (p_referred_id, -p_credits, 'Referral welcome bonus', 'referral',
        v_key_referred, jsonb_build_object('referral_id', v_referral.id, 'role', 'referred'))
    on conflict do nothing;
  end if;

  insert into public.credit_events (user_id, operation_id, model_id, credits_consumed, event_type, metadata)
  values
    (v_referral.referrer_id, v_key_referrer, 'system', -p_credits, 'grant',
      jsonb_build_object('referral_id', v_referral.id)),
    (p_referred_id, v_key_referred, 'system', -p_credits, 'grant',
      jsonb_build_object('referral_id', v_referral.id))
  on conflict (operation_id) do nothing;

  insert into public.referral_rewards (referral_id, user_id, role, credits, idempotency_key)
  values
    (v_referral.id, v_referral.referrer_id, 'referrer', p_credits, v_key_referrer),
    (v_referral.id, p_referred_id, 'referred', p_credits, v_key_referred)
  on conflict (idempotency_key) do nothing;

  begin
    insert into public.notifications (user_id, type, title, body, action_url)
    values
      (v_referral.referrer_id, 'referral', 'Your invite paid off!',
        'Someone you invited finished setup. +' || p_credits || ' credits.', '/settings/account#referrals'),
      (p_referred_id, 'referral', 'Welcome bonus',
        'You joined via a referral. +' || p_credits || ' credits.', '/credits');
  exception when others then
    null;
  end;

  return jsonb_build_object('success', true, 'credits_granted', p_credits);
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.claim_referral_reward(uuid, integer) to authenticated, service_role;

-- Allow referral source in token_ledger when table exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'token_ledger') then
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
  end if;
exception when others then
  raise notice 'token_ledger source check skipped: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
