-- Canonical charge_tokens (numeric) — supports Discuss 0.4 Build Credits.
-- Drops conflicting overloads and reloads PostgREST schema cache.

do $$
declare
  r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'charge_tokens'
  loop
    execute format('drop function if exists %I.%I(%s) cascade', r.nspname, r.proname, r.args);
  end loop;
end $$;

alter table public.profiles
  alter column credits_remaining type numeric(12, 1)
  using round(coalesce(credits_remaining, 0)::numeric, 1);

alter table public.credit_events
  alter column credits_consumed type numeric(12, 1)
  using round(coalesce(credits_consumed, 0)::numeric, 1);

alter table public.credit_events
  alter column amount type numeric(12, 1)
  using round(coalesce(amount, 0)::numeric, 1);

alter table public.credit_events
  alter column balance_after type numeric(12, 1)
  using round(coalesce(balance_after, 0)::numeric, 1);

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

revoke execute on function public.charge_tokens(uuid, numeric, text, text, jsonb, uuid, uuid) from public, anon;
grant execute on function public.charge_tokens(uuid, numeric, text, text, jsonb, uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
