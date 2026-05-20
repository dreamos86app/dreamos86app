-- DreamOS86 — Idempotent token charges + grants (money-safe)

alter table public.token_ledger add column if not exists idempotency_key text;

create unique index if not exists token_ledger_user_idempotency_unique
  on public.token_ledger (user_id, idempotency_key)
  where idempotency_key is not null;

-- Extend token_ledger sources for subscriptions
alter table public.token_ledger drop constraint if exists token_ledger_source_check;
alter table public.token_ledger add constraint token_ledger_source_check check (
  source in (
    'admin_grant',
    'monthly_reset',
    'purchase',
    'ai_usage',
    'refund',
    'adjustment',
    'subscription_renewal'
  )
);

-- Idempotent consume: skip double-charge on same operation_id
create or replace function public.consume_credits(
  p_user_id uuid,
  p_amount integer,
  p_operation_id text,
  p_model_id text,
  p_conversation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_remaining integer;
  caller uuid;
begin
  caller := auth.uid();
  if caller is not null and caller <> p_user_id then
    return jsonb_build_object('success', false, 'error', 'forbidden', 'remaining', 0);
  end if;

  if exists (
    select 1 from public.credit_events where operation_id = p_operation_id
  ) then
    select credits_remaining into current_remaining
      from public.profiles where id = p_user_id;
    return jsonb_build_object(
      'success', true,
      'remaining', coalesce(current_remaining, 0),
      'idempotent', true
    );
  end if;

  select credits_remaining into current_remaining
    from public.profiles
    where id = p_user_id
    for update;

  if current_remaining is null then
    return jsonb_build_object('success', false, 'error', 'profile_missing', 'remaining', 0);
  end if;

  if current_remaining < p_amount then
    return jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'remaining', current_remaining
    );
  end if;

  update public.profiles
    set credits_remaining = current_remaining - p_amount
    where id = p_user_id;

  insert into public.credit_events (
    user_id, operation_id, model_id, credits_consumed, event_type, conversation_id
  )
  values (
    p_user_id, p_operation_id, p_model_id, p_amount, 'generation', p_conversation_id
  );

  perform public.record_token_ledger(
    p_user_id,
    p_amount,
    'ai_usage',
    'AI generation',
    null,
    jsonb_build_object(
      'model_id', p_model_id,
      'operation_id', p_operation_id,
      'conversation_id', p_conversation_id
    )
  );

  return jsonb_build_object('success', true, 'remaining', current_remaining - p_amount);
end;
$$;

-- charge_tokens — idempotent debit with ledger row
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
declare
  v_remaining integer;
  v_existing int;
begin
  if p_amount < 1 then
    return jsonb_build_object('success', false, 'error', 'invalid_amount');
  end if;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    select 1 into v_existing
      from public.token_ledger
      where user_id = p_user_id
        and idempotency_key = p_idempotency_key
      limit 1;
    if found then
      select credits_remaining into v_remaining from public.profiles where id = p_user_id;
      return jsonb_build_object(
        'success', true,
        'remaining', coalesce(v_remaining, 0),
        'idempotent', true
      );
    end if;
  end if;

  select credits_remaining into v_remaining
    from public.profiles
    where id = p_user_id
    for update;

  if v_remaining is null then
    return jsonb_build_object('success', false, 'error', 'profile_missing');
  end if;

  if v_remaining < p_amount then
    return jsonb_build_object(
      'success', false,
      'error', 'insufficient_tokens',
      'remaining', v_remaining
    );
  end if;

  update public.profiles
    set credits_remaining = v_remaining - p_amount
    where id = p_user_id;

  insert into public.token_ledger (
    user_id, amount, reason, source, admin_user_id, metadata, idempotency_key
  )
  values (
    p_user_id,
    p_amount,
    coalesce(p_reason, 'Token charge'),
    'ai_usage',
    null,
    coalesce(p_metadata, '{}'::jsonb),
    nullif(trim(p_idempotency_key), '')
  );

  return jsonb_build_object('success', true, 'remaining', v_remaining - p_amount);
end;
$$;

-- grant_tokens — idempotent credit with ledger row
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
begin
  if p_amount < 1 then
    return jsonb_build_object('success', false, 'error', 'invalid_amount');
  end if;

  if p_idempotency_key is not null and length(trim(p_idempotency_key)) > 0 then
    if exists (
      select 1 from public.token_ledger
      where user_id = p_user_id and idempotency_key = p_idempotency_key
    ) then
      select credits_remaining into v_remaining from public.profiles where id = p_user_id;
      return jsonb_build_object(
        'success', true,
        'remaining', coalesce(v_remaining, 0),
        'idempotent', true
      );
    end if;
  end if;

  select credits_remaining into v_remaining
    from public.profiles
    where id = p_user_id
    for update;

  if v_remaining is null then
    return jsonb_build_object('success', false, 'error', 'profile_missing');
  end if;

  update public.profiles
    set credits_remaining = v_remaining + p_amount
    where id = p_user_id;

  insert into public.token_ledger (
    user_id, amount, reason, source, admin_user_id, metadata, idempotency_key
  )
  values (
    p_user_id,
    -p_amount,
    coalesce(p_reason, 'Token grant'),
    coalesce(p_source, 'adjustment'),
    null,
    coalesce(p_metadata, '{}'::jsonb),
    nullif(trim(p_idempotency_key), '')
  );

  return jsonb_build_object('success', true, 'remaining', v_remaining + p_amount);
end;
$$;

revoke execute on function public.charge_tokens(uuid, integer, text, text, jsonb) from public, anon;
grant execute on function public.charge_tokens(uuid, integer, text, text, jsonb) to service_role;

revoke execute on function public.grant_tokens(uuid, integer, text, text, jsonb, text) from public, anon;
grant execute on function public.grant_tokens(uuid, integer, text, text, jsonb, text) to service_role;
