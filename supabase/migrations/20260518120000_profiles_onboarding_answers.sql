-- Persist structured onboarding answers on the profile row (JSON).
alter table public.profiles
  add column if not exists onboarding_answers jsonb not null default '{}'::jsonb;
