-- Runtime health RPCs, charge_credits compat wrapper, Paddle unlinked webhook storage.

-- Paddle / admin: allow billing_events without a linked user (simulation, signature audit).
alter table public.billing_events
  alter column user_id drop not null;

-- charge_credits → canonical charge_tokens (numeric).
create or replace function public.charge_credits(
  p_user_id uuid,
  p_amount numeric,
  p_reason text default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_project_id uuid default null,
  p_conversation_id uuid default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.charge_tokens(
    p_user_id,
    p_amount,
    p_reason,
    p_idempotency_key,
    p_metadata,
    p_project_id,
    p_conversation_id
  );
$$;

revoke all on function public.charge_credits(uuid, numeric, text, text, jsonb, uuid, uuid) from public;
grant execute on function public.charge_credits(uuid, numeric, text, text, jsonb, uuid, uuid) to authenticated, service_role;

-- Optional onboarding RPC (idempotent).
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

-- Referral reward RPC (idempotent when already rewarded).
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
  if p_credits < 1 then
    return jsonb_build_object('success', false, 'error', 'invalid_amount');
  end if;

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
