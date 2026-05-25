-- Critical PostgREST / billing repair (idempotent). Full patch: dreamos-runtime-repair.sql

create extension if not exists "pgcrypto";

do $$
declare r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'charge_tokens','charge_credits','ensure_user_profile','dreamos_debug_credit_rpc',
      'dreamos_reload_pgrst_schema','grant_tokens','grant_credits','grant_credits_admin',
      'is_dreamos_owner','complete_user_onboarding','claim_referral_reward'
    )
  loop
    execute format('drop function if exists %I.%I(%s) cascade', r.nspname, r.proname, r.args);
  end loop;
end $$;

create or replace function public.ensure_user_profile(p_user_id uuid, p_email text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if p_user_id is null then return jsonb_build_object('ok', false, 'error', 'user_id_required'); end if;
  v_email := coalesce(nullif(trim(p_email), ''), '');
  insert into public.profiles (id, email, plan_id, credits_remaining, credits_limit, credits_used)
  values (p_user_id, v_email, 'free', 30, 30, 0) on conflict (id) do nothing;
  update public.profiles set
    email = case when (email is null or email = '') and v_email <> '' then v_email else email end,
    plan_id = coalesce(plan_id, 'free'),
    credits_remaining = coalesce(credits_remaining, 30),
    credits_limit = coalesce(credits_limit, 30),
    updated_at = now()
  where id = p_user_id;
  return jsonb_build_object('ok', true, 'user_id', p_user_id);
end; $$;

create or replace function public.charge_tokens(
  p_user_id uuid, p_amount numeric, p_reason text default null,
  p_idempotency_key text default null, p_metadata jsonb default '{}'::jsonb,
  p_project_id uuid default null, p_conversation_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_remaining numeric; v_op text; v_balance_after numeric;
begin
  v_op := nullif(trim(coalesce(p_idempotency_key, '')), '');
  perform public.ensure_user_profile(p_user_id, null);
  if v_op is not null and exists (select 1 from public.credit_events where operation_id = v_op) then
    select credits_remaining into v_remaining from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', true, 'success', true, 'charged', false, 'remaining', coalesce(v_remaining,0), 'idempotent', true);
  end if;
  if p_amount is null or p_amount <= 0 then
    select credits_remaining into v_remaining from public.profiles where id = p_user_id;
    return jsonb_build_object('ok', false, 'success', false, 'error', 'invalid_amount', 'remaining', coalesce(v_remaining,0));
  end if;
  select credits_remaining into v_remaining from public.profiles where id = p_user_id for update;
  if v_remaining is null then return jsonb_build_object('ok', false, 'error', 'profile_missing'); end if;
  if v_remaining < p_amount then
    return jsonb_build_object('ok', false, 'error', 'insufficient_credits', 'remaining', v_remaining);
  end if;
  v_balance_after := round(v_remaining - p_amount, 1);
  update public.profiles set credits_remaining = v_balance_after,
    credits_used = round(coalesce(credits_used,0)+p_amount,1), updated_at = now() where id = p_user_id;
  insert into public.credit_events (user_id, operation_id, amount, balance_after, reason, project_id, conversation_id, metadata, model_id, credits_consumed, event_type, status)
  values (p_user_id, v_op, p_amount, v_balance_after, coalesce(p_reason,'AI usage'), p_project_id, p_conversation_id, coalesce(p_metadata,'{}'::jsonb),
    coalesce(p_metadata->>'model_id','unknown'), p_amount, 'generation', 'finalized');
  return jsonb_build_object('ok', true, 'success', true, 'charged', true, 'remaining', v_balance_after, 'idempotent', false);
end; $$;

create or replace function public.charge_credits(p_user_id uuid, p_amount integer, p_reason text, p_idempotency_key text, p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return public.charge_tokens(p_user_id, p_amount::numeric, p_reason, p_idempotency_key, p_metadata,
    nullif(p_metadata->>'project_id','')::uuid, nullif(p_metadata->>'conversation_id','')::uuid);
end; $$;

create or replace function public.dreamos_debug_credit_rpc() returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  return jsonb_build_object(
    'charge_tokens_signatures', coalesce((select jsonb_agg(jsonb_build_object('args', pg_get_function_identity_arguments(p.oid)))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='charge_tokens'), '[]'::jsonb),
    'ensure_user_profile_signatures', coalesce((select jsonb_agg(jsonb_build_object('args', pg_get_function_identity_arguments(p.oid)))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' and p.proname='ensure_user_profile'), '[]'::jsonb)
  );
end; $$;

revoke execute on function public.ensure_user_profile(uuid, text) from public, anon;
grant execute on function public.ensure_user_profile(uuid, text) to authenticated, service_role;
revoke execute on function public.charge_tokens(uuid, numeric, text, text, jsonb, uuid, uuid) from public, anon;
grant execute on function public.charge_tokens(uuid, numeric, text, text, jsonb, uuid, uuid) to authenticated, service_role;
revoke execute on function public.charge_credits(uuid, integer, text, text, jsonb) from public, anon;
grant execute on function public.charge_credits(uuid, integer, text, text, jsonb) to authenticated, service_role;
revoke execute on function public.dreamos_debug_credit_rpc() from public, anon;
grant execute on function public.dreamos_debug_credit_rpc() to authenticated, service_role;

alter table public.app_files add column if not exists mime_type text default 'text/plain';
alter table public.app_files add column if not exists size_bytes bigint default 0;
alter table public.app_files add column if not exists source text default 'generated';

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_user_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.admin_pending_confirmations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  admin_id uuid not null,
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  otp_hash text not null
);
create table if not exists public.dreamos_diagnostic_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  severity text not null,
  source text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb
);
drop view if exists public.runtime_diagnostics;
create or replace view public.runtime_diagnostics as select * from public.dreamos_diagnostic_logs;
grant select on public.admin_audit_logs to service_role, authenticated, anon;
grant select, insert on public.admin_audit_logs to service_role;
grant select on public.admin_pending_confirmations to service_role, authenticated, anon;
grant insert, update on public.admin_pending_confirmations to service_role;
grant select on public.runtime_diagnostics to service_role, authenticated, anon;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
