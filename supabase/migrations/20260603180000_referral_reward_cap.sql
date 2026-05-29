-- Referral reward cap: referrer max 5 rewarded referrals; referred user always eligible once.

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
  v_referrer_rewarded_count integer;
  v_grant_referrer boolean := true;
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

  if v_referral.status in ('rewarded', 'capped') then
    return jsonb_build_object('success', true, 'already_rewarded', true);
  end if;

  if v_referral.referrer_id = p_referred_id then
    return jsonb_build_object('success', false, 'error', 'self_referral');
  end if;

  select count(*)::integer into v_referrer_rewarded_count
  from public.referrals
  where referrer_id = v_referral.referrer_id
    and status in ('rewarded', 'capped')
    and id <> v_referral.id;

  if v_referrer_rewarded_count >= 5 then
    v_grant_referrer := false;
  end if;

  v_key_referrer := 'referral_referrer_bonus:' || v_referral.id::text;
  v_key_referred := 'referral_referred_bonus:' || v_referral.id::text;

  update public.referrals
  set status = case when v_grant_referrer then 'rewarded' else 'capped' end,
      rewarded_at = now(),
      reward_kind = 'build_credits',
      reward_amount = p_credits
  where id = v_referral.id and status not in ('rewarded', 'capped');

  update public.profiles
  set credits_remaining = credits_remaining + p_credits
  where id = p_referred_id;

  if v_grant_referrer then
    update public.profiles
    set credits_remaining = credits_remaining + p_credits,
        total_referrals = coalesce(total_referrals, 0) + 1
    where id = v_referral.referrer_id;

    insert into public.token_ledger (user_id, amount, reason, source, idempotency_key, metadata)
    values
      (v_referral.referrer_id, -p_credits, 'Referral reward (inviter)', 'referral', v_key_referrer,
        jsonb_build_object('referral_id', v_referral.id, 'role', 'referrer'))
    on conflict do nothing;

    insert into public.credit_events (user_id, operation_id, model_id, credits_consumed, event_type, metadata)
    values
      (v_referral.referrer_id, v_key_referrer, 'system', -p_credits, 'grant',
        jsonb_build_object('referral_id', v_referral.id, 'kind', 'referral_referrer_bonus'))
    on conflict do nothing;

    insert into public.referral_rewards (referral_id, user_id, role, credits, idempotency_key)
    values
      (v_referral.id, v_referral.referrer_id, 'referrer', p_credits, v_key_referrer)
    on conflict (idempotency_key) do nothing;
  end if;

  insert into public.token_ledger (user_id, amount, reason, source, idempotency_key, metadata)
  values
    (p_referred_id, -p_credits, 'Referral welcome bonus', 'referral', v_key_referred,
      jsonb_build_object('referral_id', v_referral.id, 'role', 'referred'))
  on conflict do nothing;

  insert into public.credit_events (user_id, operation_id, model_id, credits_consumed, event_type, metadata)
  values
    (p_referred_id, v_key_referred, 'system', -p_credits, 'grant',
      jsonb_build_object('referral_id', v_referral.id, 'kind', 'referral_referred_bonus'))
  on conflict do nothing;

  insert into public.referral_rewards (referral_id, user_id, role, credits, idempotency_key)
  values
    (v_referral.id, p_referred_id, 'referred', p_credits, v_key_referred)
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object(
    'success', true,
    'credits_granted', p_credits,
    'referrer_rewarded', v_grant_referrer,
    'referrer_capped', not v_grant_referrer
  );
exception
  when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.claim_referral_reward(uuid, integer) to authenticated, service_role;
