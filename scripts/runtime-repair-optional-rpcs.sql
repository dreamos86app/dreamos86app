-- Optional RPCs + admin visibility (does not replace charge_tokens / ensure_user_profile from critical repair)

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
        'returns', pg_get_function_result(p.oid)
      ) order by pg_get_function_identity_arguments(p.oid))
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'ensure_user_profile'
    ), '[]'::jsonb),
    'grant_tokens_signatures', coalesce((
      select jsonb_agg(jsonb_build_object('args', pg_get_function_identity_arguments(p.oid)))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'grant_tokens'
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.dreamos_debug_credit_rpc() from public, anon;
grant execute on function public.dreamos_debug_credit_rpc() to authenticated, service_role;

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
